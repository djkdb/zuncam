import { josa, q } from "../korean";
import type { CampusContext } from "../context/campusContext";
import { formatDuration, fromMinutes } from "../time";
import { PLAN_RULES, type ActionPlan } from "./planner";
import type { PriorityItem } from "./priority";

/**
 * "지금 뭐 하지?" — 현재 시각 기준 결정론적 판단.
 * 결과(mode, 대상, 시작/종료 시각, 집중 가능 시간)는 코드가 결정하고,
 * LLM 은 이 결정을 자연어로 설명만 한다. LLM 이 언급할 수 있는 시각은 allowedTimes 로 제한된다.
 */

export type NowMode = "in_block" | "depart" | "meal" | "focus" | "short_gap" | "free" | "day_over";

export interface NowAdvice {
  mode: NowMode;
  nowText: string;
  headline: string;
  targetTitle: string | null;
  targetRefId: string | null;
  /** 권장 행동 시작~종료 (분) */
  start: number;
  end: number;
  focusMinutes: number;
  reasons: string[];
  /** 다음 고정 일정 / 출발 시각 */
  nextStop: { label: string; at: number } | null;
  /** LLM 설명에 등장해도 되는 시각 목록 (validation 용) */
  allowedTimes: string[];
}

export function adviseNow(ctx: CampusContext, plan: ActionPlan, priorities: PriorityItem[]): NowAdvice {
  const now = ctx.now.minutes;
  const nowText = fromMinutes(now);

  // 다음 "멈춰야 하는" 시각: 출발 / 다음 고정 일정 시작 / 하루 종료
  const stops: { label: string; at: number }[] = [];
  for (const b of ctx.todayBlocks) {
    if (b.departAt !== null && b.departAt > now) stops.push({ label: `'${b.title}' 이동 출발`, at: b.departAt });
    if (b.start > now) stops.push({ label: `'${b.title}' 시작`, at: b.start });
  }
  stops.push({ label: "오늘 계획 종료", at: plan.windowEnd });
  stops.sort((a, b) => a.at - b.at);
  const nextStop = stops.find((s) => s.at > now) ?? null;

  const times = new Set<string>([nowText]);
  const base = (a: Omit<NowAdvice, "allowedTimes" | "nowText" | "nextStop">): NowAdvice => {
    times.add(fromMinutes(a.start));
    times.add(fromMinutes(a.end));
    if (nextStop) times.add(fromMinutes(nextStop.at));
    for (const b of ctx.todayBlocks) {
      times.add(fromMinutes(b.start));
      times.add(fromMinutes(b.end));
      if (b.departAt !== null) times.add(fromMinutes(b.departAt));
    }
    for (const a2 of ctx.openAssignments) times.add(a2.dueTime);
    return { ...a, nowText, nextStop, allowedTimes: [...times].sort() };
  };

  if (now >= plan.windowEnd) {
    const tomorrow = ctx.weekBlocks.find((b) => b.date !== ctx.now.date);
    if (tomorrow) times.add(fromMinutes(tomorrow.start));
    return base({
      mode: "day_over",
      headline: "오늘 계획 시간이 끝났어요. 쉬고 내일을 준비하세요.",
      targetTitle: tomorrow?.title ?? null,
      targetRefId: tomorrow?.refId ?? null,
      start: now,
      end: now,
      focusMinutes: 0,
      reasons: tomorrow ? [`다음 일정: ${tomorrow.date} ${fromMinutes(tomorrow.start)} '${tomorrow.title}'`] : ["예정된 일정이 없습니다."],
    });
  }

  const sessionReminder = ctx.activeSession ? [`${q(ctx.activeSession.title, "은/는")} ${formatDuration(ctx.activeSession.elapsed)} 진행했어요. 기록하고 멈추세요.`] : [];

  // 1) 지금 진행 중인 고정 일정
  if (ctx.currentBlock) {
    const b = ctx.currentBlock;
    const after = plan.blocks.find((p) => p.start >= b.end && p.type === "work");
    return base({
      mode: "in_block",
      headline: `지금은 '${b.title}' 시간입니다. ${fromMinutes(b.end)}까지 집중하세요.`,
      targetTitle: b.title,
      targetRefId: b.refId,
      start: now,
      end: b.end,
      focusMinutes: b.end - now,
      reasons: [
        `${fromMinutes(b.start)} ~ ${fromMinutes(b.end)} ${b.kind === "class" ? "수업" : "일정"} 진행 중`,
        ...(after ? [`끝난 뒤 ${fromMinutes(after.start)}부터 '${after.title}' 작업이 계획되어 있습니다.`] : []),
        ...sessionReminder,
      ],
    });
  }

  // 2) 계획상 지금(또는 10분 이내) 시작하는 블록
  const current = plan.blocks.find((p) => p.start <= now + 10 && now < p.end && p.type !== "class" && p.type !== "event");
  if (current?.type === "travel") {
    const target = ctx.todayBlocks.find((b) => b.refId === current.refId);
    return base({
      mode: "depart",
      headline: target ? `지금 출발 준비를 하세요. ${q(target.title, "이/가")} ${fromMinutes(target.start)}에 시작합니다.` : "지금 출발 준비를 하세요.",
      targetTitle: target?.title ?? current.title,
      targetRefId: current.refId,
      start: now,
      end: current.end,
      focusMinutes: 0,
      reasons: [current.reason, ...(target?.location ? [`장소: ${target.location}`] : []), ...sessionReminder],
    });
  }
  // 3) 집중 세션 진행 중 — 계획보다 사용자가 실제로 시작한 작업을 우선한다
  if (ctx.activeSession) {
    const s = ctx.activeSession;
    const a = ctx.openAssignments.find((x) => x.id === s.refId);
    const stop = nextStop?.at ?? plan.windowEnd;
    const end = Math.max(now, Math.min(stop, now + (a?.remainingMinutes ?? 0)));
    const reasons = [`${fromMinutes(s.startMinutes)}에 시작해 ${formatDuration(s.elapsed)}째 진행 중`];
    if (a && !a.overEstimate) reasons.push(`남은 작업 약 ${formatDuration(a.remainingMinutes)} · ${a.due.text}`);
    if (a?.overEstimate) reasons.push("예상 소요시간을 넘겼어요. 끝났다면 완료를, 아니라면 예상 시간을 늘려주세요.");
    if (nextStop) reasons.push(`${josa(nextStop.label, "이/가")} ${fromMinutes(nextStop.at)}이므로 그 전에 기록하고 멈추세요.`);
    return base({
      mode: "focus",
      headline: `${q(s.title, "을/를")} 계속하세요.`,
      targetTitle: s.title,
      targetRefId: s.refId,
      start: now,
      end,
      focusMinutes: end - now,
      reasons,
    });
  }
  if (current?.type === "meal") {
    return base({
      mode: "meal",
      headline: `${current.title} 시간이에요. ${fromMinutes(current.end)}까지 식사하고 쉬세요.`,
      targetTitle: current.title,
      targetRefId: null,
      start: now,
      end: current.end,
      focusMinutes: current.end - now,
      reasons: ["계획에 식사 시간이 확보되어 있습니다."],
    });
  }
  if (current?.type === "work") {
    const item = priorities.find((p) => p.refId === current.refId);
    const a = ctx.openAssignments.find((x) => x.id === current.refId);
    const end = current.end;
    const reasons = [
      a ? `${a.due.text} · 남은 작업 ${formatDuration(a.remainingMinutes)}` : current.reason,
      ...(item ? [`우선순위 점수 ${item.score}점 (${item.reason})`] : []),
    ];
    if (nextStop) reasons.push(`${josa(nextStop.label, "이/가")} ${fromMinutes(nextStop.at)}이므로 지금부터 약 ${formatDuration(Math.min(end, nextStop.at) - now)} 확보할 수 있습니다.`);
    return base({
      mode: "focus",
      headline: `지금은 ${q(current.title, "을/를")} 시작하는 것을 추천합니다.`,
      targetTitle: current.title,
      targetRefId: current.refId,
      start: now,
      end,
      focusMinutes: end - now,
      reasons,
    });
  }

  // 5) 계획상 빈 시간 — 쉬어도 되는 이유와 다음 작업을 함께 알려준다
  const gap = (nextStop?.at ?? plan.windowEnd) - now;
  const upcoming = plan.blocks.find((p) => p.start > now);
  const nextWork = plan.blocks.find((p) => p.type === "work" && p.start >= now);
  const nextWorkText = nextWork ? `${fromMinutes(nextWork.start)}부터 ${q(nextWork.title, "을/를")} 할 차례예요.` : "";
  if (gap < 25) {
    return base({
      mode: "short_gap",
      headline: nextWork
        ? `다음 일정까지 ${formatDuration(gap)} 남은 짧은 틈이에요. ${nextWorkText} 필요한 자료를 미리 열어두세요.`
        : `다음 일정까지 ${formatDuration(gap)} 남았어요. 짧게 쉬면서 준비물을 챙기세요.`,
      targetTitle: nextWork?.title ?? upcoming?.title ?? null,
      targetRefId: nextWork?.refId ?? upcoming?.refId ?? null,
      start: now,
      end: now + gap,
      focusMinutes: 0,
      reasons: [...(nextStop ? [`${nextStop.label}: ${fromMinutes(nextStop.at)}`] : []), `${PLAN_RULES.minSession}분보다 짧은 틈에는 과제를 배치하지 않습니다.`],
    });
  }
  const openWork = ctx.openAssignments.length > 0;
  let headline: string;
  if (upcoming?.type === "meal") headline = `${fromMinutes(upcoming.start)} ${upcoming.title} 전까지 여유가 있어요.${nextWork ? ` 식사 후 ${nextWorkText}` : ""}`;
  else if (nextWork) headline = `지금은 비워둔 시간이에요. ${nextWorkText} 그 전까지 자유롭게 쓰세요.`;
  else if (openWork) headline = "오늘 계획된 과제 분량은 끝났어요. 여유가 있다면 다음 과제를 미리 해도 좋아요.";
  else headline = "남은 과제가 없어요. 자유 시간을 즐기세요.";
  return base({
    mode: "free",
    headline,
    targetTitle: nextWork?.title ?? upcoming?.title ?? null,
    targetRefId: nextWork?.refId ?? upcoming?.refId ?? null,
    start: now,
    end: upcoming?.start ?? now + gap,
    focusMinutes: 0,
    reasons: [
      ...(nextStop ? [`${nextStop.label}: ${fromMinutes(nextStop.at)}`] : []),
      ...(plan.unscheduled.length === 0 && openWork ? ["오늘 필요한 과제 시간은 모두 계획에 배치되었습니다."] : []),
    ],
  });
}
