import { z } from "zod";
import type { CampusContext, Conflict } from "../context/campusContext";
import { WEEKDAY_LABEL } from "../domain/types";
import type { NowAdvice } from "../engine/nowAdvisor";
import type { ActionPlan } from "../engine/planner";
import type { PriorityItem } from "../engine/priority";
import { fromMinutes, weekdayOf } from "../time";

/**
 * AI Context — LLM 에게 전달하는 입력.
 *
 * UI 데이터(CampusContext)와 분리한 이유
 * 1. 이미 계산된 결과(점수, 계획, 출발 시각)만 전달해 모델이 계산하지 않게 한다.
 * 2. 메모 등 불필요한 개인 정보를 보내지 않는다.
 * 3. 모든 시각을 "HH:mm" 문자열로 통일해 모델이 분 단위 숫자를 해석할 필요가 없게 한다.
 * 4. 모델 응답에서 참조할 수 있는 id 와 시각(allowedTimes)의 화이트리스트가 된다.
 */

const block = z.object({ title: z.string(), start: z.string(), end: z.string(), location: z.string() });

export const aiConflictSchema = z.object({
  id: z.string(),
  type: z.enum(["overlap", "travel"]),
  date: z.string(),
  a: block,
  b: block,
  minutes: z.number(),
  message: z.string(),
});

export const aiContextSchema = z.object({
  userName: z.string().max(40),
  today: z.string(),
  weekday: z.string(),
  currentTime: z.string(),
  priorities: z
    .array(
      z.object({
        id: z.string(),
        rank: z.number(),
        kind: z.enum(["assignment", "class", "event"]),
        title: z.string(),
        score: z.number(),
        factors: z.array(z.string()),
        facts: z.array(z.string()),
      }),
    )
    .max(10),
  plan: z
    .array(z.object({ id: z.string(), type: z.string(), start: z.string(), end: z.string(), title: z.string(), reason: z.string() }))
    .max(40),
  assignments: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        subject: z.string(),
        due: z.string(),
        dueLabel: z.string(),
        estimatedMinutes: z.number(),
        status: z.string(),
        importance: z.number(),
      }),
    )
    .max(40),
  conflicts: z.array(aiConflictSchema).max(20),
  travel: z.array(z.object({ title: z.string(), departAt: z.string(), travelMinutes: z.number(), estimated: z.boolean() })).max(20),
  warnings: z.array(z.string()).max(20),
  now: z.object({
    mode: z.string(),
    headline: z.string(),
    targetTitle: z.string().nullable(),
    start: z.string(),
    end: z.string(),
    focusMinutes: z.number(),
    reasons: z.array(z.string()),
    nextStop: z.object({ label: z.string(), at: z.string() }).nullable(),
  }),
  allowedTimes: z.array(z.string()).max(200),
});
export type AIContext = z.infer<typeof aiContextSchema>;

export function toAIConflict(c: Conflict): z.infer<typeof aiConflictSchema> {
  const b = (x: Conflict["a"]) => ({ title: x.title, start: fromMinutes(x.start), end: fromMinutes(x.end), location: x.location });
  return { id: c.id, type: c.type, date: c.date, a: b(c.a), b: b(c.b), minutes: c.minutes, message: c.message };
}

export function toAIContext(ctx: CampusContext, priorities: PriorityItem[], plan: ActionPlan, advice: NowAdvice): AIContext {
  const times = new Set<string>(advice.allowedTimes);
  const t = (m: number) => {
    const s = fromMinutes(m);
    times.add(s);
    return s;
  };
  const result: Omit<AIContext, "allowedTimes"> = {
    userName: ctx.settings.userName || "사용자",
    today: ctx.now.date,
    weekday: WEEKDAY_LABEL[weekdayOf(ctx.now.date)],
    currentTime: t(ctx.now.minutes),
    priorities: priorities.map((p, i) => ({
      id: p.id,
      rank: i + 1,
      kind: p.kind,
      title: p.title,
      score: p.score,
      factors: p.factors.map((f) => `${f.label}(+${f.points})`),
      facts: p.facts,
    })),
    plan: plan.blocks.map((b) => ({ id: b.id, type: b.type, start: t(b.start), end: t(b.end), title: b.title, reason: b.reason })),
    assignments: ctx.openAssignments.slice(0, 40).map((a) => {
      times.add(a.dueTime);
      return {
        id: a.id,
        title: a.title,
        subject: a.subject,
        due: `${a.dueDate} ${a.dueTime}`,
        dueLabel: a.due.text,
        estimatedMinutes: a.estimatedMinutes,
        status: a.status,
        importance: a.importance,
      };
    }),
    conflicts: ctx.conflicts.slice(0, 20).map((c) => {
      [c.a.start, c.a.end, c.b.start, c.b.end].forEach(t);
      return toAIConflict(c);
    }),
    travel: ctx.todayBlocks
      .filter((b) => b.departAt !== null && b.end > ctx.now.minutes)
      .map((b) => ({ title: b.title, departAt: t(b.departAt!), travelMinutes: b.travel.minutes, estimated: b.travel.source === "estimate" })),
    warnings: plan.warnings,
    now: {
      mode: advice.mode,
      headline: advice.headline,
      targetTitle: advice.targetTitle,
      start: t(advice.start),
      end: t(advice.end),
      focusMinutes: advice.focusMinutes,
      reasons: advice.reasons,
      nextStop: advice.nextStop ? { label: advice.nextStop.label, at: t(advice.nextStop.at) } : null,
    },
  };
  return { ...result, allowedTimes: [...times].sort() };
}
