import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { AI_MODEL, FAILURE_MESSAGE, type AIResult } from "@/lib/ai/client";
import type { AIMeta } from "@/lib/ai/meta";

export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, res: NextResponse.json({ error: "요청 형식이 올바르지 않습니다.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}

export function metaFrom(result: AIResult<unknown>, promptVersion: string, issues: string[] = []): AIMeta {
  if (result.ok) return { source: "ai", promptVersion, model: result.model, latencyMs: result.latencyMs, fallbackMessage: null, issues };
  return { source: "rules", promptVersion, model: null, latencyMs: result.latencyMs, fallbackMessage: FAILURE_MESSAGE[result.reason], issues: [`${result.reason}: ${result.detail}`, ...issues] };
}

/** 트러블슈팅 기록용 구조화 로그 (서버 콘솔) */
export function logAI(route: string, result: AIResult<unknown>, issues: string[] = []) {
  console.info(
    JSON.stringify({ tag: "campus-os.ai", route, model: AI_MODEL, ok: result.ok, reason: result.ok ? null : result.reason, latencyMs: result.latencyMs, issues }),
  );
}
