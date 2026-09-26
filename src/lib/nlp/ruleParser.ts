import type { ParseOutput } from "../ai/schemas";
import { guessCategory } from "./resolve";

/**
 * 규칙 기반 한국어 파서 — AI 를 쓸 수 없을 때(키 없음, API 실패, 응답 검증 실패)의 폴백.
 * LLM 과 같은 ParseOutput 형식을 반환하므로 이후 처리(resolve.ts)는 동일하다.
 * 흔한 표현(요일/오늘·내일/M월 D일, N시·오후 N시 반·HH:mm, N시간 M분)만 다룬다.
 */

const WEEKDAYS = "일월화수목금토";
const KOREAN_NUM: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6 };
const ASSIGNMENT_RE = /과제|레포트|리포트|보고서|숙제|제출|에세이|독후감|발표\s*자료/;
const EVENT_KEYWORDS = /풋살|축구|농구|야구|헬스|운동|러닝|수영|요가|클라이밍|배드민턴|테니스|동아리|정기\s*회의|스터디|세미나|특강|약속|미팅|알바|병원|면담|회식|모임|데이트|시험/;

interface TimeHit {
  minutes: number;
  ambiguous: boolean;
  index: number;
  hasPrefix: boolean;
}

function findTimes(text: string): TimeHit[] {
  const hits: TimeHit[] = [];
  const colon = /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g;
  for (const m of text.matchAll(colon)) {
    hits.push({ minutes: Number(m[1]) * 60 + Number(m[2]), ambiguous: false, index: m.index ?? 0, hasPrefix: true });
  }
  const re = /(오전|오후|아침|점심|저녁|밤|새벽)?\s*(\d{1,2})\s*시(?!간)\s*(?:(\d{1,2})\s*분|(반))?/g;
  for (const m of text.matchAll(re)) {
    let h = Number(m[2]);
    const min = m[4] ? 30 : m[3] ? Number(m[3]) : 0;
    if (h > 24 || min > 59) continue;
    const prefix = m[1];
    let ambiguous = false;
    if (prefix === "오후" || prefix === "저녁" || prefix === "밤") {
      if (h < 12) h += 12;
    } else if (prefix === "점심") {
      if (h < 5) h += 12;
    } else if (prefix === "오전" || prefix === "아침" || prefix === "새벽") {
      if (h === 12) h = 0;
    } else if (h >= 1 && h <= 7) {
      // 대학생 일정에서 "6시"는 대부분 저녁 — 오후로 해석하고 사용자에게 알린다
      h += 12;
      ambiguous = true;
    } else if (h >= 8 && h <= 11) {
      ambiguous = true;
    }
    hits.push({ minutes: h * 60 + min, ambiguous, index: m.index ?? 0, hasPrefix: Boolean(prefix) });
  }
  return hits.sort((a, b) => a.index - b.index);
}

function toHHmm(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function findDuration(text: string): number | null {
  const num = /(\d+(?:\.\d+)?|한|두|세|네|다섯|여섯)\s*시간(?:\s*(\d+)\s*분)?/.exec(text);
  if (num) {
    const h = KOREAN_NUM[num[1]] ?? Number(num[1]);
    return Math.round(h * 60 + (num[2] ? Number(num[2]) : 0));
  }
  if (/반\s*시간/.test(text)) return 30;
  const mins = /(\d+)\s*분\s*(?:정도|쯤|가량|걸|소요|이면)/.exec(text);
  return mins ? Number(mins[1]) : null;
}

export function parseKorean(text: string, subjects: string[] = []): ParseOutput {
  const t = text.trim();
  const out: ParseOutput = {
    kind: "unknown",
    title: "",
    subject: "",
    dateType: "none",
    weekday: null,
    weekOffset: null,
    relativeDays: null,
    month: null,
    day: null,
    startTime: null,
    endTime: null,
    dueTime: null,
    estimatedMinutes: null,
    importance: null,
    category: null,
    location: null,
    timeAmbiguous: false,
  };

  // 날짜
  const abs = /(\d{1,2})\s*월\s*(\d{1,2})\s*일|(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/.exec(t);
  const wd = /(이번\s*주|다음\s*주|담주|다다음\s*주)?\s*([월화수목금토일])요일/.exec(t);
  const rel = /(오늘|내일|모레|글피)/.exec(t);
  if (abs) {
    out.dateType = "absolute";
    out.month = Number(abs[1] ?? abs[3]);
    out.day = Number(abs[2] ?? abs[4]);
  } else if (wd) {
    out.dateType = "weekday";
    out.weekday = WEEKDAYS.indexOf(wd[2]);
    const w = (wd[1] ?? "").replace(/\s/g, "");
    out.weekOffset = w === "다음주" || w === "담주" ? 1 : w === "다다음주" ? 2 : 0;
  } else if (rel) {
    out.dateType = "relative";
    out.relativeDays = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }[rel[1]] ?? 0;
  }

  const isAssignment = ASSIGNMENT_RE.test(t);
  const times = findTimes(t);
  const duration = findDuration(t);
  const location = /([가-힣A-Za-z0-9]+?)에서/.exec(t)?.[1] ?? null;
  if (/매우\s*중요|엄청\s*중요|아주\s*중요|꼭|반드시/.test(t)) out.importance = 4;
  else if (/중요/.test(t)) out.importance = 3;

  if (isAssignment) {
    out.kind = "assignment";
    const subject = subjects.find((s) => s && t.includes(s)) ?? /([가-힣A-Za-z0-9]+)\s*(?:과제|레포트|리포트|보고서|숙제)/.exec(t)?.[1] ?? "";
    out.subject = subject;
    const kind = ASSIGNMENT_RE.exec(t)?.[0] ?? "과제";
    out.title = subject ? `${subject} ${kind === "제출" ? "과제" : kind}` : kind;
    if (times[0]) out.dueTime = toHHmm(times[0].minutes);
    out.estimatedMinutes = duration;
    return out;
  }

  const eventKw = EVENT_KEYWORDS.exec(t)?.[0];
  if (eventKw || times.length > 0 || out.dateType !== "none") {
    out.kind = "event";
    if (eventKw) {
      out.title = /친구/.test(t) && eventKw === "약속" ? "친구 약속" : eventKw.replace(/\s/g, "");
    } else {
      // 날짜/시간/조사 표현을 걷어낸 나머지를 제목으로
      out.title = t
        .replace(/(이번\s*주|다음\s*주|다다음\s*주)?\s*[월화수목금토일]요일|오늘|내일|모레|글피|\d{1,2}\s*월\s*\d{1,2}\s*일/g, "")
        .replace(/(오전|오후|아침|점심|저녁|밤|새벽)?\s*\d{1,2}\s*시(\s*\d{1,2}\s*분|\s*반)?(부터|까지|에)?|\d{1,2}:\d{2}/g, "")
        .replace(/[가-힣A-Za-z0-9]+에서/g, "")
        .replace(/(있어|있음|있다|있어요|잡혔어|예정|이야|일정|해야\s*돼|해야\s*함)[.!~]*$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 30);
    }
    if (times[0]) {
      out.startTime = toHHmm(times[0].minutes);
      out.timeAmbiguous = times[0].ambiguous;
    }
    if (times[1]) {
      let end = times[1].minutes;
      // "오후 6시부터 8시까지" → 두 번째 시간에 접두어가 없으면 시작 시각 기준으로 해석
      if (!times[1].hasPrefix && end <= times[0].minutes && end + 12 * 60 <= 24 * 60) end += 12 * 60;
      if (!times[1].hasPrefix && end - 12 * 60 > times[0].minutes) end -= 12 * 60;
      out.endTime = toHHmm(end);
    } else if (duration && times[0]) {
      out.endTime = toHHmm(Math.min(24 * 60, times[0].minutes + duration));
    }
    out.location = location;
    out.category = guessCategory(t);
    if (!out.title) out.title = "새 일정";
  }
  return out;
}
