import type { Assignment, CampusEvent, EventCategory, Importance, ISODate } from "../domain/types";
import type { ParseOutput } from "../ai/schemas";
import { addDays, fromMinutes, toMinutes, weekdayOf } from "../time";

/**
 * 구조화된 "표현"(ParseOutput) → 실제 데이터 초안.
 * LLM/규칙 파서 모두 날짜를 직접 계산하지 않고 dateType 으로 표현만 넘기며, 여기서 코드로 계산한다.
 * LLM 에게 날짜 계산을 맡기지 않기 위한 설계다 (docs/decisions.md D-04).
 */

export type EventDraft = Omit<CampusEvent, "id" | "createdAt" | "updatedAt">;
export type AssignmentDraft = Omit<Assignment, "id" | "createdAt" | "updatedAt">;

export type ParsedDraft =
  | { kind: "event"; event: EventDraft; notes: string[] }
  | { kind: "assignment"; assignment: AssignmentDraft; notes: string[] }
  | { kind: "unknown"; notes: string[] };

type DateSpec = Pick<ParseOutput, "dateType" | "weekday" | "weekOffset" | "relativeDays" | "month" | "day">;

/**
 * - weekday + weekOffset 0 : 오늘 포함 가장 가까운 해당 요일
 * - weekday + weekOffset n : n주 뒤 달력 주(월요일 시작)의 해당 요일  ("다음주 수요일")
 * - relative               : 오늘 + n일
 * - absolute               : 올해 M월 D일, 60일 이상 지난 날짜면 내년
 */
export function resolveDate(spec: DateSpec, today: ISODate): ISODate | null {
  switch (spec.dateType) {
    case "weekday": {
      if (spec.weekday == null || spec.weekday < 0 || spec.weekday > 6) return null;
      const offset = Math.max(0, spec.weekOffset ?? 0);
      const todayWd = weekdayOf(today);
      if (offset === 0) return addDays(today, (spec.weekday - todayWd + 7) % 7);
      const monday = addDays(today, -((todayWd + 6) % 7));
      const idx = (spec.weekday + 6) % 7; // 월=0 … 일=6
      return addDays(monday, 7 * offset + idx);
    }
    case "relative":
      if (spec.relativeDays == null || spec.relativeDays < 0 || spec.relativeDays > 365) return null;
      return addDays(today, spec.relativeDays);
    case "absolute": {
      if (!spec.month || !spec.day || spec.month > 12 || spec.day > 31) return null;
      const year = Number(today.slice(0, 4));
      const make = (y: number) => `${y}-${String(spec.month).padStart(2, "0")}-${String(spec.day).padStart(2, "0")}`;
      const candidate = make(year);
      const [y, m, d] = candidate.split("-").map(Number);
      const check = new Date(Date.UTC(y, m - 1, d));
      if (check.getUTCMonth() !== m - 1) return null; // 2월 30일 등
      return candidate < addDays(today, -60) ? make(year + 1) : candidate;
    }
    default:
      return null;
  }
}

export function normalizeTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const CATEGORY_KEYWORDS: [EventCategory, RegExp][] = [
  ["exercise", /풋살|축구|농구|야구|헬스|운동|러닝|달리기|수영|요가|클라이밍|배드민턴|테니스|탁구/],
  ["club", /동아리|정기\s*회의|정기모임|학회/],
  ["school", /수업|세미나|특강|시험|중간고사|기말고사|학교|조별|팀플|면담|보강/],
  ["appointment", /약속|친구|만나|밥|식사|술|카페|데이트|미팅/],
  ["personal", /병원|은행|알바|아르바이트|개인|미용실|치과/],
];

export function guessCategory(text: string): EventCategory {
  return CATEGORY_KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? "etc";
}

export function toDraft(out: ParseOutput, today: ISODate): ParsedDraft {
  const notes: string[] = [];
  const title = out.title.trim();
  if (out.kind === "unknown" || !title) {
    return { kind: "unknown", notes: ["일정인지 과제인지 판단하지 못했습니다. 조금 더 구체적으로 적어주세요."] };
  }
  const date = resolveDate(out, today);

  if (out.kind === "assignment") {
    const dueDate = date ?? addDays(today, 7);
    if (!date) notes.push("마감일이 없어 일주일 뒤로 설정했습니다.");
    let dueTime = normalizeTime(out.dueTime);
    if (!dueTime) {
      dueTime = "23:59";
      notes.push("마감 시각이 없어 23:59로 설정했습니다.");
    }
    let est = out.estimatedMinutes;
    if (est == null || est <= 0 || est > 60 * 48) {
      est = 60;
      notes.push("예상 소요시간이 없어 1시간으로 설정했습니다.");
    }
    const imp = out.importance && out.importance >= 1 && out.importance <= 4 ? (out.importance as Importance) : 2;
    if (dueDate < today) notes.push("마감일이 이미 지났습니다. 날짜를 확인하세요.");
    return {
      kind: "assignment",
      assignment: { title, subject: out.subject.trim(), dueDate, dueTime, estimatedMinutes: est, importance: imp, status: "todo", memo: "", progress: [] },
      notes,
    };
  }

  const eventDate = date ?? today;
  if (!date) notes.push("날짜가 없어 오늘로 설정했습니다.");
  let start = normalizeTime(out.startTime);
  if (!start) {
    start = "09:00";
    notes.push("시작 시간이 없어 09:00으로 설정했습니다. 확인해주세요.");
  } else if (out.timeAmbiguous) {
    notes.push(`오전/오후가 없어 ${start}로 해석했습니다.`);
  }
  let end = normalizeTime(out.endTime);
  if (!end || toMinutes(end) <= toMinutes(start)) {
    end = fromMinutes(Math.min(24 * 60, toMinutes(start) + 60));
    notes.push("종료 시간이 없어 1시간 일정으로 설정했습니다.");
  }
  const category = out.category ?? guessCategory(title);
  return {
    kind: "event",
    event: { title, date: eventDate, startTime: start, endTime: end, location: out.location?.trim() ?? "", category, memo: "", travelMinutes: null },
    notes,
  };
}
