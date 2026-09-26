import { NextResponse } from "next/server";
import { z } from "zod";
import { aiContextSchema } from "@/lib/ai/aiContext";
import { callStructured } from "@/lib/ai/client";
import { BRIEFING_PROMPT_VERSION, BRIEFING_SYSTEM } from "@/lib/ai/prompts";
import { briefingOutputSchema } from "@/lib/ai/schemas";
import { validateBriefing } from "@/lib/ai/validate";
import { logAI, metaFrom, readBody } from "../_shared";

/** AI 기능 ①② 오늘의 우선순위 근거 + 행동 계획 설명 */
export async function POST(req: Request) {
  const body = await readBody(req, z.object({ context: aiContextSchema }));
  if (!body.ok) return body.res;
  const ctx = body.data.context;

  if (ctx.priorities.length === 0 && ctx.plan.length === 0) {
    return NextResponse.json({ meta: { source: "rules", promptVersion: BRIEFING_PROMPT_VERSION, model: null, latencyMs: 0, fallbackMessage: null, issues: ["empty context — AI 호출 생략"] }, briefing: null });
  }

  const result = await callStructured({ schema: briefingOutputSchema, system: BRIEFING_SYSTEM, input: ctx });
  if (!result.ok) {
    logAI("briefing", result);
    return NextResponse.json({ meta: metaFrom(result, BRIEFING_PROMPT_VERSION), briefing: null });
  }
  const { value, issues } = validateBriefing(result.data, ctx);
  logAI("briefing", result, issues);
  return NextResponse.json({ meta: metaFrom(result, BRIEFING_PROMPT_VERSION, issues), briefing: value });
}
