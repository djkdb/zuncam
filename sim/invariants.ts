import { toAIContext } from "../src/lib/ai/aiContext";
import { findUnknownTimes } from "../src/lib/ai/validate";
import { buildCampusContext } from "../src/lib/context/campusContext";
import type { CampusData } from "../src/lib/domain/types";
import { ruleRecommendation, ruleSummary } from "../src/lib/engine/narrative";
import { adviseNow } from "../src/lib/engine/nowAdvisor";
import { buildActionPlan, PLAN_RULES } from "../src/lib/engine/planner";
import { computePriorities } from "../src/lib/engine/priority";
import { addDays, fromMinutes, overlaps, toMinutes, type Clock } from "../src/lib/time";

/**
 * 한 시점(data, clock)에 대해 엔진 결과가 지켜야 하는 불변식.
 * 위반은 { code, message } 로 반환한다.
 */

export interface Violation {
  code: string;
  message: string;
}

export function runModel(data: CampusData, clock: Clock) {
  const ctx = buildCampusContext(data, clock);
  const priorities = computePriorities(ctx);
  const plan = buildActionPlan(ctx, priorities.all);
  const advice = adviseNow(ctx, plan, priorities.all);
  const aiContext = toAIContext(ctx, priorities.items, plan, advice);
  return { ctx, priorities, plan, advice, aiContext };
}

export function checkInvariants(data: CampusData, clock: Clock): Violation[] {
  const v: Violation[] = [];
  const m = runModel(data, clock);
  const { ctx, plan, advice, priorities, aiContext } = m;
  const now = clock.minutes;
  const add = (code: string, message: string) => v.push({ code, message });
  const done = new Set(data.assignments.filter((a) => a.status === "done").map((a) => a.id));
  const work = plan.blocks.filter((b) => b.type === "work");
  const nonWork = plan.blocks.filter((b) => b.type !== "work");

  for (const w of work) {
    for (const f of nonWork) {
      if (overlaps(w.start, w.end, f.start, f.end)) add("WORK_OVERLAP", `과제 ${fromMinutes(w.start)}-${fromMinutes(w.end)} '${w.title}' ↔ ${f.type} ${fromMinutes(f.start)}-${fromMinutes(f.end)} '${f.title}'`);
    }
    for (const w2 of work) if (w2 !== w && overlaps(w.start, w.end, w2.start, w2.end)) add("WORK_OVERLAP_WORK", `${w.title} ↔ ${w2.title}`);
    if (w.start < now) add("WORK_IN_PAST", `${fromMinutes(w.start)} < now ${fromMinutes(now)}`);
    if (w.start < plan.windowStart || w.end > plan.windowEnd) add("WORK_OUT_OF_WINDOW", `${fromMinutes(w.start)}-${fromMinutes(w.end)}`);
    const a = data.assignments.find((x) => x.id === w.refId);
    if (a && a.dueDate === clock.date && w.end > toMinutes(a.dueTime) && toMinutes(a.dueTime) > now) add("WORK_AFTER_DUE", `'${a.title}' 마감 ${a.dueTime}, 블록 종료 ${fromMinutes(w.end)}`);
    if (w.refId && done.has(w.refId)) add("DONE_SCHEDULED", w.title);
  }
  const loggedToday = ctx.loggedTodayTotal;
  const cappedWork = work.filter((w) => { const a = ctx.openAssignments.find((x) => x.id === w.refId); if (!a || a.overdue) return true; const tomorrowMorning = a.dueDate === addDays(clock.date, 1) && toMinutes(a.dueTime) <= toMinutes(data.settings.dayStart) + 120; return !(a.dueDate === clock.date || tomorrowMorning); }).reduce((s, w) => s + w.end - w.start, 0);
  if (cappedWork > 0 && loggedToday + cappedWork > PLAN_RULES.maxWorkPerDay) add("CAP_EXCEEDED", `오늘 기록 ${loggedToday}분 + 비긴급 계획 ${cappedWork}분`);

  for (const p of priorities.all) if (p.kind === "assignment" && done.has(p.refId)) add("DONE_PRIORITIZED", p.title);
  if (advice.targetRefId && done.has(advice.targetRefId)) add("DONE_ADVISED", advice.targetTitle ?? "");

  if (advice.end < advice.start) add("ADVICE_NEGATIVE", `${advice.start} > ${advice.end}`);
  if (advice.mode === "focus") {
    if (!ctx.openAssignments.some((a) => a.id === advice.targetRefId)) add("FOCUS_TARGET_INVALID", advice.targetTitle ?? "");
    const hardStop = Math.min(...ctx.todayBlocks.flatMap((b) => [b.departAt ?? Infinity, b.start]).filter((t) => t > now), plan.windowEnd);
    if (advice.end > hardStop) add("FOCUS_OVERRUNS_STOP", `집중 종료 ${fromMinutes(advice.end)} > 다음 멈춤 ${fromMinutes(hardStop)}`);
  }
  if (advice.nextStop && advice.nextStop.at <= now) add("NEXTSTOP_IN_PAST", fromMinutes(advice.nextStop.at));

  const candidates = priorities.all.length;
  if (candidates >= 3 && (priorities.items.length < 3 || priorities.items.length > 5)) add("PRIORITY_COUNT", `${priorities.items.length}개`);

  // 규칙 기반 문장이 AI 검증기를 통과해야 한다 — 통과 못 하면 같은 내용을 말한 AI 도 거부된다
  const ruleTexts = [
    advice.headline,
    ...advice.reasons,
    ...plan.warnings,
    ...plan.blocks.map((b) => b.reason),
    ruleSummary(ctx, priorities.items),
    ruleRecommendation(ctx, plan),
    ...ctx.conflicts.map((c) => c.message),
  ];
  for (const t of ruleTexts) {
    const bad = findUnknownTimes(t, aiContext.allowedTimes);
    if (bad.length) add("RULE_TEXT_UNVERIFIABLE", `"${t}" → ${bad.join(",")}`);
  }
  return v;
}
