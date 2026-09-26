import type { CampusContext } from "../context/campusContext";
import { josa, q } from "../korean";
import { formatDuration, fromMinutes } from "../time";
import type { ActionPlan } from "./planner";
import type { PriorityItem } from "./priority";

/**
 * 규칙 기반 문장 생성 — AI 가 없거나 AI 응답이 검증에 실패했을 때 그 자리를 채운다.
 * AI 와 같은 계산 결과를 사용하므로 내용은 일관되고, 표현만 단순하다.
 */

export function ruleSummary(ctx: CampusContext, priorities: PriorityItem[]): string {
  const dueToday = ctx.openAssignments.filter((a) => a.dueDate === ctx.now.date && !a.overdue);
  const remainingBlocks = ctx.todayBlocks.filter((b) => b.end > ctx.now.minutes);
  const parts: string[] = [];
  if (priorities[0]) parts.push(`가장 먼저 챙길 일은 '${priorities[0].title}'입니다`);
  parts.push(`오늘 마감 과제 ${dueToday.length}개, 남은 일정 ${remainingBlocks.length}개가 있습니다`);
  return parts.join(". ") + ".";
}

export function ruleRecommendation(ctx: CampusContext, plan: ActionPlan): string {
  const firstWork = plan.blocks.find((b) => b.type === "work" && b.end > ctx.now.minutes);
  const departure = ctx.todayBlocks.find((b) => b.departAt !== null && b.departAt >= ctx.now.minutes);
  const sentences: string[] = [];
  if (firstWork) {
    const a = ctx.openAssignments.find((x) => x.id === firstWork.refId);
    sentences.push(
      `${a ? `${a.due.text}인 ` : ""}${q(firstWork.title, "을/를")} 위해 ${fromMinutes(firstWork.start)} ~ ${fromMinutes(firstWork.end)}을 과제 시간으로 확보하는 것을 추천합니다.`,
    );
  } else if (ctx.openAssignments.length === 0) {
    sentences.push("남은 과제가 없어요. 오늘은 일정에 집중하세요.");
  } else {
    sentences.push("오늘 남은 시간에는 과제를 배치할 빈 시간이 부족합니다.");
  }
  if (departure) {
    sentences.push(`${josa(departure.title, "으로/로")} 이동하려면 ${fromMinutes(departure.departAt!)}에는 출발해야 합니다.`);
  }
  const unscheduled = plan.unscheduled.find((u) => u.dueToday);
  if (unscheduled) {
    sentences.push(`${q(unscheduled.title, "은/는")} 오늘 ${formatDuration(unscheduled.scheduledMinutes)}만 확보되어 일정 조정이 필요합니다.`);
  }
  return sentences.join(" ");
}
