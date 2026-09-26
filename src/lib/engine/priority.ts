import type { AssignmentView, CampusContext, FixedBlock } from "../context/campusContext";
import { formatDuration, fromMinutes } from "../time";

/**
 * Priority Engine — 정량적 우선순위 계산.
 *
 *   Raw Data → Campus Context → Priority Engine(여기, 코드) → LLM(자연어 설명)
 *
 * LLM 은 순위를 정하지 않는다. 이 파일이 만든 score / factors 를 설명만 한다.
 * 각 요인의 점수는 factors 로 그대로 노출되어 "왜 이 순위인가"를 추적할 수 있다.
 *
 * 과제 점수 (최대 100)
 *   마감 임박도   0~50   (지남 50 · 6h 45 · 24h 38 · 48h 30 · 72h 22 · 7d 12 · 그 외 4)
 *   시간 부족     +10    남은 시간 < 예상 소요시간
 *   중요도        3/8/14/20
 *   예상 소요     1~10   (72시간 이내 마감일 때만 전액, 그 외 절반)
 *   진행 중       +4
 *   완료          제외
 *
 * 고정 일정(수업/약속) 점수
 *   고정 일정      15
 *   시작 임박도    진행 중 35 · 1h 30 · 3h 20 · 그 외 8
 *   이동 필요      +10  (이동 15분 이상)
 *   수업(출석)     +5
 *   이미 끝남      제외
 */

export type PriorityKind = "assignment" | "class" | "event";

export interface PriorityFactor {
  label: string;
  points: number;
}

export interface PriorityItem {
  id: string;
  kind: PriorityKind;
  refId: string;
  title: string;
  score: number;
  factors: PriorityFactor[];
  /** 코드가 생성한 근거 문장 (AI 설명이 없을 때 그대로 사용) */
  reason: string;
  /** 카드에 보여줄 핵심 수치들 */
  facts: string[];
}

function urgencyPoints(minutesLeft: number): PriorityFactor {
  const h = minutesLeft / 60;
  if (minutesLeft < 0) return { label: "마감 지남", points: 50 };
  if (h <= 6) return { label: "6시간 이내 마감", points: 45 };
  if (h <= 24) return { label: "24시간 이내 마감", points: 38 };
  if (h <= 48) return { label: "48시간 이내 마감", points: 30 };
  if (h <= 72) return { label: "3일 이내 마감", points: 22 };
  if (h <= 24 * 7) return { label: "일주일 이내 마감", points: 12 };
  return { label: "마감 여유", points: 4 };
}

const IMPORTANCE_POINTS = { 1: 3, 2: 8, 3: 14, 4: 20 } as const;
const IMPORTANCE_TEXT = { 1: "중요도 낮음", 2: "중요도 보통", 3: "중요도 높음", 4: "중요도 매우 높음" } as const;

function effortPoints(est: number): number {
  if (est >= 120) return 10;
  if (est >= 60) return 6;
  if (est >= 30) return 3;
  return 1;
}

export function scoreAssignment(a: AssignmentView): PriorityItem {
  const factors: PriorityFactor[] = [];
  factors.push(urgencyPoints(a.minutesLeft));
  if (a.minutesLeft >= 0 && a.minutesLeft < a.estimatedMinutes) {
    factors.push({ label: "남은 시간보다 작업량이 많음", points: 10 });
  }
  factors.push({ label: IMPORTANCE_TEXT[a.importance], points: IMPORTANCE_POINTS[a.importance] });
  const eff = effortPoints(a.estimatedMinutes);
  const within72 = a.minutesLeft <= 72 * 60;
  factors.push({
    label: `예상 소요 ${formatDuration(a.estimatedMinutes)}`,
    points: within72 ? eff : Math.floor(eff / 2),
  });
  if (a.status === "in_progress") factors.push({ label: "이미 진행 중", points: 4 });

  const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  const leftText = a.overdue ? a.due.text : `마감까지 ${formatDuration(a.minutesLeft)}`;
  return {
    id: `assignment:${a.id}`,
    kind: "assignment",
    refId: a.id,
    title: a.title,
    score,
    factors,
    reason: buildReason(factors),
    facts: [leftText, `예상 소요 ${formatDuration(a.estimatedMinutes)}`, a.subject].filter(Boolean),
  };
}

export function scoreFixedBlock(b: FixedBlock, nowMinutes: number): PriorityItem | null {
  if (b.end <= nowMinutes) return null;
  const factors: PriorityFactor[] = [{ label: "시간이 고정된 일정", points: 15 }];
  const until = b.start - nowMinutes;
  if (until <= 0) factors.push({ label: "지금 진행 중", points: 35 });
  else if (until <= 60) factors.push({ label: "1시간 이내 시작", points: 30 });
  else if (until <= 180) factors.push({ label: "3시간 이내 시작", points: 20 });
  else factors.push({ label: "오늘 예정", points: 8 });
  if (b.travel.minutes >= 15 && b.departAt !== null) {
    factors.push({ label: `이동 필요 (${fromMinutes(b.departAt)} 출발)`, points: 10 });
  }
  if (b.kind === "class") factors.push({ label: "수업 출석", points: 5 });

  const facts = [`${fromMinutes(b.start)} ~ ${fromMinutes(b.end)}`];
  if (b.location) facts.push(b.location);
  if (b.departAt !== null && b.travel.minutes > 0) {
    facts.push(`${fromMinutes(b.departAt)}까지 출발 권장 (이동 ${b.travel.minutes}분${b.travel.source === "estimate" ? " 추정" : ""})`);
  }
  return {
    id: b.id,
    kind: b.kind,
    refId: b.refId,
    title: b.title,
    score: Math.min(100, factors.reduce((s, f) => s + f.points, 0)),
    factors,
    reason: buildReason(factors),
    facts,
  };
}

function buildReason(factors: PriorityFactor[]): string {
  const top = [...factors].sort((a, b) => b.points - a.points).slice(0, 3).map((f) => f.label);
  return top.join(" · ");
}

export interface PriorityResult {
  items: PriorityItem[];
  /** 전체 후보 (디버깅/AI 컨텍스트용) */
  all: PriorityItem[];
}

/** 오늘의 우선순위 3~5개 */
export function computePriorities(ctx: CampusContext, limit = 5): PriorityResult {
  const all = [
    ...ctx.openAssignments.map(scoreAssignment),
    ...ctx.todayBlocks.map((b) => scoreFixedBlock(b, ctx.now.minutes)).filter((x): x is PriorityItem => x !== null),
  ].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return { items: all.slice(0, limit), all };
}
