import { describe, expect, it } from "vitest";
import { buildCampusContext } from "@/lib/context/campusContext";
import { createDemoData } from "@/lib/demo";
import { adviseNow } from "@/lib/engine/nowAdvisor";
import { buildActionPlan } from "@/lib/engine/planner";
import { computePriorities } from "@/lib/engine/priority";
import { emptyCampusData } from "@/lib/domain/types";
import { formatDue, toMinutes } from "@/lib/time";

const TODAY = "2026-09-25"; // 금요일
const at = (hhmm: string) => ({ date: TODAY, minutes: toMinutes(hhmm) });

function run(time: string, mutate?: (d: ReturnType<typeof createDemoData>) => void) {
  const data = createDemoData(TODAY);
  mutate?.(data);
  const ctx = buildCampusContext(data, at(time));
  const pr = computePriorities(ctx);
  const plan = buildActionPlan(ctx, pr.all);
  const advice = adviseNow(ctx, plan, pr.all);
  return { data, ctx, pr, plan, advice };
}

describe("formatDue", () => {
  it("오늘/시간/D-day 표현", () => {
    expect(formatDue(at("16:00"), TODAY, "23:59").text).toBe("오늘 23:59 마감");
    expect(formatDue(at("21:00"), TODAY, "23:59").text).toBe("2시간 후 마감");
    expect(formatDue(at("23:30"), TODAY, "23:59").text).toBe("29분 후 마감");
    expect(formatDue(at("10:00"), "2026-09-26", "23:59").text).toBe("D-1 · 내일 23:59");
    expect(formatDue(at("10:00"), "2026-09-30", "09:00").text).toBe("D-5");
    expect(formatDue(at("10:00"), "2026-09-24", "23:59").tone).toBe("overdue");
  });
  it("월말/연말 경계에서도 D-day 가 정확하다", () => {
    expect(formatDue({ date: "2026-12-31", minutes: 600 }, "2027-01-01", "12:00").dDay).toBe(1);
    expect(formatDue({ date: "2026-02-28", minutes: 600 }, "2026-03-01", "12:00").dDay).toBe(1);
  });
});

describe("Campus Context", () => {
  it("풋살 출발 시각 = 시작 - 이동 35분 - 여유 5분 = 17:20", () => {
    const { ctx } = run("16:10");
    const futsal = ctx.todayBlocks.find((b) => b.title === "CLASS FC 풋살")!;
    expect(futsal.departAt).toBe(toMinutes("17:20"));
  });
  it("수업과 약속이 겹치면 overlap 충돌을 계산한다", () => {
    const { ctx } = run("09:00", (d) =>
      d.events.push({ id: "x", createdAt: "", updatedAt: "", title: "친구 약속", date: TODAY, startTime: "15:00", endTime: "16:30", location: "IT관", category: "appointment", memo: "", travelMinutes: null }),
    );
    const c = ctx.conflicts.find((x) => x.type === "overlap");
    expect(c).toBeDefined();
    expect(c!.minutes).toBe(60);
  });
  it("이동시간이 부족하면 travel 충돌을 계산한다", () => {
    const { ctx } = run("09:00", (d) => {
      d.events[0].startTime = "16:20"; // 네트워크 16:00 종료 후 20분, 이동 35분 필요
      d.events[0].endTime = "18:00";
    });
    const c = ctx.conflicts.find((x) => x.type === "travel");
    expect(c?.minutes).toBe(15);
  });
});

describe("Priority Engine", () => {
  it("오늘 마감 과제가 1순위, 완료 과제는 제외", () => {
    const { pr } = run("13:00");
    expect(pr.items[0].title).toContain("자료구조 과제");
    expect(pr.all.some((p) => p.title === "교양 독후감")).toBe(false);
    expect(pr.items.length).toBeLessThanOrEqual(5);
    expect(pr.items[0].factors.length).toBeGreaterThan(0);
  });
  it("이미 끝난 수업은 우선순위에서 제외", () => {
    const { pr } = run("16:30");
    expect(pr.all.some((p) => p.title === "컴퓨터 네트워크")).toBe(false);
  });
  it("빈 데이터에서도 동작한다", () => {
    const ctx = buildCampusContext(emptyCampusData(), at("10:00"));
    const pr = computePriorities(ctx);
    const plan = buildActionPlan(ctx, pr.all);
    expect(pr.items).toEqual([]);
    expect(plan.blocks.every((b) => b.type === "meal")).toBe(true);
    expect(adviseNow(ctx, plan, pr.all).mode).toBeDefined();
  });
});

describe("Action Plan", () => {
  it("과제 블록이 고정 일정/이동과 겹치지 않고, 오늘 마감 과제는 마감 전에 끝난다", () => {
    const { plan, ctx } = run("08:00");
    const fixed = plan.blocks.filter((b) => b.type !== "work");
    for (const w of plan.blocks.filter((b) => b.type === "work")) {
      for (const f of fixed) expect(w.start < f.end && f.start < w.end).toBe(false);
      const a = ctx.openAssignments.find((x) => x.id === w.refId)!;
      if (a.dueDate === TODAY) expect(w.end).toBeLessThanOrEqual(toMinutes(a.dueTime));
    }
  });
  it("현재 시각 이전에는 과제를 배치하지 않는다", () => {
    const { plan } = run("16:13");
    for (const w of plan.blocks.filter((b) => b.type === "work")) expect(w.start).toBeGreaterThanOrEqual(toMinutes("16:20"));
  });
  it("마감이 먼 과제는 하루 몫만 배치한다 (D-5, 180분 → 40분)", () => {
    const { plan } = run("16:10");
    const os = plan.blocks.filter((b) => b.type === "work" && b.refId === "demo-a3");
    expect(os.reduce((s, b) => s + b.end - b.start, 0)).toBe(40);
  });
  it("하루 과제 시간 상한을 넘기지 않는다", () => {
    const { plan } = run("08:00", (d) => {
      d.assignments.push({ id: "big", createdAt: "", updatedAt: "", title: "졸업작품", subject: "", dueDate: "2026-09-26", dueTime: "09:00", estimatedMinutes: 900, importance: 4, status: "todo", memo: "" });
    });
    expect(plan.workMinutes).toBeLessThanOrEqual(360);
  });
});

describe("지금 뭐 하지?", () => {
  it("16:10 — 풋살 출발 전 자료구조 과제를 추천한다", () => {
    const { advice } = run("16:10");
    expect(advice.mode).toBe("focus");
    expect(advice.targetTitle).toContain("자료구조");
    expect(advice.end).toBeLessThanOrEqual(toMinutes("17:20"));
    expect(advice.nextStop?.at).toBe(toMinutes("17:20"));
  });
  it("수업 중이면 수업에 집중하라고 한다", () => {
    const { advice } = run("14:30");
    expect(advice.mode).toBe("in_block");
  });
  it("출발 시각이면 이동을 안내한다", () => {
    const { advice } = run("17:22");
    expect(advice.mode).toBe("depart");
  });
});
