"use client";

import { AlertTriangle, CalendarClock, Footprints, MapPin, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { EventDraftWarnings } from "@/components/EventDraftWarnings";
import { EventForm } from "@/components/forms";
import { Badge, Button, Card, cx, EmptyState, Modal, Skeleton } from "@/components/ui";
import { blocksForDate, detectConflicts, type Conflict } from "@/lib/context/campusContext";
import { EVENT_CATEGORY_LABEL, type CampusEvent, type EventCategory } from "@/lib/domain/types";
import { actions, useCampusStore, useClock } from "@/lib/store";
import { diffDays, formatKoreanDate, fromMinutes } from "@/lib/time";

const CATEGORY_TONE: Record<EventCategory, "blue" | "indigo" | "violet" | "emerald" | "amber" | "neutral"> = {
  school: "blue",
  appointment: "amber",
  club: "violet",
  exercise: "emerald",
  personal: "indigo",
  etc: "neutral",
};

export default function EventsPage() {
  const { data, hydrated } = useCampusStore();
  const { clock } = useClock();
  const [showPast, setShowPast] = useState(false);
  const [editing, setEditing] = useState<Partial<CampusEvent> | null>(null);

  const { groups, conflictsByEvent, departByEvent } = useMemo(() => {
    const list = data.events.filter((e) => (showPast ? e.date < clock.date : e.date >= clock.date)).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    if (showPast) list.reverse();
    const groups = new Map<string, CampusEvent[]>();
    for (const e of list) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);
    const conflictsByEvent = new Map<string, Conflict[]>();
    const departByEvent = new Map<string, { at: number; minutes: number; estimate: boolean }>();
    for (const date of groups.keys()) {
      const blocks = blocksForDate(data, date);
      for (const b of blocks) if (b.kind === "event" && b.departAt !== null && b.travel.minutes > 0) departByEvent.set(b.refId, { at: b.departAt, minutes: b.travel.minutes, estimate: b.travel.source === "estimate" });
      for (const c of detectConflicts(blocks)) {
        for (const ref of [c.a, c.b]) if (ref.kind === "event") conflictsByEvent.set(ref.refId, [...(conflictsByEvent.get(ref.refId) ?? []), c]);
      }
    }
    return { groups, conflictsByEvent, departByEvent };
  }, [data, clock.date, showPast]);

  const close = () => setEditing(null);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">Events</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">개인 일정</h1>
          <p className="mt-1 text-sm text-ink-500">수업과 겹치거나 이동시간이 부족하면 바로 알려드려요.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing({ date: clock.date })}>
          <Plus className="size-4" /> 일정 추가
        </Button>
      </div>

      <div className="inline-flex rounded-xl bg-ink-100 p-1">
        {[false, true].map((past) => (
          <button key={String(past)} type="button" onClick={() => setShowPast(past)} className={cx("h-8 rounded-lg px-3 text-xs font-medium", showPast === past ? "bg-white shadow-sm" : "text-ink-500")}>
            {past ? "지난 일정" : "다가오는 일정"}
          </button>
        ))}
      </div>

      {!hydrated ? (
        <Skeleton className="h-40" />
      ) : groups.size === 0 ? (
        <Card className="p-5">
          <EmptyState
            icon={<CalendarClock className="size-8" />}
            title={showPast ? "지난 일정이 없어요" : "다가오는 일정이 없어요"}
            description={showPast ? undefined : "상단의 '자연어로 추가'로 “금요일 6시에 풋살 있어”처럼 입력해도 돼요."}
            action={!showPast ? <Button onClick={() => setEditing({ date: clock.date })}>일정 추가</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([date, events]) => {
            const d = diffDays(clock.date, date);
            return (
              <section key={date}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {formatKoreanDate(date)}
                  {d === 0 && <Badge tone="orange">오늘</Badge>}
                  {d === 1 && <Badge>내일</Badge>}
                </h2>
                <Card className="divide-y divide-ink-100">
                  {events.map((e) => {
                    const conflicts = conflictsByEvent.get(e.id) ?? [];
                    const depart = departByEvent.get(e.id);
                    return (
                      <button key={e.id} type="button" onClick={() => setEditing(e)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-ink-50">
                        <span className="tabular w-24 shrink-0 text-sm text-ink-600">
                          {e.startTime}–{e.endTime}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 font-medium">
                            {e.title} <Badge tone={CATEGORY_TONE[e.category]}>{EVENT_CATEGORY_LABEL[e.category]}</Badge>
                          </p>
                          {e.location && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                              <MapPin className="size-3" /> {e.location}
                            </p>
                          )}
                          {depart && (
                            <p className="tabular mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                              <Footprints className="size-3" /> {fromMinutes(depart.at)} 출발 권장 · 이동 {depart.minutes}분{depart.estimate ? " 추정" : ""}
                            </p>
                          )}
                          {conflicts.map((c) => (
                            <p key={c.id} className="mt-1 flex items-start gap-1 text-xs text-red-600">
                              <AlertTriangle className="mt-px size-3 shrink-0" /> {c.message}
                            </p>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </Card>
              </section>
            );
          })}
        </div>
      )}

      <Modal open={editing !== null} onClose={close} title={editing?.id ? "일정 수정" : "일정 추가"}>
        {editing && (
          <EventForm
            initial={editing}
            onCancel={close}
            onSubmit={(d) => {
              actions.saveEvent(d);
              close();
            }}
            onDelete={
              editing.id
                ? () => {
                    if (confirm(`'${editing.title}' 일정을 삭제할까요?`)) {
                      actions.deleteEvent(editing.id!);
                      close();
                    }
                  }
                : undefined
            }
            footer={(d) => <EventDraftWarnings draft={d} />}
          />
        )}
      </Modal>
    </div>
  );
}
