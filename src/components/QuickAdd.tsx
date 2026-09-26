"use client";

import { CheckCircle2, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { aiApi } from "@/lib/ai/clientApi";
import type { AIMeta } from "@/lib/ai/meta";
import { toDraft, type ParsedDraft } from "@/lib/nlp/resolve";
import { parseKorean } from "@/lib/nlp/ruleParser";
import { actions, useCampusStore, useClock } from "@/lib/store";
import { EventDraftWarnings } from "./EventDraftWarnings";
import { AssignmentForm, EventForm } from "./forms";
import { SourceBadge } from "./SourceBadge";
import { Button, Modal, Spinner, textareaCls } from "./ui";

const EXAMPLES = ["금요일 6시에 친구들이랑 풋살 있어", "자료구조 과제 다음주 수요일까지고 2시간 정도 걸릴 것 같아", "내일 오후 3시부터 5시까지 도서관에서 스터디"];

type Phase = { step: "input" } | { step: "loading" } | { step: "review"; draft: ParsedDraft; meta: AIMeta } | { step: "saved"; title: string; kind: "event" | "assignment" };

export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useCampusStore();
  const { clock } = useClock();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ step: "input" });
  const [formKey, setFormKey] = useState(0);
  const subjects = [...new Set(data.timetable.map((t) => t.subject))];

  const close = () => {
    setPhase({ step: "input" });
    setText("");
    onClose();
  };

  const interpret = async (input = text) => {
    const t = input.trim();
    if (!t) return;
    setText(t);
    setPhase({ step: "loading" });
    const res = await aiApi.parse(t, clock.date, subjects);
    // 서버에 닿지 못한 경우에도 입력을 잃지 않도록 브라우저에서 규칙 파서 실행
    const draft = res.draft ?? toDraft(parseKorean(t, subjects), clock.date);
    setFormKey((k) => k + 1);
    setPhase({ step: "review", draft, meta: res.meta });
  };

  const switchKind = () => {
    if (phase.step !== "review") return;
    const d = phase.draft;
    let next: ParsedDraft = d;
    if (d.kind === "event") {
      next = { kind: "assignment", notes: [], assignment: { title: d.event.title, subject: "", dueDate: d.event.date, dueTime: d.event.startTime, estimatedMinutes: 60, importance: 2, status: "todo", memo: d.event.memo } };
    } else if (d.kind === "assignment") {
      next = { kind: "event", notes: [], event: { title: d.assignment.title, date: d.assignment.dueDate, startTime: "18:00", endTime: "19:00", location: "", category: "etc", memo: "", travelMinutes: null } };
    }
    setFormKey((k) => k + 1);
    setPhase({ ...phase, draft: next });
  };

  return (
    <Modal open={open} onClose={close} title="자연어로 추가" wide>
      {(phase.step === "input" || phase.step === "loading") && (
        <div className="space-y-3">
          <p className="text-sm text-ink-500">말하듯이 적으면 일정 또는 과제로 정리해 드려요. 저장 전에 확인하고 고칠 수 있어요.</p>
          <textarea
            className={textareaCls}
            rows={3}
            value={text}
            disabled={phase.step === "loading"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                interpret();
              }
            }}
            placeholder="예: 금요일 6시에 친구들이랑 풋살 있어"
            maxLength={300}
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" disabled={phase.step === "loading"} onClick={() => interpret(ex)} className="rounded-full border border-ink-200 px-2.5 py-1 text-xs text-ink-600 hover:bg-ink-50">
                {ex}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="ai" onClick={() => interpret()} disabled={!text.trim() || phase.step === "loading"}>
              {phase.step === "loading" ? <Spinner /> : <Wand2 className="size-4" />}
              {phase.step === "loading" ? "해석 중…" : "해석하기"}
            </Button>
          </div>
        </div>
      )}

      {phase.step === "review" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-ink-50 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-ink-500">“{text}”</span>
              <SourceBadge meta={phase.meta} />
            </div>
            {phase.draft.notes.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
                {phase.draft.notes.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            )}
          </div>

          {phase.draft.kind === "unknown" ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-600">{phase.draft.notes[0]}</p>
              <Button onClick={() => setPhase({ step: "input" })}>다시 입력</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="size-4 text-indigo-500" />
                  {phase.draft.kind === "event" ? "일정으로 인식했어요" : "과제로 인식했어요"}
                </span>
                <Button size="sm" variant="ghost" onClick={switchKind}>
                  {phase.draft.kind === "event" ? "과제로 바꾸기" : "일정으로 바꾸기"}
                </Button>
              </div>
              {phase.draft.kind === "event" ? (
                <EventForm
                  key={formKey}
                  initial={phase.draft.event}
                  onCancel={() => setPhase({ step: "input" })}
                  onSubmit={(d) => {
                    actions.saveEvent(d);
                    setPhase({ step: "saved", title: d.title, kind: "event" });
                  }}
                  footer={(d) => <EventDraftWarnings draft={d} />}
                />
              ) : (
                <AssignmentForm
                  key={formKey}
                  initial={phase.draft.assignment}
                  subjects={subjects}
                  onCancel={() => setPhase({ step: "input" })}
                  onSubmit={(d) => {
                    actions.saveAssignment(d);
                    setPhase({ step: "saved", title: d.title, kind: "assignment" });
                  }}
                />
              )}
            </>
          )}
        </div>
      )}

      {phase.step === "saved" && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="size-10 text-emerald-500" />
          <p className="text-sm">
            <b>{phase.title}</b> {phase.kind === "event" ? "일정을" : "과제를"} 등록했어요. Today 화면의 우선순위와 계획에 바로 반영됩니다.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setText("");
                setPhase({ step: "input" });
              }}
            >
              하나 더 추가
            </Button>
            <Button variant="primary" onClick={close}>
              닫기
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
