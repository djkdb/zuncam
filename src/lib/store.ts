"use client";

import { useSyncExternalStore } from "react";
import { createDemoData } from "./demo";
import { parseCampusData } from "./domain/schemas";
import { emptyCampusData, type Assignment, type AssignmentStatus, type CampusData, type CampusEvent, type TimetableEntry, type UserSettings } from "./domain/types";
import { clockFromDate, toMinutes, type Clock } from "./time";

/**
 * 클라이언트 데이터 저장소.
 * - 로그인 없이 브라우저 localStorage 에 저장한다 (MVP).
 * - StorageAdapter 를 교체하면 서버 DB(Supabase 등)로 옮길 수 있다.
 * - 저장된 데이터는 항목 단위로 zod 검증 후 로드한다. 손상된 JSON 은 백업 키로 옮기고 빈 상태로 시작한다.
 */

export interface StorageAdapter {
  load(): string | null;
  save(raw: string): void;
  backup(raw: string): void;
}

const KEY = "campus-os:data:v1";
const localAdapter: StorageAdapter = {
  load: () => window.localStorage.getItem(KEY),
  save: (raw) => window.localStorage.setItem(KEY, raw),
  backup: (raw) => window.localStorage.setItem(`${KEY}:corrupt:${Date.now()}`, raw),
};

interface State {
  hydrated: boolean;
  data: CampusData;
  notice: string | null;
}

let state: State = { hydrated: false, data: emptyCampusData(), notice: null };
const listeners = new Set<() => void>();
let adapter: StorageAdapter = localAdapter;

function emit() {
  for (const l of listeners) l();
}

function hydrate() {
  if (state.hydrated || typeof window === "undefined") return;
  let notice: string | null = null;
  let data = emptyCampusData();
  try {
    const raw = adapter.load();
    if (raw) {
      try {
        const parsed = parseCampusData(JSON.parse(raw));
        data = parsed.data;
        if (parsed.dropped > 0) notice = `저장된 항목 ${parsed.dropped}개가 손상되어 제외했습니다.`;
      } catch {
        adapter.backup(raw);
        notice = "저장 데이터를 읽을 수 없어 새로 시작합니다. (이전 데이터는 백업되었습니다)";
      }
    }
  } catch {
    notice = "브라우저 저장소에 접근할 수 없어 이번 세션에서만 데이터가 유지됩니다.";
  }
  state = { hydrated: true, data, notice };
}

function commit(next: CampusData) {
  state = { ...state, data: next };
  try {
    adapter.save(JSON.stringify(next));
  } catch {
    state = { ...state, notice: "저장 공간에 기록하지 못했습니다. 브라우저 저장소 설정을 확인하세요." };
  }
  emit();
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const stamp = () => new Date().toISOString();

type Draft<T> = Omit<T, "id" | "createdAt" | "updatedAt"> & { id?: string };

function upsert<T extends { id: string; createdAt: string; updatedAt: string }>(list: T[], draft: Draft<T>): T[] {
  if (draft.id) {
    return list.map((x) => (x.id === draft.id ? ({ ...x, ...draft, id: x.id, updatedAt: stamp() } as T) : x));
  }
  return [...list, { ...draft, id: newId(), createdAt: stamp(), updatedAt: stamp() } as T];
}

export const actions = {
  setAdapter(a: StorageAdapter) {
    adapter = a;
  },
  updateSettings(patch: Partial<UserSettings>) {
    commit({ ...state.data, settings: { ...state.data.settings, ...patch } });
  },
  saveTimetable(d: Draft<TimetableEntry>) {
    commit({ ...state.data, timetable: upsert(state.data.timetable, d) });
  },
  deleteTimetable(id: string) {
    commit({ ...state.data, timetable: state.data.timetable.filter((x) => x.id !== id) });
  },
  saveAssignment(d: Draft<Assignment>) {
    commit({ ...state.data, assignments: upsert(state.data.assignments, d) });
  },
  setAssignmentStatus(id: string, status: AssignmentStatus) {
    commit({ ...state.data, assignments: state.data.assignments.map((a) => (a.id === id ? { ...a, status, updatedAt: stamp() } : a)) });
  },
  deleteAssignment(id: string) {
    commit({ ...state.data, assignments: state.data.assignments.filter((x) => x.id !== id) });
  },
  saveEvent(d: Draft<CampusEvent>) {
    commit({ ...state.data, events: upsert(state.data.events, d) });
  },
  deleteEvent(id: string) {
    commit({ ...state.data, events: state.data.events.filter((x) => x.id !== id) });
  },
  loadDemo(today: string) {
    commit(createDemoData(today, state.data.settings.userName || "성준"));
  },
  importData(raw: unknown): number {
    const parsed = parseCampusData(raw);
    commit(parsed.data);
    return parsed.dropped;
  },
  resetAll() {
    commit({ ...emptyCampusData(), settings: state.data.settings });
  },
  dismissNotice() {
    state = { ...state, notice: null };
    emit();
  },
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const serverState: State = { hydrated: false, data: emptyCampusData(), notice: null };

export function useCampusStore(): State {
  return useSyncExternalStore(
    subscribe,
    () => {
      hydrate();
      return state;
    },
    () => serverState,
  );
}

// ── 시계 ──────────────────────────────────────────────────────────────────────
/**
 * 데모용 시간 고정: 발표 중 "16:10" 같은 특정 시각을 재현하기 위해 사용한다.
 * sessionStorage 에만 저장되어 탭을 닫으면 실제 시간으로 돌아온다.
 */
const CLOCK_KEY = "campus-os:clock-override";
let clockOverride: { date: string; time: string } | null = null;
let clockLoaded = false;
let currentClock: Clock = { date: "1970-01-01", minutes: 0 };
const clockListeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function readClock(): Clock {
  if (!clockLoaded && typeof window !== "undefined") {
    clockLoaded = true;
    try {
      const raw = window.sessionStorage.getItem(CLOCK_KEY);
      clockOverride = raw ? JSON.parse(raw) : null;
    } catch {
      clockOverride = null;
    }
  }
  const next = clockOverride ? { date: clockOverride.date, minutes: toMinutes(clockOverride.time) } : clockFromDate(new Date());
  if (next.date !== currentClock.date || next.minutes !== currentClock.minutes) currentClock = next;
  return currentClock;
}

export const clockActions = {
  setOverride(o: { date: string; time: string } | null) {
    clockOverride = o;
    try {
      if (o) window.sessionStorage.setItem(CLOCK_KEY, JSON.stringify(o));
      else window.sessionStorage.removeItem(CLOCK_KEY);
    } catch {
      /* sessionStorage 불가 시 메모리에서만 유지 */
    }
    for (const l of clockListeners) l();
  },
  getOverride: () => clockOverride,
};

function subscribeClock(l: () => void) {
  clockListeners.add(l);
  timer ??= setInterval(() => {
    for (const x of clockListeners) x();
  }, 20_000);
  return () => {
    clockListeners.delete(l);
    if (clockListeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const serverClock: Clock = { date: "1970-01-01", minutes: 0 };
export function useClock(): { clock: Clock; overridden: boolean } {
  const clock = useSyncExternalStore(subscribeClock, readClock, () => serverClock);
  return { clock, overridden: clockOverride !== null };
}
