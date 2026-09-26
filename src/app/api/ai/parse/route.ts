import { NextResponse } from "next/server";
import { callStructured, FAILURE_MESSAGE } from "@/lib/ai/client";
import { PARSE_PROMPT_VERSION, PARSE_SYSTEM } from "@/lib/ai/prompts";
import { parseOutputSchema, parseRequestSchema } from "@/lib/ai/schemas";
import { toDraft } from "@/lib/nlp/resolve";
import { parseKorean } from "@/lib/nlp/ruleParser";
import { WEEKDAY_LABEL } from "@/lib/domain/types";
import { weekdayOf } from "@/lib/time";
import { logAI, metaFrom, readBody } from "../_shared";

/** AI 기능 ④ 자연어 → 일정/과제. AI 실패 시 규칙 기반 파서로 폴백 */
export async function POST(req: Request) {
  const body = await readBody(req, parseRequestSchema);
  if (!body.ok) return body.res;
  const { text, today, subjects } = body.data;

  const result = await callStructured({
    schema: parseOutputSchema,
    system: PARSE_SYSTEM,
    input: { text, today, todayWeekday: `${WEEKDAY_LABEL[weekdayOf(today)]}요일`, subjects },
    maxTokens: 1500,
  });
  logAI("parse", result);

  if (result.ok) {
    const draft = toDraft(result.data, today);
    // AI 가 판단하지 못했지만 규칙 파서는 인식하는 경우 규칙 결과를 사용
    if (draft.kind === "unknown") {
      const rule = toDraft(parseKorean(text, subjects), today);
      if (rule.kind !== "unknown") {
        return NextResponse.json({ meta: { ...metaFrom(result, PARSE_PROMPT_VERSION, ["AI unknown → rule parser"]), source: "rules" }, draft: rule });
      }
    }
    return NextResponse.json({ meta: metaFrom(result, PARSE_PROMPT_VERSION), draft });
  }
  const draft = toDraft(parseKorean(text, subjects), today);
  const meta = metaFrom(result, PARSE_PROMPT_VERSION);
  return NextResponse.json({ meta: { ...meta, fallbackMessage: result.reason === "no_key" ? "AI 키가 없어 규칙 기반 파서로 해석했습니다." : FAILURE_MESSAGE[result.reason] }, draft });
}
