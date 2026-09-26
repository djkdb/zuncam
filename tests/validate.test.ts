import { describe, expect, it } from "vitest";
import { toAIContext } from "@/lib/ai/aiContext";
import { extractTimes, findUnknownTimes, validateBriefing, validateNow } from "@/lib/ai/validate";
import { briefingOutputSchema } from "@/lib/ai/schemas";
import { buildCampusContext } from "@/lib/context/campusContext";
import { createDemoData } from "@/lib/demo";
import { adviseNow } from "@/lib/engine/nowAdvisor";
import { buildActionPlan } from "@/lib/engine/planner";
import { computePriorities } from "@/lib/engine/priority";
import { toMinutes } from "@/lib/time";

function aiCtx(time = "16:10") {
  const ctx = buildCampusContext(createDemoData("2026-09-25"), { date: "2026-09-25", minutes: toMinutes(time) });
  const pr = computePriorities(ctx);
  const plan = buildActionPlan(ctx, pr.all);
  return toAIContext(ctx, pr.items, plan, adviseNow(ctx, plan, pr.all));
}

describe("extractTimes", () => {
  it("다양한 시각 표현을 인식하고 'N시간'은 제외한다", () => {
    expect(extractTimes("17:20에 출발")).toEqual([["17:20"]]);
    expect(extractTimes("오후 4시 20분")).toEqual([["16:20"]]);
    expect(extractTimes("6시 반")).toEqual([["06:30", "18:30"]]);
    expect(extractTimes("약 1시간 10분 집중")).toEqual([]);
  });
  it("허용 목록에 없는 시각을 찾는다", () => {
    expect(findUnknownTimes("17:20에 출발, 16:20부터 과제", ["16:10", "17:20"])).toEqual(["16:20"]);
    expect(findUnknownTimes("저녁 6시 풋살", ["18:00"])).toEqual([]);
  });
});

describe("validateBriefing", () => {
  it("없는 id / 없는 시각을 걸러낸다", () => {
    const ctx = aiCtx();
    const out = briefingOutputSchema.parse({
      summary: "오늘은 자료구조 과제가 가장 급합니다.",
      recommendation: "16:20부터 17:50까지 과제를 하세요.", // 계획에 없는 시각 (환각)
      priorityReasons: [
        { id: ctx.priorities[0].id, reason: "오늘 23:59 마감이고 시간이 오래 걸립니다." },
        { id: "assignment:nope", reason: "?" },
      ],
      planNotes: [],
      warnings: ["17:20에는 출발해야 합니다."],
    });
    const { value, issues } = validateBriefing(out, ctx);
    expect(value.summary).not.toBeNull();
    expect(value.recommendation).toBeNull();
    expect(Object.keys(value.priorityReasons)).toEqual([ctx.priorities[0].id]);
    expect(value.warnings).toHaveLength(1);
    expect(issues.length).toBe(2);
  });
});

describe("validateNow", () => {
  it("결정된 대상과 다른 행동을 추천하면 거부한다", () => {
    const ctx = aiCtx();
    expect(validateNow({ message: "지금은 네트워크 보고서를 하세요.", tips: [] }, ctx).value.message).toBeNull();
    expect(validateNow({ message: "지금 자료구조 과제를 시작하세요. 17:20에는 출발해야 합니다.", tips: [] }, ctx).value.message).not.toBeNull();
  });
});
