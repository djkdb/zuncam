"use client";

import { useMemo } from "react";
import { toAIContext } from "./ai/aiContext";
import { buildCampusContext } from "./context/campusContext";
import { adviseNow } from "./engine/nowAdvisor";
import { buildActionPlan } from "./engine/planner";
import { computePriorities } from "./engine/priority";
import { useCampusStore, useClock } from "./store";

/** 원천 데이터 + 현재 시각 → Campus Context → 우선순위 → 계획 → "지금" 판단 → AI Context (모두 코드로 계산) */
export function useCampusModel() {
  const { data, hydrated, notice } = useCampusStore();
  const { clock, overridden } = useClock();
  const model = useMemo(() => {
    const ctx = buildCampusContext(data, clock);
    const priorities = computePriorities(ctx);
    const plan = buildActionPlan(ctx, priorities.all);
    const advice = adviseNow(ctx, plan, priorities.all);
    const aiContext = toAIContext(ctx, priorities.items, plan, advice);
    return { ctx, priorities, plan, advice, aiContext };
  }, [data, clock]);
  const isEmpty = data.timetable.length === 0 && data.assignments.length === 0 && data.events.length === 0;
  return { data, hydrated, notice, clock, overridden, isEmpty, ...model };
}
