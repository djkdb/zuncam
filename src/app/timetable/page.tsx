"use client";

import { CalendarRange, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { TimetableForm } from "@/components/forms";
import { Button, Card, cx, EmptyState, Modal, Skeleton } from "@/components/ui";
import { WEEKDAY_LABEL, type TimetableEntry, type Weekday } from "@/lib/domain/types";
import { actions, useCampusStore, useClock } from "@/lib/store";
import { toMinutes, weekdayOf } from "@/lib/time";

const HOUR_PX = 52;
const COLORS = ["bg-blue-50 border-blue-300 text-blue-900", "bg-violet-50 border-violet-300 text-violet-900", "bg-emerald-50 border-emerald-300 text-emerald-900", "bg-amber-50 border-amber-300 text-amber-900", "bg-rose-50 border-rose-300 text-rose-900", "bg-cyan-50 border-cyan-300 text-cyan-900"];

function colorOf(subject: string) {
  let h = 0;
  for (const c of subject) h = (h * 31 + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

/** 같은 요일에서 겹치는 수업을 옆으로 나란히 배치하기 위한 lane 계산 */
function layoutDay(entries: TimetableEntry[]) {
  const sorted = [...entries].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const laneEnds: number[] = [];
  const placed = sorted.map((e) => {
    const s = toMinutes(e.startTime);
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = toMinutes(e.endTime);
    return { e, lane };
  });
  return placed.map((p) => ({ ...p, lanes: laneEnds.length, overlap: sorted.some((o) => o !== p.e && toMinutes(o.startTime) < toMinutes(p.e.endTime) && toMinutes(p.e.startTime) < toMinutes(o.endTime)) }));
}

export default function TimetablePage() {
  const { data, hydrated } = useCampusStore();
  const { clock } = useClock();
  const [editing, setEditing] = useState<Partial<TimetableEntry> | null>(null);
  const today = weekdayOf(clock.date);
  const [mobileDay, setMobileDay] = useState<Weekday | null>(null);
  const selectedDay = mobileDay ?? today;

  const hasWeekend = data.timetable.some((t) => t.weekday === 0 || t.weekday === 6);
  const days: Weekday[] = hasWeekend ? [1, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5];
  const minStart = Math.min(9 * 60, ...data.timetable.map((t) => toMinutes(t.startTime)));
  const maxEnd = Math.max(18 * 60, ...data.timetable.map((t) => toMinutes(t.endTime)));
  const gridStart = Math.floor(minStart / 60) * 60;
  const gridEnd = Math.ceil(maxEnd / 60) * 60;
  const hours = Array.from({ length: (gridEnd - gridStart) / 60 }, (_, i) => gridStart / 60 + i);

  const close = () => setEditing(null);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">Timetable</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">시간표</h1>
          <p className="mt-1 text-sm text-ink-500">매주 반복되는 수업. Today의 우선순위·이동·계획에 자동으로 반영됩니다.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing({ weekday: today === 0 || today === 6 ? 1 : today })}>
          <Plus className="size-4" /> 수업 추가
        </Button>
      </div>

      {!hydrated ? (
        <Skeleton className="h-96" />
      ) : data.timetable.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon={<CalendarRange className="size-8" />} title="등록된 수업이 없어요" description="수업을 추가하면 주간 시간표로 보여드려요." action={<Button onClick={() => setEditing({ weekday: 1 })}>첫 수업 추가</Button>} />
        </Card>
      ) : (
        <>
          {/* 데스크톱: 주간 그리드 */}
          <Card className="hidden overflow-x-auto p-4 md:block">
            <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div />
              {days.map((d) => (
                <div key={d} className={cx("pb-2 text-center text-xs font-semibold", d === today ? "text-indigo-600" : "text-ink-500")}>
                  {WEEKDAY_LABEL[d]}
                  {d === today && <span className="ml-1 text-[10px]">오늘</span>}
                </div>
              ))}
              <div className="relative" style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h, i) => (
                  <span key={h} className="tabular absolute right-2 -translate-y-1/2 text-[10px] text-ink-400" style={{ top: i * HOUR_PX }}>
                    {h}:00
                  </span>
                ))}
              </div>
              {days.map((d) => (
                <div key={d} className={cx("relative border-l border-ink-100", d === today && "bg-indigo-50/30")} style={{ height: hours.length * HOUR_PX }}>
                  {hours.map((h, i) => (
                    <div key={h} className="absolute inset-x-0 border-t border-ink-100" style={{ top: i * HOUR_PX }} />
                  ))}
                  {layoutDay(data.timetable.filter((t) => t.weekday === d)).map(({ e, lane, lanes, overlap }) => {
                    const top = ((toMinutes(e.startTime) - gridStart) / 60) * HOUR_PX;
                    const height = ((toMinutes(e.endTime) - toMinutes(e.startTime)) / 60) * HOUR_PX;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setEditing(e)}
                        className={cx("absolute overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight hover:brightness-95", colorOf(e.subject), overlap && "ring-2 ring-red-400")}
                        style={{ top: top + 1, height: height - 2, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                        title={overlap ? "다른 수업과 시간이 겹칩니다" : undefined}
                      >
                        <p className="font-semibold">{e.subject}</p>
                        <p className="tabular opacity-70">
                          {e.startTime}–{e.endTime}
                        </p>
                        {height > 50 && <p className="truncate opacity-70">{[e.location, e.room].filter(Boolean).join(" ")}</p>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>

          {/* 모바일: 요일 탭 + 목록 */}
          <div className="md:hidden">
            <div className="mb-3 grid grid-cols-7 gap-1 rounded-xl bg-ink-100 p-1">
              {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((d) => (
                <button key={d} type="button" onClick={() => setMobileDay(d)} className={cx("h-8 rounded-lg text-xs font-medium", selectedDay === d ? "bg-white shadow-sm" : "text-ink-500", d === today && "text-indigo-600")}>
                  {WEEKDAY_LABEL[d]}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {data.timetable
                .filter((t) => t.weekday === selectedDay)
                .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
                .map((e) => (
                  <button key={e.id} type="button" onClick={() => setEditing(e)} className={cx("w-full rounded-xl border-l-4 p-3 text-left", colorOf(e.subject))}>
                    <p className="tabular text-xs opacity-70">
                      {e.startTime} – {e.endTime}
                    </p>
                    <p className="font-semibold">{e.subject}</p>
                    <p className="flex items-center gap-1 text-xs opacity-70">
                      {e.professor && `${e.professor} 교수 · `}
                      {(e.location || e.room) && <MapPin className="size-3" />}
                      {[e.location, e.room].filter(Boolean).join(" ")}
                    </p>
                  </button>
                ))}
              {!data.timetable.some((t) => t.weekday === selectedDay) && <EmptyState title={`${WEEKDAY_LABEL[selectedDay]}요일에는 수업이 없어요`} />}
            </div>
          </div>
        </>
      )}

      <Modal open={editing !== null} onClose={close} title={editing?.id ? "수업 수정" : "수업 추가"}>
        {editing && (
          <TimetableForm
            initial={editing}
            onCancel={close}
            onSubmit={(d) => {
              actions.saveTimetable(d);
              close();
            }}
            onDelete={
              editing.id
                ? () => {
                    if (confirm(`'${editing.subject}' 수업을 삭제할까요?`)) {
                      actions.deleteTimetable(editing.id!);
                      close();
                    }
                  }
                : undefined
            }
          />
        )}
      </Modal>
    </div>
  );
}
