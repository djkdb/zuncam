import { NextResponse } from "next/server";
import { z } from "zod";
import { aiContextSchema } from "@/lib/ai/aiContext";
import { callStructured } from "@/lib/ai/client";
import { NOW_PROMPT_VERSION, NOW_SYSTEM } from "@/lib/ai/prompts";
import { nowOutputSchema } from "@/lib/ai/schemas";
import { validateNow } from "@/lib/ai/validate";
import { logAI, metaFrom, readBody } from "../_shared";

/** AI 기능 ③ 지금 뭐 하지? — 결정은 코드(nowAdvisor), 설명은 AI */
export async function POST(req: Request) {
  const body = await readBody(req, z.object({ context: aiContextSchema }));
  if (!body.ok) return body.res;
  const ctx = body.data.context;

  const input = {
    currentTime: ctx.currentTime,
    userName: ctx.userName,
    now: ctx.now,
    topPriorities: ctx.priorities.slice(0, 3).map(({ title, facts }) => ({ title, facts })),
    upcomingPlan: ctx.plan.filter((b) => b.end > ctx.currentTime).slice(0, 5),
    allowedTimes: ctx.allowedTimes,
  };
  const result = await callStructured({ schema: nowOutputSchema, system: NOW_SYSTEM, input, maxTokens: 1500 });
  if (!result.ok) {
    logAI("now", result);
    return NextResponse.json({ meta: metaFrom(result, NOW_PROMPT_VERSION), now: null });
  }
  const { value, issues } = validateNow(result.data, ctx);
  logAI("now", result, issues);
  return NextResponse.json({ meta: metaFrom(result, NOW_PROMPT_VERSION, issues), now: value });
}
