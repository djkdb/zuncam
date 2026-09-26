"use client";

import { AlertTriangle } from "lucide-react";
import { findDuplicateEvent, previewEventConflicts, type EventDraftLike } from "@/lib/context/campusContext";
import { useCampusStore } from "@/lib/store";
import { formatKoreanDate } from "@/lib/time";

/** 일정 저장 전: 중복·충돌 미리보기 (계산은 campusContext, 코드) */
export function EventDraftWarnings({ draft }: { draft: EventDraftLike }) {
  const { data } = useCampusStore();
  const conflicts = previewEventConflicts(data, draft);
  const dup = findDuplicateEvent(data, draft);
  if (!conflicts.length && !dup) return null;
  return (
    <div className="space-y-1.5 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
      {dup && (
        <p className="flex gap-1.5">
          <AlertTriangle className="size-4 shrink-0" /> {formatKoreanDate(dup.date)} {dup.startTime}에 같은 일정 &apos;{dup.title}&apos;이 이미 있어요. 중복 등록인지 확인하세요.
        </p>
      )}
      {conflicts.map((c) => (
        <p key={c.id} className="flex gap-1.5">
          <AlertTriangle className="size-4 shrink-0" /> {c.message}
        </p>
      ))}
      <p className="text-orange-700/80">그래도 저장할 수 있으며, Today 화면에서 충돌 분석을 볼 수 있어요.</p>
    </div>
  );
}
