import { toDraft, type ParsedDraft } from "../src/lib/nlp/resolve";
import { parseKorean } from "../src/lib/nlp/ruleParser";

/**
 * 자연어 입력 코퍼스. 기준일: 2026-09-26 (토).
 * expect 에 적은 필드만 비교한다. 기대값은 사람이 직접 판단해 적었다.
 */
export const CORPUS_TODAY = "2026-09-26";
export const CORPUS_SUBJECTS = ["자료구조", "운영체제", "컴퓨터 네트워크", "선형대수", "알고리즘", "데이터베이스", "글쓰기"];

type Expect =
  | { kind: "event"; date?: string; startTime?: string; endTime?: string; category?: string; location?: string; title?: string }
  | { kind: "assignment"; dueDate?: string; dueTime?: string; estimatedMinutes?: number; importance?: number; subject?: string; title?: string }
  | { kind: "unknown" };

export const CORPUS: { text: string; expect: Expect }[] = [
  // 일정
  { text: "금요일 6시에 친구들이랑 풋살 있어", expect: { kind: "event", date: "2026-10-02", startTime: "18:00", category: "exercise", title: "풋살" } },
  { text: "내일 오후 3시부터 5시까지 도서관에서 스터디", expect: { kind: "event", date: "2026-09-27", startTime: "15:00", endTime: "17:00", location: "도서관" } },
  { text: "10월 3일 18:30 동아리 정기회의", expect: { kind: "event", date: "2026-10-03", startTime: "18:30", category: "club" } },
  { text: "모레 저녁 7시 동아리 회식", expect: { kind: "event", date: "2026-09-28", startTime: "19:00", category: "club" } },
  { text: "다음주 월요일 오전 10시 교수님 면담", expect: { kind: "event", date: "2026-09-28", startTime: "10:00", category: "school" } },
  { text: "오늘 밤 9시 헬스", expect: { kind: "event", date: "2026-09-26", startTime: "21:00", category: "exercise" } },
  { text: "화요일 12시 반에 친구랑 점심 약속", expect: { kind: "event", date: "2026-09-29", startTime: "12:30", category: "appointment" } },
  { text: "내일 2시 팀플 회의 학생회관에서", expect: { kind: "event", date: "2026-09-27", startTime: "14:00", location: "학생회관", category: "school" } },
  { text: "수요일 7시~9시 알바", expect: { kind: "event", date: "2026-09-30", startTime: "19:00", endTime: "21:00", category: "personal" } },
  { text: "10/5 오후 1시 병원", expect: { kind: "event", date: "2026-10-05", startTime: "13:00", category: "personal" } },
  { text: "다음 주 목요일 저녁 6시 반 데이트", expect: { kind: "event", date: "2026-10-01", startTime: "18:30", category: "appointment" } },
  { text: "내일 아침 8시 조깅", expect: { kind: "event", date: "2026-09-27", startTime: "08:00", category: "exercise" } },
  { text: "금요일 18시 축구", expect: { kind: "event", date: "2026-10-02", startTime: "18:00", category: "exercise" } },
  { text: "오늘 4시에 카페에서 과외", expect: { kind: "event", date: "2026-09-26", startTime: "16:00", location: "카페", category: "personal" } },
  { text: "월요일 3시 반부터 2시간 동안 세미나", expect: { kind: "event", date: "2026-09-28", startTime: "15:30", endTime: "17:30", category: "school" } },
  { text: "12일 오후 2시 시험", expect: { kind: "event", date: "2026-10-12", startTime: "14:00", category: "school" } },
  { text: "토요일 7시에 친구 생일파티", expect: { kind: "event", date: "2026-09-26", startTime: "19:00", category: "appointment" } },
  { text: "내일 오전 9시 보강", expect: { kind: "event", date: "2026-09-27", startTime: "09:00", category: "school" } },
  { text: "일요일 오후 두시 교회", expect: { kind: "event", date: "2026-09-27", startTime: "14:00" } },
  { text: "다음주 화요일 11시 반 병원 예약", expect: { kind: "event", date: "2026-09-29", startTime: "11:30", category: "personal" } },
  // 과제
  { text: "자료구조 과제 다음주 수요일까지고 2시간 정도 걸릴 것 같아", expect: { kind: "assignment", dueDate: "2026-09-30", dueTime: "23:59", estimatedMinutes: 120, subject: "자료구조" } },
  { text: "네트워크 보고서 금요일 오후 6시 마감 1시간 30분 걸림", expect: { kind: "assignment", dueDate: "2026-10-02", dueTime: "18:00", estimatedMinutes: 90 } },
  { text: "운영체제 레포트 내일까지", expect: { kind: "assignment", dueDate: "2026-09-27", dueTime: "23:59", subject: "운영체제" } },
  { text: "선형대수 숙제 월요일 9시까지 3시간", expect: { kind: "assignment", dueDate: "2026-09-28", dueTime: "09:00", estimatedMinutes: 180, subject: "선형대수" } },
  { text: "알고리즘 과제 10월 10일 자정까지 꼭 제출", expect: { kind: "assignment", dueDate: "2026-10-10", dueTime: "23:59", importance: 4 } },
  { text: "글쓰기 에세이 모레 오후 5시까지, 한 시간 반 정도", expect: { kind: "assignment", dueDate: "2026-09-28", dueTime: "17:00", estimatedMinutes: 90, subject: "글쓰기" } },
  { text: "데이터베이스 과제 오늘 밤 11시까지 40분이면 될 듯", expect: { kind: "assignment", dueDate: "2026-09-26", dueTime: "23:00", estimatedMinutes: 40 } },
  { text: "경제학원론 독후감 다다음주 월요일까지", expect: { kind: "assignment", dueDate: "2026-10-05" } },
  { text: "확률과 통계 과제 이번주 일요일까지 매우 중요", expect: { kind: "assignment", dueDate: "2026-09-27", importance: 4 } },
  { text: "심리학 발표 자료 목요일까지 2시간 30분", expect: { kind: "assignment", dueDate: "2026-10-01", estimatedMinutes: 150 } },
  { text: "캡스톤 보고서 제출 금요일 23:59", expect: { kind: "assignment", dueDate: "2026-10-02", dueTime: "23:59" } },
  { text: "과제 제출 내일 오전 10시", expect: { kind: "assignment", dueDate: "2026-09-27", dueTime: "10:00" } },
  { text: "컴퓨터 네트워크 과제 다음주 금요일 정오까지", expect: { kind: "assignment", dueDate: "2026-10-02", dueTime: "12:00", subject: "컴퓨터 네트워크" } },
  { text: "수요일까지 알고리즘 문제 5개 풀기 두 시간", expect: { kind: "assignment", dueDate: "2026-09-30", estimatedMinutes: 120 } },
  // 해석 불가
  { text: "안녕", expect: { kind: "unknown" } },
  { text: "오늘 뭐하지", expect: { kind: "unknown" } },
];

export interface CorpusResult {
  text: string;
  ok: boolean;
  mismatches: string[];
  draft: ParsedDraft;
}

export function evaluateCorpus(): CorpusResult[] {
  return CORPUS.map(({ text, expect }) => {
    const draft = toDraft(parseKorean(text, CORPUS_SUBJECTS), CORPUS_TODAY);
    const mismatches: string[] = [];
    if (draft.kind !== expect.kind) mismatches.push(`kind: ${draft.kind} ≠ ${expect.kind}`);
    else if (draft.kind === "event" && expect.kind === "event") {
      for (const [k, v] of Object.entries(expect)) if (k !== "kind" && (draft.event as Record<string, unknown>)[k] !== v) mismatches.push(`${k}: ${(draft.event as Record<string, unknown>)[k]} ≠ ${v}`);
    } else if (draft.kind === "assignment" && expect.kind === "assignment") {
      for (const [k, v] of Object.entries(expect)) if (k !== "kind" && (draft.assignment as Record<string, unknown>)[k] !== v) mismatches.push(`${k}: ${(draft.assignment as Record<string, unknown>)[k]} ≠ ${v}`);
    }
    return { text, ok: mismatches.length === 0, mismatches, draft };
  });
}
