import type { CampusData } from "../src/lib/domain/types";
import { toMinutes, type Clock } from "../src/lib/time";
import { runModel } from "./invariants";

/**
 * 하루 재생 시뮬레이션.
 * 가상의 학생이 10분마다 행동을 고르고, 선택한 과제를 10분씩 진행한다.
 *
 * 정책(policy)
 * - campus-os      : "지금 뭐 하지?" 결과(mode=focus 대상)를 그대로 따르고, 한 만큼 진행 기록을 남긴다.
 * - campus-os-blind: 따르지만 진행 기록을 남기지 않는다 — 학생은 실제로 끝나면 '완료'만 누른다.
 * - campus-os-eager: campus-os 와 같되, 계획이 비어 있으면(mode=free) 우선순위 1위 과제를 미리 한다.
 * - edf            : 고정 일정·이동 중이 아니면 항상 마감이 가장 빠른 과제를 한다 (이론적 기준선).
 * - procrastinate  : 20시 전에는 아무것도 안 하고, 이후 EDF.
 */

export type Policy = "campus-os" | "campus-os-eager" | "campus-os-blind" | "edf" | "procrastinate";

export interface DayResult {
  policy: Policy;
  dueTodayTotal: number;
  dueTodayMet: number;
  /** 마감이 이미 지났지만 오늘 끝낸 과제 수 */
  overdueCleared: number;
  workMinutes: number;
  /** 과제가 남아 있고 고정 일정이 아닌데 아무것도 안 한 시간 (계획상 식사/휴식 제외) */
  idleWithWorkMinutes: number;
  /** 오늘 마감 과제가 안 끝났는데 아무것도 안 한 시간 (마감 전, 고정 일정·식사 제외) */
  idleWithDueTodayMinutes: number;
  lateNightMinutes: number;
  switches: number;
  /** 앱이 믿는 남은 시간과 실제 남은 시간이 다른 상태로 조언한 시간 (blind 정책) */
  misinformedMinutes: number;
  /** 같은 대상으로 되돌아온 횟수 (A→B→A 가 30분 안에) */
  flipFlops: number;
  /** 계획 흔들림: 아직 오지 않은 '다음 과제 블록'이 10분 사이에 다른 과제로 바뀌거나 10분 넘게 이동한 횟수 */
  planChurn: number;
  timeline: string[];
}

const STEP = 10;

function clone(d: CampusData): CampusData {
  return JSON.parse(JSON.stringify(d));
}

export function playDay(
  input: CampusData,
  date: string,
  policy: Policy,
  startMinutes?: number,
  onComplete?: (id: string, minute: number) => void,
  onEnd?: (finalData: CampusData) => void,
): DayResult {
  const data = clone(input);
  // 실제 남은 작업량 (blind 정책에서 앱이 모르는 값)
  const trueRemaining = new Map(data.assignments.map((a) => [a.id, a.status === "done" ? 0 : Math.max(0, a.estimatedMinutes - a.progress.reduce((s, p) => s + p.minutes, 0))]));
  const completedAt = new Map<string, number>();
  const start = startMinutes ?? Math.max(7 * 60, toMinutes(data.settings.dayStart));
  const end = toMinutes(data.settings.dayEnd);
  const res: DayResult = { policy, dueTodayTotal: 0, dueTodayMet: 0, overdueCleared: 0, workMinutes: 0, idleWithWorkMinutes: 0, idleWithDueTodayMinutes: 0, lateNightMinutes: 0, switches: 0, misinformedMinutes: 0, flipFlops: 0, planChurn: 0, timeline: [] };
  let prevNextWork: { refId: string | null; start: number } | null = null;
  const history: { t: number; target: string | null }[] = [];

  for (let t = start; t < end; t += STEP) {
    const clock: Clock = { date, minutes: t };
    const m = runModel(data, clock);
    const nextWork = m.plan.blocks.find((b) => b.type === "work" && b.start > t + STEP);
    if (prevNextWork && prevNextWork.start > t + STEP && nextWork && (nextWork.refId !== prevNextWork.refId || Math.abs(nextWork.start - prevNextWork.start) > STEP)) res.planChurn++;
    prevNextWork = nextWork ? { refId: nextWork.refId, start: nextWork.start } : null;
    const open = data.assignments.filter((a) => a.status !== "done" && (trueRemaining.get(a.id) ?? 0) > 0);
    const busy = m.ctx.currentBlock !== null || m.ctx.todayBlocks.some((b) => b.departAt !== null && b.departAt <= t && t < b.start);

    let target: string | null = null;
    if (policy === "campus-os" || policy === "campus-os-blind" || policy === "campus-os-eager") {
      if (m.advice.mode === "focus" && m.advice.targetRefId) target = m.advice.targetRefId;
      else if (policy === "campus-os-eager" && m.advice.mode === "free" && !busy) {
        target = m.priorities.all.find((p) => p.kind === "assignment")?.refId ?? null;
      }
    } else if (!busy && (policy === "edf" || t >= 20 * 60)) {
      const edf = [...open].sort((a, b) => (a.dueDate + a.dueTime).localeCompare(b.dueDate + b.dueTime))[0];
      target = edf?.id ?? null;
    }

    if (policy === "campus-os-blind" && target) {
      const view = m.ctx.openAssignments.find((x) => x.id === target);
      if (view && view.remainingMinutes !== trueRemaining.get(target)) res.misinformedMinutes += STEP;
    }

    const prev = history[history.length - 1]?.target ?? null;
    if (target && prev && target !== prev) res.switches++;
    if (target) {
      const back = history.filter((h) => h.t >= t - 30 && h.target).map((h) => h.target);
      if (back.length >= 2 && back[back.length - 1] !== target && back.includes(target)) res.flipFlops++;
    }
    history.push({ t, target });

    if (target) {
      const left = (trueRemaining.get(target) ?? 0) - STEP;
      trueRemaining.set(target, Math.max(0, left));
      res.workMinutes += STEP;
      if (t >= 23 * 60) res.lateNightMinutes += STEP;
      const a = data.assignments.find((x) => x.id === target)!;
      a.status = "in_progress";
      if (policy !== "campus-os-blind") a.progress.push({ date, minutes: STEP });
      if (left <= 0) {
        a.status = "done";
        completedAt.set(target, t + STEP);
        onComplete?.(target, t + STEP);
      }
      res.timeline.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")} ${a.title}`);
    } else if (open.length > 0 && !busy) {
      const inMeal = m.plan.blocks.some((b) => b.type === "meal" && b.start <= t && t < b.end);
      if (!inMeal) {
        res.idleWithWorkMinutes += STEP;
        if (open.some((a) => a.dueDate === date && toMinutes(a.dueTime) > t)) res.idleWithDueTodayMinutes += STEP;
      }
    }
  }

  onEnd?.(data);
  for (const a of input.assignments) {
    if (a.status === "done") continue;
    const due = a.dueDate === date ? toMinutes(a.dueTime) : null;
    const finished = completedAt.get(a.id);
    if (a.dueDate < date) {
      if (finished !== undefined) res.overdueCleared++;
    } else if (due !== null && due > start) {
      res.dueTodayTotal++;
      if (finished !== undefined && finished <= due) res.dueTodayMet++;
    }
  }
  return res;
}

export interface WeekResult {
  policy: Policy;
  deadlines: number;
  met: number;
  workMinutes: number;
  maxDayWork: number;
  lateNightMinutes: number;
}

/** 7일 연속 재생 — 진행 상태를 다음 날로 이어간다. 기간 내 마감이 있는 과제의 준수율을 측정 */
export function playWeek(input: CampusData, monday: string, policy: Policy, addDaysFn: (d: string, n: number) => string): WeekResult {
  let data = clone(input);
  const res: WeekResult = { policy, deadlines: 0, met: 0, workMinutes: 0, maxDayWork: 0, lateNightMinutes: 0 };
  const lastDay = addDaysFn(monday, 6);
  const finishedAt = new Map<string, string>(); // id → "YYYY-MM-DD HH:mm"
  for (let i = 0; i < 7; i++) {
    const date = addDaysFn(monday, i);
    const before = new Map(data.assignments.map((a) => [a.id, a.status]));
    const day = playDayState(data, date, policy);
    data = day.data;
    res.workMinutes += day.result.workMinutes;
    res.lateNightMinutes += day.result.lateNightMinutes;
    res.maxDayWork = Math.max(res.maxDayWork, day.result.workMinutes);
    for (const [id, t] of day.completedAt) if (before.get(id) !== "done") finishedAt.set(id, `${date} ${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  for (const a of input.assignments) {
    if (a.dueDate < monday || a.dueDate > lastDay) continue;
    res.deadlines++;
    const f = finishedAt.get(a.id);
    if (f && f <= `${a.dueDate} ${a.dueTime}`) res.met++;
  }
  return res;
}

/** playDay 의 상태 유지 버전 (주간 재생용) */
function playDayState(data: CampusData, date: string, policy: Policy) {
  const completedAt = new Map<string, number>();
  const snapshot = clone(data);
  const result = playDay(snapshot, date, policy, undefined, (id, t) => completedAt.set(id, t), (d) => {
    data = d;
  });
  return { data, result, completedAt };
}
