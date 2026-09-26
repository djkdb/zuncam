import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/**
 * 서버 전용 LLM 호출 래퍼.
 * - API 키는 환경변수(ANTHROPIC_API_KEY)에서만 읽는다. 클라이언트 번들에 포함되지 않는다("server-only").
 * - Structured Output(JSON Schema)으로 형식을 강제하고, 응답을 zod 로 한 번 더 검증한다.
 * - 모든 실패는 예외 대신 { ok:false, reason } 으로 반환해 라우트가 규칙 기반 결과로 폴백할 수 있게 한다.
 */

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const TIMEOUT_MS = 25_000;

export type AIFailureReason = "no_key" | "timeout" | "rate_limit" | "api_error" | "refusal" | "truncated" | "invalid_json" | "schema_mismatch";

export type AIResult<T> =
  | { ok: true; data: T; model: string; latencyMs: number }
  | { ok: false; reason: AIFailureReason; detail: string; latencyMs: number };

export function isAIEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

/** 서버측 거절(refusal) 폴백은 Opus 5 / Fable 계열에서만 지원된다 */
function supportsServerFallback(model: string) {
  return /^claude-(opus-5|fable-5)/.test(model);
}

export async function callStructured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  input: unknown;
  maxTokens?: number;
}): Promise<AIResult<z.infer<S>>> {
  const started = Date.now();
  const elapsed = () => Date.now() - started;
  if (!isAIEnabled()) return { ok: false, reason: "no_key", detail: "ANTHROPIC_API_KEY 가 설정되지 않았습니다.", latencyMs: 0 };

  const { parse: _parse, ...format } = zodOutputFormat(opts.schema);
  try {
    const response = await getClient().beta.messages.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      // 설명/구조화 작업이라 깊은 추론이 필요 없고, 응답 지연이 UX 에 직접 영향을 준다
      output_config: { effort: "low", format },
      ...(supportsServerFallback(AI_MODEL) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      messages: [{ role: "user", content: `입력(JSON):\n${JSON.stringify(opts.input)}` }],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "refusal", detail: response.stop_details?.explanation ?? "요청이 거절되었습니다.", latencyMs: elapsed() };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, reason: "truncated", detail: "응답이 max_tokens 에서 잘렸습니다.", latencyMs: elapsed() };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, reason: "invalid_json", detail: text.slice(0, 200), latencyMs: elapsed() };
    }
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, reason: "schema_mismatch", detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), latencyMs: elapsed() };
    }
    return { ok: true, data: parsed.data, model: response.model, latencyMs: elapsed() };
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, reason: "timeout", detail: `${TIMEOUT_MS}ms 초과`, latencyMs: elapsed() };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limit", detail: err.message, latencyMs: elapsed() };
    if (err instanceof Anthropic.APIError) return { ok: false, reason: "api_error", detail: `${err.status ?? ""} ${err.message}`.trim(), latencyMs: elapsed() };
    return { ok: false, reason: "api_error", detail: err instanceof Error ? err.message : String(err), latencyMs: elapsed() };
  }
}

export const FAILURE_MESSAGE: Record<AIFailureReason, string> = {
  no_key: "AI 키가 설정되지 않아 규칙 기반으로 분석했습니다.",
  timeout: "AI 응답이 지연되어 규칙 기반 결과를 표시합니다.",
  rate_limit: "AI 요청 한도에 도달해 규칙 기반 결과를 표시합니다.",
  api_error: "AI 호출에 실패해 규칙 기반 결과를 표시합니다.",
  refusal: "AI가 요청을 처리하지 않아 규칙 기반 결과를 표시합니다.",
  truncated: "AI 응답이 잘려 규칙 기반 결과를 표시합니다.",
  invalid_json: "AI 응답 형식이 올바르지 않아 규칙 기반 결과를 표시합니다.",
  schema_mismatch: "AI 응답 형식이 올바르지 않아 규칙 기반 결과를 표시합니다.",
};
