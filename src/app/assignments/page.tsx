"use client";

import { ListChecks, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AssignmentForm } from "@/components/forms";
import { Badge, Button, Card, cx, EmptyState, Modal, ProgressBar, Skeleton } from "@/components/ui";
import { toAssignmentView } from "@/lib/context/campusContext";
import { IMPORTANCE_LABEL, STATUS_LABEL, type Assignment, type AssignmentStatus } from "@/lib/domain/types";
import { scoreAssignment } from "@/lib/engine/priority";
import { actions, useCampusStore, useClock } from "@/lib/store";
import { formatDuration, type DueTone } from "@/lib/time";

type Tab = "open" | "done" | "all";
type Sort = "due" | "priority";
const DUE_TONE: Record<DueTone, "red" | "orange" | "amber" | "neutral"> = { overdue: "red", critical: "red", soon: "orange", normal: "amber", far: "neutral" };
const STATUS_TONE: Record<AssignmentStatus, "neutral" | "indigo" | "emerald"> = { todo: "neutral", in_progress: "indigo", done: "emerald" };
const NEXT_STATUS: Record<AssignmentStatus, AssignmentStatus> = { todo: "in_progress", in_progress: "done", done: "todo" };

export default function AssignmentsPage() {
  const { data, hydrated } = useCampusStore();
  const { clock } = useClock();
  const [tab, setTab] = useState<Tab>("open");
  const [sort, setSort] = useState<Sort>("due");
  const [editing, setEditing] = useState<Partial<Assignment> | null>(null);
  const subjects = [...new Set([...data.timetable.map((t) => t.subject), ...data.assignments.map((a) => a.subject)].filter(Boolean))];

  const rows = useMemo(() => {
    const list = data.assignments
      .filter((a) => (tab === "all" ? true : tab === "done" ? a.status === "done" : a.status !== "done"))
      .map((a) => {
        const view = toAssignmentView(a, clock);
        return { view, score: a.status === "done" ? null : scoreAssignment(view).score };
      });
    return list.sort((x, y) => (sort === "priority" ? (y.score ?? -1) - (x.score ?? -1) : x.view.minutesLeft - y.view.minutesLeft));
  }, [data.assignments, clock, tab, sort]);

  const counts = { open: data.assignments.filter((a) => a.status !== "done").length, done: data.assignments.filter((a) => a.status === "done").length, all: data.assignments.length };
  const close = () => setEditing(null);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">Assignments</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">과제</h1>
          <p className="mt-1 text-sm text-ink-500">마감이 가까울수록, 중요할수록, 오래 걸릴수록 우선순위가 올라갑니다.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing({})}>
          <Plus className="size-4" /> 과제 추가
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl bg-ink-100 p-1">
          {(["open", "done", "all"] as Tab[]).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cx("h-8 rounded-lg px-3 text-xs font-medium", tab === t ? "bg-white shadow-sm" : "text-ink-500")}>
              {{ open: "해야 할 과제", done: "완료", all: "전체" }[t]} <span className="tabular text-ink-400">{counts[t]}</span>
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 rounded-lg border border-ink-200 bg-white px-2 text-xs" aria-label="정렬">
          <option value="due">마감 임박순</option>
          <option value="priority">우선순위 점수순</option>
        </select>
      </div>

      <Card className="p-2 sm:p-3">
        {!hydrated ? (
          <Skeleton className="m-2 h-40" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="size-8" />}
            title={tab === "done" ? "완료한 과제가 없어요" : "등록된 과제가 없어요"}
            description={tab === "done" ? undefined : "과제를 추가하면 남은 시간과 우선순위를 자동으로 계산합니다."}
            action={tab !== "done" ? <Button onClick={() => setEditing({})}>과제 추가</Button> : undefined}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map(({ view: a, score }) => (
              <li key={a.id} className="flex items-center gap-3 px-2 py-3">
                <button
                  type="button"
                  onClick={() => actions.setAssignmentStatus(a.id, NEXT_STATUS[a.status])}
                  title="눌러서 상태 변경 (시작 전 → 진행 중 → 완료)"
                  className="shrink-0"
                >
                  <Badge tone={STATUS_TONE[a.status]} className="w-14 justify-center">
                    {STATUS_LABEL[a.status]}
                  </Badge>
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cx("truncate font-medium", a.status === "done" && "text-ink-400 line-through")}>{a.title}</p>
                  <p className="tabular text-xs text-ink-500">
                    {[
                      a.subject,
                      `${a.dueDate} ${a.dueTime}`,
                      a.loggedMinutes > 0 ? `${formatDuration(a.loggedMinutes)} / 예상 ${formatDuration(a.estimatedMinutes)}` : `예상 ${formatDuration(a.estimatedMinutes)}`,
                      `중요도 ${IMPORTANCE_LABEL[a.importance]}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {a.loggedMinutes > 0 && <ProgressBar done={a.loggedMinutes} total={a.estimatedMinutes} />}
                  {a.overEstimate && a.status !== "done" && <p className="mt-0.5 text-[11px] text-orange-600">예상 시간을 넘겼어요 — 예상 소요시간을 늘리면 계획이 정확해집니다.</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {a.status !== "done" && (
                    <Badge tone={DUE_TONE[a.due.tone]} className="tabular">
                      {a.due.text}
                    </Badge>
                  )}
                  {score !== null && <span className="tabular text-[11px] text-ink-400">점수 {score}</span>}
                </div>
                {a.status !== "done" && (
                  <select
                    value=""
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      if (m) actions.logProgress(a.id, m, clock.date);
                    }}
                    className="h-8 shrink-0 rounded-lg border border-ink-200 bg-white px-1.5 text-[11px] text-ink-600"
                    aria-label={`${a.title} 진행 기록`}
                    title="오늘 한 만큼 기록하면 남은 시간과 계획이 다시 계산됩니다"
                  >
                    <option value="">+ 기록</option>
                    {[15, 30, 60, 90, 120].map((m) => (
                      <option key={m} value={m}>
                        {formatDuration(m)}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" onClick={() => setEditing(a)} className="shrink-0 rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={`${a.title} 수정`}>
                  <Pencil className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={editing !== null} onClose={close} title={editing?.id ? "과제 수정" : "과제 추가"}>
        {editing && (
          <AssignmentForm
            initial={editing}
            subjects={subjects}
            onCancel={close}
            onSubmit={(d) => {
              actions.saveAssignment(d);
              close();
            }}
            onDelete={
              editing.id
                ? () => {
                    if (confirm(`'${editing.title}' 과제를 삭제할까요?`)) {
                      actions.deleteAssignment(editing.id!);
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
