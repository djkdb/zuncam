"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  EVENT_CATEGORY_LABEL,
  IMPORTANCE_LABEL,
  STATUS_LABEL,
  WEEKDAY_LABEL,
  type Assignment,
  type AssignmentStatus,
  type CampusEvent,
  type EventCategory,
  type Importance,
  type TimetableEntry,
  type Weekday,
} from "@/lib/domain/types";
import { toMinutes } from "@/lib/time";
import { Button, Field, inputCls, textareaCls } from "./ui";

type Draft<T> = Omit<T, "id" | "createdAt" | "updatedAt"> & { id?: string };

function Actions({ onDelete, onCancel, submitLabel }: { onDelete?: () => void; onCancel: () => void; submitLabel: string }) {
  return (
    <div className="mt-5 flex items-center gap-2">
      {onDelete && (
        <Button variant="danger" onClick={onDelete}>
          삭제
        </Button>
      )}
      <div className="flex-1" />
      <Button variant="ghost" onClick={onCancel}>
        취소
      </Button>
      <Button variant="primary" type="submit">
        {submitLabel}
      </Button>
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function timeRangeError(start: string, end: string) {
  if (!start || !end) return "시간을 입력하세요";
  return toMinutes(end) <= toMinutes(start) ? "종료 시간은 시작 시간보다 늦어야 합니다" : undefined;
}

// ── 시간표 ──────────────────────────────────────────────────────────────────────
export function TimetableForm({ initial, onSubmit, onDelete, onCancel }: { initial?: Partial<TimetableEntry>; onSubmit: (d: Draft<TimetableEntry>) => void; onDelete?: () => void; onCancel: () => void }) {
  const [f, setF] = useState({
    subject: initial?.subject ?? "",
    professor: initial?.professor ?? "",
    weekday: initial?.weekday ?? (1 as Weekday),
    startTime: initial?.startTime ?? "09:00",
    endTime: initial?.endTime ?? "10:30",
    room: initial?.room ?? "",
    location: initial?.location ?? "",
    memo: initial?.memo ?? "",
  });
  const [touched, setTouched] = useState(false);
  const timeErr = timeRangeError(f.startTime, f.endTime);
  const subjectErr = f.subject.trim() ? undefined : "과목명을 입력하세요";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (timeErr || subjectErr) return;
    onSubmit({ ...f, subject: f.subject.trim(), id: initial?.id });
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="과목명" error={touched ? subjectErr : undefined}>
        <input className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="예: 자료구조" />
      </Field>
      <Grid>
        <Field label="교수명">
          <input className={inputCls} value={f.professor} onChange={(e) => setF({ ...f, professor: e.target.value })} />
        </Field>
        <Field label="요일">
          <select className={inputCls} value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) as Weekday })}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABEL[d]}요일
              </option>
            ))}
          </select>
        </Field>
        <Field label="시작" error={touched ? timeErr : undefined}>
          <input type="time" className={inputCls} value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
        </Field>
        <Field label="종료">
          <input type="time" className={inputCls} value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
        </Field>
        <Field label="강의실">
          <input className={inputCls} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} placeholder="예: 301호" />
        </Field>
        <Field label="위치(건물)" hint="이동시간 추정에 사용">
          <input className={inputCls} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="예: 공학관" />
        </Field>
      </Grid>
      <Field label="메모">
        <textarea className={textareaCls} rows={2} value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} />
      </Field>
      <Actions onDelete={onDelete} onCancel={onCancel} submitLabel={initial?.id ? "저장" : "추가"} />
    </form>
  );
}

// ── 과제 ────────────────────────────────────────────────────────────────────────
export function AssignmentForm({
  initial,
  subjects,
  onSubmit,
  onDelete,
  onCancel,
}: {
  initial?: Partial<Assignment>;
  subjects: string[];
  onSubmit: (d: Draft<Assignment>) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    title: initial?.title ?? "",
    subject: initial?.subject ?? "",
    dueDate: initial?.dueDate ?? "",
    dueTime: initial?.dueTime ?? "23:59",
    estimatedMinutes: initial?.estimatedMinutes ?? 60,
    importance: initial?.importance ?? (2 as Importance),
    status: initial?.status ?? ("todo" as AssignmentStatus),
    memo: initial?.memo ?? "",
  });
  const [touched, setTouched] = useState(false);
  const errs = {
    title: f.title.trim() ? undefined : "과제명을 입력하세요",
    dueDate: f.dueDate ? undefined : "마감일을 입력하세요",
    est: f.estimatedMinutes > 0 && f.estimatedMinutes <= 60 * 48 ? undefined : "1분 ~ 48시간 사이로 입력하세요",
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errs).some(Boolean)) return;
    onSubmit({ ...f, title: f.title.trim(), id: initial?.id });
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="과제명" error={touched ? errs.title : undefined}>
        <input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="예: 자료구조 과제 3" />
      </Field>
      <Field label="과목">
        <input className={inputCls} list="subject-list" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <datalist id="subject-list">
          {subjects.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <Grid>
        <Field label="마감일" error={touched ? errs.dueDate : undefined}>
          <input type="date" className={inputCls} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </Field>
        <Field label="마감 시각">
          <input type="time" className={inputCls} value={f.dueTime} onChange={(e) => setF({ ...f, dueTime: e.target.value || "23:59" })} />
        </Field>
        <Field label="예상 소요(분)" hint="남은 작업 기준" error={touched ? errs.est : undefined}>
          <input type="number" min={5} step={5} className={inputCls} value={f.estimatedMinutes} onChange={(e) => setF({ ...f, estimatedMinutes: Number(e.target.value) })} />
        </Field>
        <Field label="중요도">
          <select className={inputCls} value={f.importance} onChange={(e) => setF({ ...f, importance: Number(e.target.value) as Importance })}>
            {([1, 2, 3, 4] as Importance[]).map((i) => (
              <option key={i} value={i}>
                {IMPORTANCE_LABEL[i]}
              </option>
            ))}
          </select>
        </Field>
      </Grid>
      <Field label="진행 상태">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-ink-100 p-1">
          {(Object.keys(STATUS_LABEL) as AssignmentStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setF({ ...f, status: s })}
              className={`h-8 rounded-lg text-xs font-medium ${f.status === s ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"}`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="메모">
        <textarea className={textareaCls} rows={2} value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} />
      </Field>
      <Actions onDelete={onDelete} onCancel={onCancel} submitLabel={initial?.id ? "저장" : "추가"} />
    </form>
  );
}

// ── 개인 일정 ───────────────────────────────────────────────────────────────────
export function EventForm({
  initial,
  onSubmit,
  onDelete,
  onCancel,
  footer,
}: {
  initial?: Partial<CampusEvent>;
  onSubmit: (d: Draft<CampusEvent>) => void;
  onDelete?: () => void;
  onCancel: () => void;
  /** 저장 전에 보여줄 정보 (예: 충돌 미리보기) — 현재 입력값을 받아 렌더링 */
  footer?: (draft: Draft<CampusEvent>) => ReactNode;
}) {
  const [f, setF] = useState({
    title: initial?.title ?? "",
    date: initial?.date ?? "",
    startTime: initial?.startTime ?? "18:00",
    endTime: initial?.endTime ?? "19:00",
    location: initial?.location ?? "",
    category: initial?.category ?? ("etc" as EventCategory),
    memo: initial?.memo ?? "",
    travelMinutes: initial?.travelMinutes ?? null,
  });
  const [touched, setTouched] = useState(false);
  const errs = {
    title: f.title.trim() ? undefined : "일정명을 입력하세요",
    date: f.date ? undefined : "날짜를 입력하세요",
    time: timeRangeError(f.startTime, f.endTime),
  };
  const draft = { ...f, title: f.title.trim(), id: initial?.id };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errs).some(Boolean)) return;
    onSubmit(draft);
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="일정명" error={touched ? errs.title : undefined}>
        <input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="예: CLASS FC 풋살" />
      </Field>
      <Grid>
        <Field label="날짜" error={touched ? errs.date : undefined}>
          <input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="카테고리">
          <select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as EventCategory })}>
            {(Object.keys(EVENT_CATEGORY_LABEL) as EventCategory[]).map((c) => (
              <option key={c} value={c}>
                {EVENT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="시작" error={touched ? errs.time : undefined}>
          <input type="time" className={inputCls} value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} />
        </Field>
        <Field label="종료">
          <input type="time" className={inputCls} value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
        </Field>
        <Field label="장소">
          <input className={inputCls} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="예: 한강 풋살장" />
        </Field>
        <Field label="이동시간(분)" hint="비우면 장소로 추정">
          <input
            type="number"
            min={0}
            step={5}
            className={inputCls}
            value={f.travelMinutes ?? ""}
            onChange={(e) => setF({ ...f, travelMinutes: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
          />
        </Field>
      </Grid>
      <Field label="메모">
        <textarea className={textareaCls} rows={2} value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} />
      </Field>
      {footer?.(draft)}
      <Actions onDelete={onDelete} onCancel={onCancel} submitLabel={initial?.id ? "저장" : "추가"} />
    </form>
  );
}
