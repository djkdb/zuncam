import { q } from "../korean";
import type { Assignment, CampusData, CampusEvent, EventCategory, ISODate, TimetableEntry, UserSettings } from "../domain/types";
import { defaultTravelProvider, type TravelEstimate, type TravelTimeProvider } from "../integrations/travel";
import { addDays, formatDue, minutesUntil, overlaps, toMinutes, weekdayOf, type Clock, type DueLabel } from "../time";

/**
 * Campus Context — 시간표·과제·일정·이동시간·현재 시각을 하나로 합친 "현재 상황" 모델.
 *
 * 흐름: CampusData(원천 데이터) → buildCampusContext() → CampusContext(UI/엔진용)
 *                                                    → toAIContext() (LLM 입력용 요약, src/lib/ai)
 */

export type FixedKind = "class" | "event";

/** 날짜·시간이 고정된 일정 (수업 또는 개인 일정)을 같은 형태로 정규화한 블록 */
export interface FixedBlock {
  id: string;
  kind: FixedKind;
  refId: string;
  title: string;
  date: ISODate;
  start: number; // 자정 기준 분
  end: number;
  location: string;
  category: EventCategory | "class";
  detail: string;
  travel: TravelEstimate;
  /** 이동이 필요하면 출발 권장 시각(분), 아니면 null */
  departAt: number | null;
}

export interface AssignmentView extends Assignment {
  minutesLeft: number;
  due: DueLabel;
  overdue: boolean;
}

export type ConflictType = "overlap" | "travel";

export interface Conflict {
  id: string;
  type: ConflictType;
  date: ISODate;
  a: FixedBlock;
  b: FixedBlock;
  /** overlap: 겹치는 분 / travel: 부족한 이동시간(분) */
  minutes: number;
  /** 코드가 만든 기본 설명 (AI 가 없어도 표시 가능) */
  message: string;
}

export interface CampusContext {
  now: Clock;
  settings: UserSettings;
  todayBlocks: FixedBlock[];
  /** 오늘 포함 7일간의 고정 일정 */
  weekBlocks: FixedBlock[];
  /** 현재 진행 중인 고정 일정 */
  currentBlock: FixedBlock | null;
  /** 오늘 아직 시작하지 않은 다음 고정 일정 */
  nextBlock: FixedBlock | null;
  /** 미완료 과제 (마감순) */
  openAssignments: AssignmentView[];
  doneCount: number;
  conflicts: Conflict[];
  counts: { timetable: number; assignments: number; events: number };
}

const HORIZON_DAYS = 7;

function classToBlock(c: TimetableEntry, date: ISODate): Omit<FixedBlock, "travel" | "departAt"> {
  return {
    id: `class:${c.id}:${date}`,
    kind: "class",
    refId: c.id,
    title: c.subject,
    date,
    start: toMinutes(c.startTime),
    end: toMinutes(c.endTime),
    location: [c.location, c.room].filter(Boolean).join(" "),
    category: "class",
    detail: [c.professor && `${c.professor} 교수`, c.room].filter(Boolean).join(" · "),
  };
}

function eventToBlock(e: CampusEvent): Omit<FixedBlock, "travel" | "departAt"> {
  return {
    id: `event:${e.id}`,
    kind: "event",
    refId: e.id,
    title: e.title,
    date: e.date,
    start: toMinutes(e.startTime),
    end: toMinutes(e.endTime),
    location: e.location,
    category: e.category,
    detail: e.memo,
  };
}

/** 특정 날짜의 고정 일정 + 이동시간 계산 */
export function blocksForDate(
  data: CampusData,
  date: ISODate,
  travel: TravelTimeProvider = defaultTravelProvider,
): FixedBlock[] {
  const wd = weekdayOf(date);
  const raw = [
    ...data.timetable.filter((c) => c.weekday === wd).map((c) => ({ b: classToBlock(c, date), userTravel: null as number | null })),
    ...data.events.filter((e) => e.date === date).map((e) => ({ b: eventToBlock(e), userTravel: e.travelMinutes })),
  ].sort((x, y) => x.b.start - y.b.start || x.b.end - y.b.end);

  const buffer = data.settings.departureBufferMinutes;
  const out: FixedBlock[] = [];
  for (const { b, userTravel } of raw) {
    // 직전(겹치지 않고 먼저 끝나는) 일정의 장소에서 출발한다고 가정
    const prev = out.filter((p) => p.end <= b.start).sort((x, y) => y.end - x.end)[0];
    const est = travel.estimate(prev ? prev.location : null, b.location, userTravel);
    const departAt = est.minutes > 0 ? b.start - est.minutes - buffer : null;
    out.push({ ...b, travel: est, departAt });
  }
  return out;
}

export function detectConflicts(blocks: FixedBlock[]): Conflict[] {
  const byDate = new Map<ISODate, FixedBlock[]>();
  for (const b of blocks) byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]);

  const conflicts: Conflict[] = [];
  for (const [date, list] of byDate) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        if (overlaps(a.start, a.end, b.start, b.end)) {
          const minutes = Math.min(a.end, b.end) - b.start;
          conflicts.push({
            id: `overlap:${a.id}|${b.id}`,
            type: "overlap",
            date,
            a,
            b,
            minutes,
            message: `${q(a.title, "과/와")} ${q(b.title, "이/가")} ${minutes}분 겹칩니다.`,
          });
        }
      }
    }
    // 이동시간 부족: 연속된(겹치지 않는) 두 일정 사이 간격 < 이동시간
    for (let j = 1; j < sorted.length; j++) {
      const b = sorted[j];
      const prev = sorted.slice(0, j).filter((p) => p.end <= b.start).sort((x, y) => y.end - x.end)[0];
      if (!prev || b.travel.minutes <= 0) continue;
      const gap = b.start - prev.end;
      if (gap < b.travel.minutes) {
        const short = b.travel.minutes - gap;
        conflicts.push({
          id: `travel:${prev.id}|${b.id}`,
          type: "travel",
          date,
          a: prev,
          b,
          minutes: short,
          message: `'${prev.title}' 종료 후 '${b.title}'까지 ${gap}분 남지만 이동에 약 ${b.travel.minutes}분이 필요합니다 (${short}분 부족).`,
        });
      }
    }
  }
  return conflicts;
}

export function toAssignmentView(a: Assignment, now: Clock): AssignmentView {
  const minutesLeft = minutesUntil(now, a.dueDate, a.dueTime);
  return { ...a, minutesLeft, due: formatDue(now, a.dueDate, a.dueTime), overdue: minutesLeft < 0 };
}

export function buildCampusContext(
  data: CampusData,
  now: Clock,
  travel: TravelTimeProvider = defaultTravelProvider,
): CampusContext {
  const weekBlocks: FixedBlock[] = [];
  for (let i = 0; i < HORIZON_DAYS; i++) weekBlocks.push(...blocksForDate(data, addDays(now.date, i), travel));
  const todayBlocks = weekBlocks.filter((b) => b.date === now.date);

  const currentBlock = todayBlocks.find((b) => b.start <= now.minutes && now.minutes < b.end) ?? null;
  const nextBlock = todayBlocks.find((b) => b.start > now.minutes) ?? null;

  const openAssignments = data.assignments
    .filter((a) => a.status !== "done")
    .map((a) => toAssignmentView(a, now))
    .sort((a, b) => a.minutesLeft - b.minutesLeft);

  // 이미 지나간 날짜/시간의 충돌은 의미가 없으므로 오늘 이후 끝나지 않은 것만
  const conflicts = detectConflicts(weekBlocks).filter(
    (c) => c.date !== now.date || Math.max(c.a.end, c.b.end) > now.minutes,
  );

  return {
    now,
    settings: data.settings,
    todayBlocks,
    weekBlocks,
    currentBlock,
    nextBlock,
    openAssignments,
    doneCount: data.assignments.length - openAssignments.length,
    conflicts,
    counts: { timetable: data.timetable.length, assignments: data.assignments.length, events: data.events.length },
  };
}

export type EventDraftLike = Omit<CampusEvent, "id" | "createdAt" | "updatedAt"> & { id?: string };

/** 저장 전 미리보기: 이 일정을 추가/수정하면 생기는 충돌 */
export function previewEventConflicts(data: CampusData, draft: EventDraftLike, travel: TravelTimeProvider = defaultTravelProvider): Conflict[] {
  if (!draft.date || !draft.startTime || !draft.endTime || toMinutes(draft.endTime) <= toMinutes(draft.startTime)) return [];
  const id = draft.id ?? "__draft__";
  const temp: CampusEvent = { ...draft, id, createdAt: "", updatedAt: "" };
  const next: CampusData = { ...data, events: [...data.events.filter((e) => e.id !== id), temp] };
  return detectConflicts(blocksForDate(next, draft.date, travel)).filter((c) => c.a.refId === id || c.b.refId === id);
}

/** 같은 날짜·시작 시각·제목의 일정이 이미 있는지 (자연어로 같은 문장을 두 번 입력하는 경우) */
export function findDuplicateEvent(data: CampusData, draft: EventDraftLike): CampusEvent | null {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return data.events.find((e) => e.id !== draft.id && e.date === draft.date && e.startTime === draft.startTime && norm(e.title) === norm(draft.title)) ?? null;
}
