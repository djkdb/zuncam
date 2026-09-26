"use client";

import { ArrowRight, Check, Compass, Pause, Play, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type { AIContext } from "@/lib/ai/aiContext";
import { useNowExplanation } from "@/lib/ai/useAI";
import type { CampusContext } from "@/lib/context/campusContext";
import type { NowAdvice } from "@/lib/engine/nowAdvisor";
import { actions } from "@/lib/store";
import { formatDuration, fromMinutes } from "@/lib/time";
import { SourceBadge } from "../SourceBadge";
import { Spinner } from "../ui";

const MODE_LABEL: Record<NowAdvice["mode"], string> = {
  focus: "집중",
  in_block: "진행 중",
  depart: "출발",
  meal: "식사",
  short_gap: "짧은 틈",
  free: "여유",
  day_over: "하루 마감",
};

/**
 * "지금 뭐 하지?" — Campus OS 대표 기능.
 * 판단은 nowAdvisor(코드), 설명은 AI. 추천을 받으면 바로 "지금 시작"으로 집중 세션을 열고,
 * 멈출 때 경과 시간이 진행 기록으로 남아 다음 계획에 반영된다 (계획 → 실행 → 기록 → 재계획).
 */
export function NowCard({ advice, context, ctx }: { advice: NowAdvice; context: AIContext; ctx: CampusContext }) {
  const { loading, result, at, ask, reset } = useNowExplanation();
  const [saved, setSaved] = useState<string | null>(null);
  const session = ctx.activeSession;
  const asked = at !== null;
  const stale = asked && at !== context.currentTime;
  const canStart = !session && advice.mode === "focus" && advice.targetRefId !== null;

  const stop = (done: boolean) => {
    const minutes = actions.stopSession(ctx.now, done);
    setSaved(done ? `완료! ${formatDuration(minutes)} 기록했어요.` : `${formatDuration(minutes)} 기록했어요. 계획이 다시 계산됩니다.`);
    reset();
  };

  return (
    <section className="rounded-2xl bg-ink-900 p-5 text-white sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-white/50 uppercase">Now · {context.currentTime}</p>
          <h2 className="mt-1 text-lg font-semibold">지금 뭐 하지?</h2>
        </div>
        {asked && !stale && result && <SourceBadge meta={result.meta} />}
      </div>

      {session && (
        <div className="mt-4 rounded-xl bg-emerald-500/15 p-4 ring-1 ring-emerald-400/30">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
            <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> 집중 중 · {fromMinutes(session.startMinutes)} 시작
          </p>
          <p className="mt-1 text-lg font-semibold">{session.title}</p>
          <p className="tabular text-sm text-white/70">
            {formatDuration(session.elapsed)}째
            {advice.targetRefId === session.refId && advice.end > advice.start && ` · ${fromMinutes(advice.end)}까지 가능`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => stop(false)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-medium hover:bg-white/20">
              <Pause className="size-4" /> 기록하고 멈추기
            </button>
            <button type="button" onClick={() => stop(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-ink-900 hover:bg-emerald-400">
              <Check className="size-4" /> 완료했어요
            </button>
            <button type="button" onClick={() => actions.cancelSession()} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-white/50 hover:text-white" title="기록하지 않고 세션만 닫기">
              <X className="size-3.5" /> 취소
            </button>
          </div>
        </div>
      )}

      {saved && !session && (
        <p className="mt-3 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm text-emerald-300">
          {saved}
          <button type="button" className="text-xs text-white/40" onClick={() => setSaved(null)}>
            닫기
          </button>
        </p>
      )}

      {!asked ? (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-white/70">
            {advice.nextStop ? (
              <>
                다음 고정 일정: <b className="text-white">{advice.nextStop.label}</b> {fromMinutes(advice.nextStop.at)}
              </>
            ) : (
              "현재 시간과 일정, 과제를 분석해 지금 할 일을 알려드려요."
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setSaved(null);
              ask(context);
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-ink-900 hover:bg-white/90"
          >
            <Compass className="size-4" /> 지금 뭐 하지?
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-medium">{MODE_LABEL[advice.mode]}</span>
              {advice.end > advice.start && (
                <span className="tabular inline-flex items-center gap-1 text-white/70">
                  {fromMinutes(advice.start)} <ArrowRight className="size-3" /> {fromMinutes(advice.end)}
                  {advice.focusMinutes > 0 && ` · ${formatDuration(advice.focusMinutes)}`}
                </span>
              )}
            </div>
            <p className="text-xl leading-snug font-semibold sm:text-2xl">{advice.headline}</p>
          </div>

          <div className="rounded-xl bg-white/5 p-3.5">
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-white/60">
                <Spinner /> AI가 설명을 작성하고 있어요…
              </p>
            ) : result?.message ? (
              <>
                <p className="text-sm leading-relaxed text-white/90">{result.message}</p>
                {result.tips.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-white/60">
                    {result.tips.map((t) => (
                      <li key={t}>· {t}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <ul className="space-y-1 text-sm text-white/80">
                  {advice.reasons.map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
                </ul>
                {result?.meta.fallbackMessage && <p className="mt-2 text-xs text-white/40">{result.meta.fallbackMessage}</p>}
                {result?.meta.source === "ai" && !result.message && <p className="mt-2 text-xs text-white/40">AI 설명이 계산 결과와 맞지 않아 계산 근거를 표시합니다.</p>}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canStart && (
              <button
                type="button"
                onClick={() => {
                  actions.startSession(advice.targetRefId!, ctx.now);
                  setSaved(null);
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-ink-900 hover:bg-emerald-400"
              >
                <Play className="size-4" /> 지금 시작
              </button>
            )}
            {stale && (
              <button type="button" onClick={() => ask(context)} className="inline-flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-white">
                <RotateCcw className="size-3.5" /> {at} 기준 결과예요. 지금 시각으로 다시 묻기
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
