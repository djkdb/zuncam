"use client";

import {
  AlertTriangle,
  Bot,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock,
  Flame,
  Footprints,
  ListChecks,
  MapPin,
  RotateCcw,
  Route,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { AIContext } from "@/lib/ai/aiContext";
import type { AIMeta } from "@/lib/ai/meta";
import { useBriefing, useConflictAdvice } from "@/lib/ai/useAI";
import type { ValidBriefing } from "@/lib/ai/validate";
import type { AssignmentView, CampusContext, FixedBlock } from "@/lib/context/campusContext";
import { EVENT_CATEGORY_LABEL } from "@/lib/domain/types";
import { ruleRecommendation, ruleSummary } from "@/lib/engine/narrative";
import type { ActionPlan, PlanBlock } from "@/lib/engine/planner";
import type { PriorityItem } from "@/lib/engine/priority";
import { actions, clockActions } from "@/lib/store";
import { formatDuration, formatKoreanDate, fromMinutes, greeting, type DueTone } from "@/lib/time";
import { useCampusModel } from "@/lib/useCampusModel";
import { SourceBadge } from "../SourceBadge";
import { Badge, Button, Card, cx, EmptyState, inputCls, ProgressBar, SectionTitle, Skeleton, Spinner } from "../ui";
import { NowCard } from "./NowCard";

export function TodayDashboard() {
  const m = useCampusModel();
  const briefing = useBriefing(m.data, m.clock, m.aiContext, m.hydrated && !m.isEmpty);
  const conflictAdvice = useConflictAdvice(m.aiContext.conflicts, m.hydrated && !m.isEmpty);

  if (!m.hydrated) return <DashboardSkeleton />;
  if (m.isEmpty) return <Welcome today={m.clock.date} name={m.data.settings.userName} />;

  const { ctx, priorities, plan, advice, aiContext } = m;
  const name = m.data.settings.userName;
  const summary = briefing.briefing?.summary ?? ruleSummary(ctx, priorities.items);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <header>
        <p className="tabular text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">
          Today · {formatKoreanDate(ctx.now.date)} {fromMinutes(ctx.now.minutes)}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {greeting(ctx.now.minutes)}, {name ? `${name}님` : "반가워요"}.
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-ink-600">
          {briefing.loading && !briefing.briefing ? <span className="text-ink-400">{ruleSummary(ctx, priorities.items)}</span> : summary}
        </p>
      </header>

      <Glance ctx={ctx} priorities={priorities.items} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <NowCard advice={advice} context={aiContext} ctx={ctx} />
          <PriorityList items={priorities.items} briefing={briefing.briefing} />
          <Recommendation ctx={ctx} plan={plan} briefing={briefing} />
          <PlanTimeline plan={plan} now={ctx.now.minutes} notes={briefing.briefing?.planNotes ?? {}} />
        </div>
        <div className="space-y-5">
          <NextCard ctx={ctx} />
          <Deadlines items={ctx.openAssignments} />
          <Conflicts conflicts={aiContext.conflicts} state={conflictAdvice} />
        </div>
      </div>
    </div>
  );
}

// ── 5초 요약 ────────────────────────────────────────────────────────────────────
function Glance({ ctx, priorities }: { ctx: CampusContext; priorities: PriorityItem[] }) {
  const top = priorities[0];
  const next = ctx.currentBlock ?? ctx.nextBlock;
  const urgent = ctx.openAssignments[0];
  const depart = ctx.todayBlocks.find((b) => b.departAt !== null && b.departAt >= ctx.now.minutes);
  const tiles = [
    { icon: Flame, label: "가장 중요한 일", value: top?.title ?? "없음", sub: top?.facts[0] ?? "" },
    {
      icon: Clock,
      label: ctx.currentBlock ? "진행 중" : "다음 일정",
      value: next?.title ?? "남은 일정 없음",
      sub: next ? `${fromMinutes(next.start)} ~ ${fromMinutes(next.end)}` : "",
    },
    { icon: ListChecks, label: "마감 임박", value: urgent?.title ?? "없음", sub: urgent?.due.text ?? "" },
    {
      icon: Footprints,
      label: "이동",
      value: depart ? `${fromMinutes(depart.departAt!)} 출발` : "이동 없음",
      sub: depart ? `${depart.title} · ${depart.travel.minutes}분${depart.travel.source === "estimate" ? " 추정" : ""}` : "",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {tiles.map(({ icon: Icon, label, value, sub }) => (
        <div key={label} className="rounded-xl border border-ink-200 bg-white px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] text-ink-500">
            <Icon className="size-3.5" /> {label}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
          <p className="tabular truncate text-xs text-ink-500">{sub || " "}</p>
        </div>
      ))}
    </div>
  );
}

// ── 오늘의 우선순위 ─────────────────────────────────────────────────────────────
const KIND_BADGE = { assignment: { tone: "violet", label: "과제" }, class: { tone: "blue", label: "수업" }, event: { tone: "emerald", label: "일정" } } as const;

function PriorityList({ items, briefing }: { items: PriorityItem[]; briefing: ValidBriefing | null }) {
  return (
    <Card className="p-5">
      <SectionTitle icon={<Flame className="size-3.5 text-orange-500" />}>오늘의 우선순위</SectionTitle>
      {items.length === 0 ? (
        <EmptyState title="오늘 챙길 일이 없어요" description="남은 과제와 일정이 모두 끝났습니다." />
      ) : (
        <ol className="space-y-2">
          {items.map((p, i) => (
            <li key={p.id} className="rounded-xl border border-ink-100 p-3">
              <div className="flex items-start gap-3">
                <span className={cx("tabular grid size-7 shrink-0 place-items-center rounded-lg text-sm font-bold", i === 0 ? "bg-orange-500 text-white" : "bg-ink-100 text-ink-600")}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-semibold">{p.title}</p>
                    <Badge tone={KIND_BADGE[p.kind].tone}>{KIND_BADGE[p.kind].label}</Badge>
                  </div>
                  <p className="tabular mt-0.5 text-xs text-ink-500">{p.facts.join(" · ")}</p>
                  <p className="mt-1.5 text-sm text-ink-700">{briefing?.priorityReasons[p.id] ?? p.reason}</p>
                  <details className="mt-1.5 text-xs text-ink-500">
                    <summary className="cursor-pointer select-none">점수 근거 {p.score}점</summary>
                    <ul className="tabular mt-1 space-y-0.5">
                      {p.factors.map((f) => (
                        <li key={f.label} className="flex justify-between gap-4">
                          <span>{f.label}</span>
                          <span>+{f.points}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <ScoreBar score={p.score} />
                  {p.kind === "assignment" && (
                    <button type="button" onClick={() => actions.setAssignmentStatus(p.refId, "done")} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1 text-[11px] text-ink-600 hover:bg-ink-50" title="완료 처리하면 우선순위와 계획에서 빠집니다">
                      <Check className="size-3" /> 완료
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`우선순위 점수 ${score}`}>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${score}%` }} />
      </div>
      <span className="tabular w-6 text-right text-xs font-semibold text-ink-600">{score}</span>
    </div>
  );
}

// ── AI 추천 ─────────────────────────────────────────────────────────────────────
function Recommendation({
  ctx,
  plan,
  briefing,
}: {
  ctx: CampusContext;
  plan: ActionPlan;
  briefing: { briefing: ValidBriefing | null; meta: AIMeta | null; at: number | null; loading: boolean; refresh: () => void };
}) {
  const b = briefing.briefing;
  const text = b?.recommendation ?? ruleRecommendation(ctx, plan);
  const warnings = b && b.warnings.length ? b.warnings : plan.warnings.slice(0, 3);
  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5">
      <SectionTitle
        icon={<Bot className="size-3.5 text-indigo-600" />}
        right={
          <div className="flex items-center gap-2">
            {briefing.at !== null && <span className="tabular text-[11px] text-ink-400">{fromMinutes(briefing.at)} 기준</span>}
            <SourceBadge meta={briefing.meta} />
            <button type="button" onClick={briefing.refresh} disabled={briefing.loading} className="rounded-md p-1 text-ink-400 hover:bg-indigo-100 hover:text-indigo-700 disabled:opacity-50" aria-label="다시 분석">
              {briefing.loading ? <Spinner /> : <RotateCcw className="size-3.5" />}
            </button>
          </div>
        }
      >
        <span className="text-indigo-700">AI Recommendation</span>
      </SectionTitle>
      {briefing.loading && !b ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full bg-indigo-100/70" />
          <Skeleton className="h-4 w-4/5 bg-indigo-100/70" />
        </div>
      ) : (
        <p className="text-[15px] leading-relaxed text-ink-800">{text}</p>
      )}
      {briefing.meta?.fallbackMessage && <p className="mt-2 text-xs text-ink-400">{briefing.meta.fallbackMessage}</p>}
      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {warnings.map((w) => (
            <li key={w} className="flex gap-1.5 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 행동 계획 타임라인 ──────────────────────────────────────────────────────────
const PLAN_STYLE: Record<PlanBlock["type"], { bar: string; label: string }> = {
  class: { bar: "bg-blue-500", label: "수업" },
  event: { bar: "bg-emerald-500", label: "일정" },
  travel: { bar: "bg-amber-400", label: "이동" },
  work: { bar: "bg-violet-500", label: "과제" },
  meal: { bar: "bg-ink-300", label: "식사" },
};

function PlanTimeline({ plan, now, notes }: { plan: ActionPlan; now: number; notes: Record<string, string> }) {
  return (
    <Card className="p-5">
      <SectionTitle
        icon={<Route className="size-3.5" />}
        right={
          <span className="tabular text-[11px] text-ink-400">
            과제 {formatDuration(plan.workMinutes)} · 여유 {formatDuration(plan.freeMinutes)}
          </span>
        }
      >
        오늘의 행동 계획
      </SectionTitle>
      {plan.blocks.length === 0 ? (
        <EmptyState title="남은 계획이 없어요" description={plan.windowStart >= plan.windowEnd ? "오늘 계획 시간이 끝났습니다." : "고정 일정과 과제가 없습니다."} />
      ) : (
        <ol className="relative space-y-1">
          {plan.blocks.map((b) => {
            const active = b.start <= now && now < b.end;
            return (
              <li key={b.id} className={cx("flex gap-3 rounded-xl px-2 py-2", active && "bg-ink-50 ring-1 ring-ink-200")}>
                <span className="tabular w-[92px] shrink-0 pt-0.5 text-xs text-ink-500">
                  {fromMinutes(b.start)} – {fromMinutes(b.end)}
                </span>
                <span className={cx("w-1 shrink-0 rounded-full", PLAN_STYLE[b.type].bar)} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {b.title}
                    <span className="text-[11px] font-normal text-ink-400">{PLAN_STYLE[b.type].label}</span>
                    {active && <Badge tone="orange">지금</Badge>}
                  </p>
                  <p className="text-xs text-ink-500">{notes[b.id] ?? b.reason}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {plan.unscheduled.length > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          오늘 계획에 다 넣지 못한 작업: {plan.unscheduled.map((u) => `${u.title}(${formatDuration(u.neededMinutes - u.scheduledMinutes)} 부족)`).join(", ")}
        </p>
      )}
    </Card>
  );
}

// ── NEXT ───────────────────────────────────────────────────────────────────────
function NextCard({ ctx }: { ctx: CampusContext }) {
  const upcoming = ctx.todayBlocks.filter((b) => b.end > ctx.now.minutes).slice(0, 3);
  return (
    <Card className="p-5">
      <SectionTitle icon={<Clock className="size-3.5" />}>Next</SectionTitle>
      {upcoming.length === 0 ? (
        <EmptyState title="오늘 남은 일정이 없어요" action={<Link href="/events" className="text-xs font-medium text-indigo-600">일정 추가하기</Link>} />
      ) : (
        <ul className="space-y-3">
          {upcoming.map((b, i) => (
            <BlockRow key={b.id} block={b} now={ctx.now.minutes} emphasize={i === 0} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function BlockRow({ block: b, now, emphasize }: { block: FixedBlock; now: number; emphasize: boolean }) {
  const ongoing = b.start <= now;
  const departIn = b.departAt !== null ? b.departAt - now : null;
  return (
    <li className={cx("rounded-xl p-3", emphasize ? "bg-ink-50" : "")}>
      <div className="flex items-center gap-1.5">
        <Badge tone={b.kind === "class" ? "blue" : "emerald"}>{b.kind === "class" ? "수업" : EVENT_CATEGORY_LABEL[b.category as keyof typeof EVENT_CATEGORY_LABEL]}</Badge>
        {ongoing && <Badge tone="orange">진행 중</Badge>}
      </div>
      <p className={cx("mt-1 font-semibold", emphasize && "text-lg")}>{b.title}</p>
      <p className="tabular text-sm text-ink-600">
        {fromMinutes(b.start)} ~ {fromMinutes(b.end)}
      </p>
      {b.location && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
          <MapPin className="size-3" /> {b.location}
        </p>
      )}
      {!ongoing && b.departAt !== null && b.travel.minutes > 0 && (
        <p className={cx("tabular mt-1.5 flex items-center gap-1 text-xs font-medium", departIn !== null && departIn <= 30 ? "text-red-600" : "text-amber-700")}>
          <Footprints className="size-3.5" />
          {fromMinutes(b.departAt)} 출발 권장
          {departIn !== null && departIn >= 0 && ` (${formatDuration(departIn)} 후)`} · 이동 {b.travel.minutes}분{b.travel.source === "estimate" ? " 추정" : ""}
        </p>
      )}
    </li>
  );
}

// ── 마감 임박 과제 ─────────────────────────────────────────────────────────────
const DUE_TONE: Record<DueTone, "red" | "orange" | "amber" | "neutral"> = { overdue: "red", critical: "red", soon: "orange", normal: "amber", far: "neutral" };

function Deadlines({ items }: { items: AssignmentView[] }) {
  const list = items.filter((a) => a.minutesLeft <= 7 * 24 * 60).slice(0, 5);
  return (
    <Card className="p-5">
      <SectionTitle
        icon={<ListChecks className="size-3.5" />}
        right={
          <Link href="/assignments" className="flex items-center text-[11px] text-ink-400 hover:text-ink-700">
            전체 <ChevronRight className="size-3" />
          </Link>
        }
      >
        Assignments
      </SectionTitle>
      {list.length === 0 ? (
        <EmptyState title="일주일 안에 마감되는 과제가 없어요" />
      ) : (
        <ul className="divide-y divide-ink-100">
          {list.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2.5">
              <button
                type="button"
                onClick={() => actions.setAssignmentStatus(a.id, "done")}
                className="grid size-5 shrink-0 place-items-center rounded-md border border-ink-300 text-transparent hover:border-emerald-500 hover:text-emerald-500"
                aria-label={`${a.title} 완료 처리`}
              >
                <Check className="size-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.title}</p>
                <p className="text-xs text-ink-500">
                  {a.subject && `${a.subject} · `}
                  {a.loggedMinutes > 0 ? `남은 ${formatDuration(a.remainingMinutes)}` : formatDuration(a.estimatedMinutes)}
                  {a.status === "in_progress" && " · 진행 중"}
                </p>
                {a.loggedMinutes > 0 && <ProgressBar done={a.loggedMinutes} total={a.estimatedMinutes} />}
              </div>
              <Badge tone={DUE_TONE[a.due.tone]} className="tabular">
                {a.due.text}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── 일정 충돌 ──────────────────────────────────────────────────────────────────
function Conflicts({ conflicts, state }: { conflicts: AIContext["conflicts"]; state: ReturnType<typeof useConflictAdvice> }) {
  if (conflicts.length === 0) return null;
  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5">
      <SectionTitle icon={<AlertTriangle className="size-3.5 text-orange-600" />} right={<SourceBadge meta={state.meta} />}>
        <span className="text-orange-700">일정 충돌 {conflicts.length}건</span>
      </SectionTitle>
      <ul className="space-y-3">
        {conflicts.map((c) => {
          const adv = state.advice[c.id];
          return (
            <li key={c.id} className="rounded-xl bg-white p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5">
                <Badge tone={c.type === "overlap" ? "red" : "amber"}>{c.type === "overlap" ? "시간 겹침" : "이동시간 부족"}</Badge>
                <span className="text-xs text-ink-500">{formatKoreanDate(c.date)}</span>
              </div>
              <p className="tabular text-xs text-ink-600">
                {c.a.start}–{c.a.end} {c.a.title} / {c.b.start}–{c.b.end} {c.b.title}
              </p>
              <p className="mt-1.5 text-ink-800">{adv?.explanation ?? c.message}</p>
              {state.loading ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-400">
                  <Spinner /> 해결 방법 분석 중…
                </p>
              ) : adv ? (
                <p className="mt-1.5 flex gap-1.5 text-sm text-indigo-800">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0" /> {adv.suggestion}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {state.meta?.fallbackMessage && <p className="mt-2 text-xs text-ink-400">{state.meta.fallbackMessage}</p>}
      <Link href="/events" className="mt-3 inline-flex items-center text-xs font-medium text-orange-700">
        일정 수정하러 가기 <ChevronRight className="size-3" />
      </Link>
    </section>
  );
}

// ── 빈 상태 / 로딩 ─────────────────────────────────────────────────────────────
function Welcome({ today, name }: { today: string; name: string }) {
  const [n, setN] = useState(name);
  return (
    <div className="mx-auto max-w-2xl space-y-5 py-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">Today · {formatKoreanDate(today)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Campus OS에 오신 걸 환영해요.</h1>
        <p className="mt-2 text-sm text-ink-600">시간표·과제·일정을 한곳에 모으면, 지금 무엇을 해야 하는지 계산해서 알려드려요.</p>
      </div>
      <Card className="space-y-3 p-5">
        <label className="block text-sm font-medium">어떻게 불러드릴까요?</label>
        <div className="flex gap-2">
          <input className={inputCls} value={n} onChange={(e) => setN(e.target.value)} placeholder="이름" maxLength={20} />
          <Button variant="primary" onClick={() => actions.updateSettings({ userName: n.trim() })} disabled={!n.trim() || n.trim() === name}>
            저장
          </Button>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/timetable", title: "1. 시간표 입력", desc: "매주 반복되는 수업" },
          { href: "/assignments", title: "2. 과제 등록", desc: "마감일과 예상 소요시간" },
          { href: "/events", title: "3. 일정 추가", desc: "약속·동아리·운동" },
        ].map((s) => (
          <Link key={s.href} href={s.href} className="rounded-2xl border border-ink-200 bg-white p-4 hover:border-ink-300">
            <p className="text-sm font-semibold">{s.title}</p>
            <p className="mt-0.5 text-xs text-ink-500">{s.desc}</p>
          </Link>
        ))}
      </div>
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <CalendarPlus className="size-4" /> 먼저 둘러보고 싶다면
          </p>
          <p className="mt-0.5 text-xs text-ink-500">오늘 날짜 기준 샘플 시간표·과제·일정을 불러옵니다. 설정에서 언제든 지울 수 있어요.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            onClick={() => {
              actions.loadDemo(today);
              clockActions.setOverride({ date: today, time: "16:10" });
            }}
          >
            데모 시나리오 (16:10 고정)
          </Button>
          <Button variant="primary" onClick={() => actions.loadDemo(today)}>
            샘플 데이터만 불러오기
          </Button>
        </div>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
