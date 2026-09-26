import { NextResponse } from "next/server";
import { z } from "zod";
import { aiConflictSchema } from "@/lib/ai/aiContext";
import { callStructured } from "@/lib/ai/client";
import { CONFLICT_PROMPT_VERSION, CONFLICT_SYSTEM } from "@/lib/ai/prompts";
import { conflictOutputSchema } from "@/lib/ai/schemas";
import { validateConflicts } from "@/lib/ai/validate";
import { logAI, metaFrom, readBody } from "../_shared";

/** AI 기능 ⑤ 일정 충돌 분석 — 충돌 판정은 코드(detectConflicts), 설명·해결 제안은 AI */
export async function POST(req: Request) {
  const body = await readBody(req, z.object({ conflicts: z.array(aiConflictSchema).min(1).max(10) }));
  if (!body.ok) return body.res;
  const { conflicts } = body.data;
  const allowedTimes = [...new Set(conflicts.flatMap((c) => [c.a.start, c.a.end, c.b.start, c.b.end]))];

  const result = await callStructured({ schema: conflictOutputSchema, system: CONFLICT_SYSTEM, input: { conflicts }, maxTokens: 2000 });
  if (!result.ok) {
    logAI("conflicts", result);
    return NextResponse.json({ meta: metaFrom(result, CONFLICT_PROMPT_VERSION), advice: {} });
  }
  const { value, issues } = validateConflicts(result.data, conflicts, allowedTimes);
  logAI("conflicts", result, issues);
  return NextResponse.json({ meta: metaFrom(result, CONFLICT_PROMPT_VERSION, issues), advice: value });
}
