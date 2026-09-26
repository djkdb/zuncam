import { josa } from "../korean";
import type { CampusContext, FixedBlock } from "../context/campusContext";
import { addDays, diffDays, formatDuration, fromMinutes, overlaps, toMinutes } from "../time";
import type { PriorityItem } from "./priority";

/**
 * 오늘의 행동 계획 — 결정론적 스케줄러.
 * 고정 일정(수업/약속) + 이동 + 식사를 먼저 배치하고, 남는 빈 시간에 과제를 우선순위 순으로 채운다.
 * LLM 은 이 결과의 "설명"만 담당한다 (시간 계산 = 코드).
 */

export type PlanBlockType = "class" | "event" | "travel" | "work" | "meal";

export interface PlanBlock {
  id: string;
  type: PlanBlockType;
  start: number;
  end: number;
  title: string;
  refId: string | null;
  reason: string;
}

export interface UnscheduledWork {
  refId: string;
  title: string;
  neededMinutes: number;
  scheduledMinutes: number;
  dueToday: boolean;
}

export interface ActionPlan {
  windowStart: number;
  windowEnd: number;
  blocks: PlanBlock[];
  workMinutes: number;
  freeMinutes: number;
  unscheduled: UnscheduledWork[];
  warnings: string[];
}

export const PLAN_RULES = {
  /** 이보다 짧은 틈에는 과제를 배치하지 않는다 */
  minSession: 25,
  /** 한 번에 최대 집중 시간 */
  maxSession: 90,
  /** 세션 사이 휴식 */
  breakBetween: 10,
  /** 하루 최대 과제 시간 — 비현실적인 계획 방지 (docs/decisions.md D-06) */
  maxWorkPerDay: 6 * 60,
  /** 계획 시작 시각을 10분 단위로 올림 */
  roundTo: 10,
} as const;

const MEALS = [
  { title: "점심", ideal: [12 * 60, 13 * 60], earliest: 11 * 60 + 30, latest: 14 * 60 },
  { title: "저녁", ideal: [18 * 60, 19 * 60], earliest: 17 * 60 + 30, latest: 20 * 60 },
] as const;

/**
 * 오늘 배치할 분량.
 * 마감이 오늘·내일이거나 지났으면 전부, 그보다 멀면 남은 일수로 나눈 하루 몫만 배치한다.
 * (처음에는 모든 과제를 오늘 전부 배치해서, D-5 과제가 밤 12시까지 채워지는 문제가 있었다 — docs/troubleshooting.md TS-01)
 */
export function todayShare(estimatedMinutes: number, daysLeft: number): number {
  if (daysLeft <= 1) return estimatedMinutes;
  const share = Math.ceil(estimatedMinutes / daysLeft / 10) * 10;
  return Math.min(estimatedMinutes, Math.max(PLAN_RULES.minSession + 5, share));
}

/**
 * 배치 순서 — 우선순위(무엇이 중요한가)와 분리한다.
 * 36시간 안에 마감되는 과제는 마감이 빠른 순(EDF), 마감이 지난 과제, 나머지는 우선순위 점수 순.
 * 점수 순으로만 배치하면 과제를 진행할수록 '예상 소요' 점수가 떨어져 마감 직전에 다른 과제에 밀린다
 * (docs/troubleshooting.md TS-05, 시뮬레이션으로 발견).
 */
export const EDF_HORIZON_MINUTES = 36 * 60;
function scheduleOrder(t: { a: { minutesLeft: number; overdue: boolean }; p: { score: number } }): number {
  if (!t.a.overdue && t.a.minutesLeft <= EDF_HORIZON_MINUTES) return t.a.minutesLeft;
  if (t.a.overdue) return 1_000_000 - t.p.score;
  return 2_000_000 - t.p.score;
}

interface Interval {
  start: number;
  end: number;
}

function subtract(window: Interval, busy: Interval[]): Interval[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const free: Interval[] = [];
  let cursor = window.start;
  for (const b of sorted) {
    if (b.end <= cursor) continue;
    if (b.start >= window.end) break;
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, window.end) });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < window.end) free.push({ start: cursor, end: window.end });
  return free.filter((f) => f.end > f.start);
}

function fixedToPlan(b: FixedBlock): PlanBlock {
  return {
    id: `plan:${b.id}`,
    type: b.kind,
    start: b.start,
    end: b.end,
    title: b.title,
    refId: b.refId,
    reason: b.kind === "class" ? "시간표 수업" : "고정 일정",
  };
}

export function buildActionPlan(ctx: CampusContext, priorities: PriorityItem[]): ActionPlan {
  const { settings, now } = ctx;
  const dayStart = toMinutes(settings.dayStart);
  const windowEnd = toMinutes(settings.dayEnd);
  const roundedNow = Math.ceil(now.minutes / PLAN_RULES.roundTo) * PLAN_RULES.roundTo;
  const windowStart = Math.max(dayStart, roundedNow);

  const blocks: PlanBlock[] = [];
  const busy: Interval[] = [];
  const warnings: string[] = [];

  // 1) 고정 일정 + 이동
  for (const b of ctx.todayBlocks) {
    busy.push({ start: b.start, end: b.end });
    if (b.end > windowStart) blocks.push(fixedToPlan(b));
    if (b.departAt !== null && b.travel.minutes > 0) {
      busy.push({ start: b.departAt, end: b.start });
      if (b.start > windowStart) {
        blocks.push({
          id: `plan:travel:${b.id}`,
          type: "travel",
          start: b.departAt,
          end: b.start,
          title: `${josa(b.title, "으로/로")} 이동`,
          refId: b.refId,
          reason: `이동 ${b.travel.minutes}분${b.travel.source === "estimate" ? "(추정)" : ""} + 여유 ${settings.departureBufferMinutes}분`,
        });
        if (b.departAt >= now.minutes) {
          warnings.push(`'${b.title}' 일정에 늦지 않으려면 ${fromMinutes(b.departAt)}에 출발해야 합니다.`);
        }
      }
    }
  }

  // 2) 식사 — 이상적인 시간이 비어 있으면 그대로, 아니면 30분 단위로 밀어서 찾는다
  if (settings.reserveMeals) {
    for (const meal of MEALS) {
      const len = meal.ideal[1] - meal.ideal[0];
      const candidates = [meal.ideal[0]];
      for (let s = meal.earliest; s + len <= meal.latest; s += 30) if (s !== meal.ideal[0]) candidates.push(s);
      candidates.sort((a, b) => Math.abs(a - meal.ideal[0]) - Math.abs(b - meal.ideal[0]));
      const start = candidates.find(
        (s) => s >= windowStart && s + len <= windowEnd && !busy.some((b) => overlaps(s, s + len, b.start, b.end)),
      );
      if (start !== undefined) {
        busy.push({ start, end: start + len });
        blocks.push({ id: `plan:meal:${meal.title}`, type: "meal", start, end: start + len, title: meal.title, refId: null, reason: "식사 시간 확보" });
      }
    }
  }

  // 3) 빈 시간에 과제 배치
  const free = windowStart < windowEnd ? subtract({ start: windowStart, end: windowEnd }, busy) : [];
  const tasks = priorities
    .filter((p) => p.kind === "assignment")
    .map((p) => {
      const a = ctx.openAssignments.find((x) => x.id === p.refId)!;
      const dueToday = a.dueDate === now.date && !a.overdue;
      // 내일 아침(계획 시작 + 2시간 이전) 마감도 사실상 오늘 끝내야 한다 → 상한 예외
      const mustFinishToday = dueToday || (!a.overdue && a.dueDate === addDays(now.date, 1) && toMinutes(a.dueTime) <= dayStart + 120);
      // 오늘 몫 = (남은 작업 + 오늘 이미 한 것) 을 남은 일수로 나눈 양 − 오늘 이미 한 것
      // 오늘 한 양을 빼지 않으면 조금씩 할 때마다 '오늘 몫'이 다시 생긴다 (TS-06)
      const share = todayShare(a.remainingMinutes + a.loggedToday, diffDays(now.date, a.dueDate)) - a.loggedToday;
      const remaining = Math.min(a.remainingMinutes, Math.max(0, share));
      return { p, a, remaining, isShare: remaining < a.remainingMinutes, scheduled: 0, dueToday, mustFinishToday, hardEnd: dueToday ? toMinutes(a.dueTime) : Infinity };
    })
    .filter((t) => t.a && t.remaining > 0)
    .sort((x, y) => scheduleOrder(x) - scheduleOrder(y));

  // 하루 상한은 "오늘 이미 기록한 작업"을 포함한다. 매 시점 계획을 다시 세우므로
  // 기록을 빼지 않으면 하루 6시간을 넘게 된다 (TS-07, 1주일 시뮬레이션에서 하루 최대 538분 관측).
  // 오늘(또는 내일 아침) 마감 과제는 상한 때문에 놓치지 않도록 예외로 두고 경고한다.
  const doneToday = ctx.loggedTodayTotal;
  let capLeft = Math.max(0, PLAN_RULES.maxWorkPerDay - doneToday);
  let capHit = false;
  let workTotal = 0;
  for (const slot of free) {
    let cursor = slot.start;
    while (cursor + PLAN_RULES.minSession <= slot.end) {
      const fits = (t: (typeof tasks)[number]) => Math.min(slot.end, t.hardEnd) - cursor >= Math.min(PLAN_RULES.minSession, t.remaining);
      const allowed = (t: (typeof tasks)[number]) => t.mustFinishToday || capLeft >= Math.min(PLAN_RULES.minSession, t.remaining);
      const task = tasks.find((t) => t.remaining > 0 && fits(t) && allowed(t));
      if (!task) {
        if (tasks.some((t) => t.remaining > 0 && fits(t) && !allowed(t))) capHit = true;
        break;
      }
      const len = Math.min(task.remaining, PLAN_RULES.maxSession, Math.min(slot.end, task.hardEnd) - cursor, task.mustFinishToday ? Infinity : capLeft);
      const rank = priorities.findIndex((p) => p.id === task.p.id) + 1;
      blocks.push({
        id: `plan:work:${task.a.id}:${cursor}`,
        type: "work",
        start: cursor,
        end: cursor + len,
        title: task.a.title,
        refId: task.a.id,
        reason: `우선순위 ${rank}위 · ${task.a.due.text} · ${task.isShare ? "오늘 몫" : "남은"} ${formatDuration(task.remaining)} 중 ${formatDuration(len)}`,
      });
      task.remaining -= len;
      task.scheduled += len;
      workTotal += len;
      capLeft = Math.max(0, capLeft - len);
      cursor += len + PLAN_RULES.breakBetween;
    }
  }

  const unscheduled: UnscheduledWork[] = tasks
    .filter((t) => t.remaining > 0 && !t.isShare && (t.dueToday || t.a.overdue || t.a.minutesLeft <= 24 * 60))
    .map((t) => ({ refId: t.a.id, title: t.a.title, neededMinutes: t.a.remainingMinutes, scheduledMinutes: t.scheduled, dueToday: t.dueToday }));

  for (const u of unscheduled) {
    if (u.dueToday) {
      warnings.push(`'${u.title}': 마감 전까지 확보 가능한 시간이 ${formatDuration(u.scheduledMinutes)}로, 필요한 ${formatDuration(u.neededMinutes)}보다 부족합니다.`);
    }
  }
  for (const a of ctx.openAssignments.filter((x) => x.overdue)) warnings.push(`'${a.title}'의 마감이 지났습니다. 늦은 제출 가능 여부를 확인하세요.`);
  for (const c of ctx.conflicts.filter((x) => x.date === now.date)) warnings.push(c.message);
  if (capHit) warnings.push(`오늘 과제 시간이 ${formatDuration(PLAN_RULES.maxWorkPerDay)}에 도달해 마감이 급하지 않은 작업은 다음 날로 넘겼습니다.`);
  if (doneToday + workTotal > PLAN_RULES.maxWorkPerDay) warnings.push(`오늘 마감 과제 때문에 과제 시간이 ${formatDuration(doneToday + workTotal)}로 권장 상한(${formatDuration(PLAN_RULES.maxWorkPerDay)})을 넘습니다.`);

  blocks.sort((a, b) => a.start - b.start || a.end - b.end);
  const freeMinutes = free.reduce((s, f) => s + (f.end - f.start), 0) - workTotal;
  return { windowStart, windowEnd, blocks, workMinutes: workTotal, freeMinutes: Math.max(0, freeMinutes), unscheduled, warnings };
}
