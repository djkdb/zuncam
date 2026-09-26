"use client";

import type { AIContext } from "./aiContext";
import type { AIMeta } from "./meta";
import type { ValidBriefing } from "./validate";
import type { ParsedDraft } from "../nlp/resolve";

/**
 * 브라우저 → /api/ai/* 호출. 네트워크 오류/타임아웃도 규칙 기반 폴백으로 처리할 수 있게
 * 예외 대신 { meta.source: "rules" } 형태로 정규화한다.
 */

const CLIENT_TIMEOUT_MS = 30_000;

function offlineMeta(message: string, detail: string): AIMeta {
  return { source: "rules", promptVersion: "-", model: null, latencyMs: 0, fallbackMessage: message, issues: [detail] };
}

async function post<T>(url: string, body: unknown, empty: Omit<T, "meta">): Promise<T & { meta: AIMeta }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) return { ...(empty as T), meta: offlineMeta("AI 서버 요청이 실패해 규칙 기반 결과를 표시합니다.", `HTTP ${res.status}`) };
    return (await res.json()) as T & { meta: AIMeta };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      ...(empty as T),
      meta: offlineMeta(aborted ? "AI 응답이 지연되어 규칙 기반 결과를 표시합니다." : "네트워크 오류로 규칙 기반 결과를 표시합니다.", String(e)),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const aiApi = {
  briefing: (context: AIContext) => post<{ briefing: ValidBriefing | null }>("/api/ai/briefing", { context }, { briefing: null }),
  now: (context: AIContext) => post<{ now: { message: string | null; tips: string[] } | null }>("/api/ai/now", { context }, { now: null }),
  conflicts: (conflicts: AIContext["conflicts"]) =>
    post<{ advice: Record<string, { explanation: string; suggestion: string }> }>("/api/ai/conflicts", { conflicts }, { advice: {} }),
  /** 파싱은 폴백이 서버에 있으므로, 서버 자체에 닿지 못하면 null → 클라이언트에서 규칙 파서 실행 */
  parse: (text: string, today: string, subjects: string[]) => post<{ draft: ParsedDraft | null }>("/api/ai/parse", { text, today, subjects }, { draft: null }),
  async status(): Promise<{ enabled: boolean; model: string | null }> {
    try {
      const res = await fetch("/api/ai/status");
      return res.ok ? await res.json() : { enabled: false, model: null };
    } catch {
      return { enabled: false, model: null };
    }
  },
};
