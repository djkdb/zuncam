"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CampusData } from "../domain/types";
import type { Clock } from "../time";
import type { AIContext } from "./aiContext";
import { aiApi } from "./clientApi";
import type { AIMeta } from "./meta";
import type { ValidBriefing } from "./validate";

/** 짧은 해시 (캐시 키용) */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const BRIEFING_KEY = "campus-os:briefing";
/** 이 시간(분)이 지나면 브리핑을 다시 생성한다 */
const BRIEFING_TTL = 60;

interface BriefingCache {
  key: string;
  date: string;
  at: number;
  briefing: ValidBriefing | null;
  meta: AIMeta;
}

function readCache(): BriefingCache | null {
  try {
    const raw = window.sessionStorage.getItem(BRIEFING_KEY);
    return raw ? (JSON.parse(raw) as BriefingCache) : null;
  } catch {
    return null;
  }
}

/**
 * AI 브리핑: 데이터가 바뀌었거나, 날짜가 바뀌었거나, 60분이 지나면 자동으로 다시 생성한다.
 * 매 분 바뀌는 "남은 시간" 때문에 컨텍스트 자체로 캐시 키를 만들면 매 분 재호출된다 → 원천 데이터로 키를 만든다
 * (docs/troubleshooting.md 참고).
 */
export function useBriefing(data: CampusData, clock: Clock, context: AIContext, enabled: boolean) {
  const key = hash(JSON.stringify(data));
  const [cache, setCache] = useState<BriefingCache | null>(null);
  const [loading, setLoading] = useState(false);
  const inflight = useRef<string | null>(null);
  const ctxRef = useRef(context);
  ctxRef.current = context;

  const fresh = (c: BriefingCache | null) => c && c.key === key && c.date === clock.date && Math.abs(clock.minutes - c.at) < BRIEFING_TTL;

  const run = useCallback(async () => {
    const reqKey = `${key}:${clock.date}`;
    if (inflight.current === reqKey) return;
    inflight.current = reqKey;
    setLoading(true);
    const res = await aiApi.briefing(ctxRef.current);
    const next: BriefingCache = { key, date: clock.date, at: clock.minutes, briefing: res.briefing, meta: res.meta };
    try {
      window.sessionStorage.setItem(BRIEFING_KEY, JSON.stringify(next));
    } catch {
      /* 캐시 실패는 무시 */
    }
    setCache(next);
    setLoading(false);
    inflight.current = null;
  }, [key, clock.date, clock.minutes]);

  useEffect(() => {
    if (!enabled) return;
    const stored = cache ?? readCache();
    if (fresh(stored)) {
      if (stored !== cache) setCache(stored);
      return;
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, clock.date, clock.minutes]);

  const valid = fresh(cache) ? cache : null;
  return { briefing: valid?.briefing ?? null, meta: valid?.meta ?? null, at: valid?.at ?? null, loading, refresh: run };
}

export interface NowResult {
  message: string | null;
  tips: string[];
  meta: AIMeta;
}

export function useNowExplanation() {
  const [state, setState] = useState<{ loading: boolean; result: NowResult | null; at: string | null }>({ loading: false, result: null, at: null });
  const ask = useCallback(async (context: AIContext) => {
    setState({ loading: true, result: null, at: context.currentTime });
    const res = await aiApi.now(context);
    setState({ loading: false, result: { message: res.now?.message ?? null, tips: res.now?.tips ?? [], meta: res.meta }, at: context.currentTime });
  }, []);
  const reset = useCallback(() => setState({ loading: false, result: null, at: null }), []);
  return { ...state, ask, reset };
}

export function useConflictAdvice(conflicts: AIContext["conflicts"], enabled: boolean) {
  const key = conflicts.map((c) => c.id).join(",");
  const [state, setState] = useState<{ key: string; loading: boolean; advice: Record<string, { explanation: string; suggestion: string }>; meta: AIMeta | null }>({
    key: "",
    loading: false,
    advice: {},
    meta: null,
  });
  const ref = useRef(conflicts);
  ref.current = conflicts;

  useEffect(() => {
    if (!enabled || !key || state.key === key) return;
    let cancelled = false;
    setState({ key, loading: true, advice: {}, meta: null });
    aiApi.conflicts(ref.current.slice(0, 10)).then((res) => {
      if (!cancelled) setState({ key, loading: false, advice: res.advice, meta: res.meta });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return state.key === key ? state : { key, loading: Boolean(key) && enabled, advice: {}, meta: null };
}
