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
  it("하루 과제 시간 상한: 급하지 않은 과제는 오늘 기록 포함 6시간을 넘기지 않는다", () => {
    const big = (id: string, dueDate: string, dueTime: string) => ({ id, createdAt: "", updatedAt: "", title: id, subject: "", dueDate, dueTime, estimatedMinutes: 900, importance: 4 as const, status: "todo" as const, memo: "", progress: [] as { date: string; minutes: number }[] });
    const { plan } = run("08:00", (d) => {
      d.assignments = [big("졸업작품", "2026-09-26", "18:00")];
      d.assignments[0].estimatedMinutes = 400; // 남은 280분 — 내일(토) 18시 전 빈 시간에 충분히 들어감 → 상한 적용
      d.assignments[0].progress.push({ date: TODAY, minutes: 120 }); // 오늘 이미 2시간
    });
    expect(plan.workMinutes).toBe(240);
    expect(plan.warnings.some((w) => w.includes("다음 날로"))).toBe(true);
  });
  it("내일 마감인데 내일 빈 시간에 다 안 들어가면, 안 들어가는 만큼은 상한 예외", () => {
    const { plan } = run("08:00", (d) => {
      d.assignments = [{ id: "g", createdAt: "", updatedAt: "", title: "졸업작품", subject: "", dueDate: "2026-09-26", dueTime: "18:00", estimatedMinutes: 900, importance: 4, status: "todo", memo: "", progress: [] }];
    });
    // 토요일 08~18시 600분 × 0.6 = 360분은 내일 가능 → 540분은 오늘 필요 (상한 360 초과)
    expect(plan.workMinutes).toBeGreaterThan(360);
  });
  it("내일 아침 마감은 상한 예외 — 대신 과부하 경고", () => {
    const { plan } = run("08:00", (d) => {
      d.assignments = [{ id: "a", createdAt: "", updatedAt: "", title: "밤샘 과제", subject: "", dueDate: "2026-09-26", dueTime: "09:00", estimatedMinutes: 480, importance: 4, status: "todo", memo: "", progress: [] }];
    });
    expect(plan.workMinutes).toBeGreaterThan(360); // 빈 시간이 허락하는 만큼 (상한에 막히지 않음)
    expect(plan.warnings.some((w) => w.includes("권장 상한"))).toBe(true);
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

describe("크런치", () => {
  it("오늘 마감이 식사·휴식 때문에 안 들어가면 그 전까지 식사·휴식을 빼고 경고한다", () => {
    const { plan } = run("08:00", (d) => {
      d.events = [];
      d.assignments = [{ id: "x", createdAt: "", updatedAt: "", title: "기말 보고서", subject: "", dueDate: TODAY, dueTime: "14:00", estimatedMinutes: 240, importance: 4, status: "todo", memo: "", progress: [] }];
    });
    // 08:00~14:00 중 운영체제 10~12시 + 이동 → 빈 시간은 빠듯함. 점심을 빼야 더 들어간다
    expect(plan.crunch).toBe(true);
    expect(plan.blocks.some((b) => b.type === "meal" && b.start < toMinutes("14:00"))).toBe(false);
    expect(plan.warnings[0]).toContain("식사·휴식을 줄여야");
  });
  it("여유가 있으면 크런치하지 않는다", () => {
    const { plan } = run("08:00");
    expect(plan.crunch).toBeFalsy();
  });
});

describe("진행 기록 · 집중 세션", () => {
  const withSession = (d: ReturnType<typeof createDemoData>) => {
    d.activeSession = { refId: "demo-a1", date: TODAY, startMinutes: toMinutes("16:10") };
  };
  it("세션 경과 시간이 남은 시간·오늘 몫·계획에 반영된다", () => {
    const { ctx, plan, advice } = run("16:50", withSession);
    const a = ctx.openAssignments.find((x) => x.id === "demo-a1")!;
    expect(ctx.activeSession?.elapsed).toBe(40);
    expect(a.remainingMinutes).toBe(120 - 30 - 40);
    expect(plan.blocks.filter((b) => b.refId === "demo-a1" && b.type === "work").reduce((s, b) => s + b.end - b.start, 0)).toBe(50);
    expect(advice.mode).toBe("focus");
    expect(advice.targetRefId).toBe("demo-a1");
    expect(advice.end).toBeLessThanOrEqual(toMinutes("17:20"));
  });
  it("출발 시각이 되면 세션보다 출발이 우선이고, 기록하라고 알려준다", () => {
    const { advice } = run("17:22", withSession);
    expect(advice.mode).toBe("depart");
    expect(advice.reasons.some((r) => r.includes("기록하고 멈추세요"))).toBe(true);
  });
  it("오늘 몫은 오늘 이미 한 만큼 줄어든다 (조금씩 할 때마다 다시 생기지 않음)", () => {
    const { plan } = run("16:10", (d) => {
      d.assignments.find((a) => a.id === "demo-a3")!.progress.push({ date: TODAY, minutes: 40 });
    });
    expect(plan.blocks.some((b) => b.refId === "demo-a3")).toBe(false);
  });
  it("완료된 세션 대상은 세션으로 취급하지 않는다", () => {
    const { ctx } = run("16:50", (d) => {
      withSession(d);
      d.assignments.find((a) => a.id === "demo-a1")!.status = "done";
    });
    expect(ctx.activeSession).toBeNull();
  });
});

describe("식사 시간 안정성 (TS-15)", () => {
  it("10분마다 다시 계획해도 '식사' 조언은 하루 120분을 넘지 않고, 점심은 한 시간이다", () => {
    const data = createDemoData(TODAY);
    let mealTicks = 0;
    const lunchEnds = new Set<number>();
    for (let t = toMinutes("08:00"); t < toMinutes("24:00"); t += 10) {
      const ctx = buildCampusContext(data, at(fromMinutesSafe(t)));
      const pr = computePriorities(ctx);
      const plan = buildActionPlan(ctx, pr.all);
      const adv = adviseNow(ctx, plan, pr.all);
      if (adv.mode === "meal") {
        mealTicks++;
        if (adv.targetTitle === "점심") lunchEnds.add(adv.end);
      }
    }
    expect(mealTicks * 10).toBeLessThanOrEqual(120);
    expect(lunchEnds.size).toBe(1);
  });
});

function fromMinutesSafe(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

describe("예상 소요시간 보정 (TS-12)", () => {
  const done = (id: string, est: number, actual: number) => ({ id, createdAt: "", updatedAt: "", title: id, subject: "", dueDate: "2026-09-20", dueTime: "23:59", estimatedMinutes: est, importance: 2 as const, status: "done" as const, memo: "", progress: [{ date: "2026-09-20", minutes: actual }] });
  it("완료 과제의 실제/예상 비율을 학습해 남은 과제에 적용한다", () => {
    const { ctx } = run("08:00", (d) => d.assignments.push(done("h1", 60, 90), done("h2", 120, 150)));
    expect(ctx.calibration).toMatchObject({ applied: true, factor: 1.35, samples: 2 });
    const net = ctx.openAssignments.find((a) => a.id === "demo-a2")!; // 예상 60분
    expect(net.adjustedEstimate).toBe(80);
    expect(net.remainingMinutes).toBe(80);
  });
  it("차이가 10% 미만이거나 설정이 꺼져 있으면 보정하지 않는다", () => {
    expect(run("08:00", (d) => d.assignments.push(done("h1", 100, 105), done("h2", 100, 100))).ctx.calibration.applied).toBe(false);
    const off = run("08:00", (d) => {
      d.settings.calibrateEstimates = false;
      d.assignments.push(done("h1", 60, 90), done("h2", 120, 150));
    }).ctx.calibration;
    expect(off).toMatchObject({ applied: false, factor: 1, observed: 1.35 });
  });
  it("기록이 예상을 넘으면 '10분 남음'이 아니라 예상의 30%(최소 30분)가 남았다고 본다 (TS-14)", () => {
    const { ctx } = run("08:00", (d) => {
      d.assignments.find((a) => a.id === "demo-a2")!.progress.push({ date: "2026-09-24", minutes: 70 });
    });
    const a = ctx.openAssignments.find((x) => x.id === "demo-a2")!;
    expect(a.overEstimate).toBe(true);
    expect(a.remainingMinutes).toBe(30);
  });
});
