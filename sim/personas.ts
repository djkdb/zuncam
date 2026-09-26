import type { Assignment, CampusData, CampusEvent, EventCategory, Importance, TimetableEntry, Weekday } from "../src/lib/domain/types";
import { DEFAULT_SETTINGS } from "../src/lib/domain/types";
import { addDays, fromMinutes, weekdayOf } from "../src/lib/time";

/**
 * 시뮬레이션용 페르소나(가상의 대학생) 데이터 생성기.
 * 같은 seed → 같은 데이터 (재현 가능).
 */

export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

const SUBJECTS = ["자료구조", "운영체제", "컴퓨터 네트워크", "선형대수", "확률과 통계", "데이터베이스", "알고리즘", "글쓰기", "경제학원론", "심리학개론"];
const BUILDINGS = ["공학관", "IT관", "인문관", "경영관", "과학관", "학생회관"];
const OFF_CAMPUS = ["한강 풋살장", "강남역 카페", "알바 매장", "헬스장", "본가", "동아리방 근처 식당"];
const EVENT_TITLES: [string, EventCategory][] = [
  ["CLASS FC 풋살", "exercise"],
  ["헬스", "exercise"],
  ["동아리 정기회의", "club"],
  ["친구 약속", "appointment"],
  ["팀플 회의", "school"],
  ["알바", "personal"],
  ["스터디", "school"],
];

let idSeq = 0;
const meta = () => {
  const id = `sim-${++idSeq}`;
  return { id, createdAt: "", updatedAt: "" };
};

function klass(r: Rng, weekday: Weekday, start: number, len: number, subject?: string): TimetableEntry {
  return {
    ...meta(),
    subject: subject ?? r.pick(SUBJECTS),
    professor: "",
    weekday,
    startTime: fromMinutes(start),
    endTime: fromMinutes(start + len),
    room: `${r.int(1, 5)}0${r.int(1, 9)}호`,
    location: r.pick(BUILDINGS),
    memo: "",
  };
}

function assignment(r: Rng, today: string, dayOffset: number, opts: Partial<Assignment> = {}): Assignment {
  return {
    ...meta(),
    title: `${r.pick(SUBJECTS)} 과제 ${r.int(1, 9)}`,
    subject: "",
    dueDate: addDays(today, dayOffset),
    dueTime: r.pick(["23:59", "23:59", "18:00", "12:00", "09:00"]),
    estimatedMinutes: r.pick([30, 60, 60, 90, 120, 180]),
    importance: r.int(1, 4) as Importance,
    status: r.chance(0.2) ? "in_progress" : "todo",
    memo: "",
    progress: [],
    ...opts,
  };
}

function event(r: Rng, date: string, start: number, len: number, offCampus: boolean, opts: Partial<CampusEvent> = {}): CampusEvent {
  const [title, category] = r.pick(EVENT_TITLES);
  return {
    ...meta(),
    title,
    date,
    startTime: fromMinutes(start),
    endTime: fromMinutes(Math.min(24 * 60, start + len)),
    location: offCampus ? r.pick(OFF_CAMPUS) : r.pick(BUILDINGS),
    category,
    memo: "",
    travelMinutes: offCampus && r.chance(0.5) ? r.pick([20, 30, 40, 60]) : null,
    ...opts,
  };
}

export interface Persona {
  id: string;
  label: string;
  description: string;
  build: (today: string, r: Rng) => CampusData;
}

const base = (): CampusData => ({ version: 1, settings: { ...DEFAULT_SETTINGS, userName: "sim" }, timetable: [], assignments: [], events: [], activeSession: null });

export const PERSONAS: Persona[] = [
  {
    id: "typical",
    label: "평범한 3학년",
    description: "오늘 수업 2~3개, 과제 3개(하나는 오늘 마감), 저녁 일정 1개",
    build(today, r) {
      const d = base();
      const wd = weekdayOf(today);
      d.timetable.push(klass(r, wd, 9 * 60, 90), klass(r, wd, 13 * 60, 90));
      if (r.chance(0.5)) d.timetable.push(klass(r, wd, 15 * 60 + 30, 75));
      d.assignments.push(assignment(r, today, 0, { dueTime: "23:59" }), assignment(r, today, 1), assignment(r, today, r.int(3, 7)));
      d.events.push(event(r, today, r.pick([18, 19]) * 60, 120, true));
      return d;
    },
  },
  {
    id: "overloaded",
    label: "과제 폭탄",
    description: "과제 7개, 오늘·내일 마감 3~4개, 필요한 시간이 가용 시간보다 많을 수 있음",
    build(today, r) {
      const d = base();
      const wd = weekdayOf(today);
      d.timetable.push(klass(r, wd, 10 * 60, 120), klass(r, wd, 14 * 60, 120));
      d.assignments.push(
        assignment(r, today, 0, { estimatedMinutes: 120, importance: 4 }),
        assignment(r, today, 0, { estimatedMinutes: 90, dueTime: "23:59" }),
        assignment(r, today, 1, { estimatedMinutes: 180 }),
        assignment(r, today, 1, { estimatedMinutes: 60 }),
        assignment(r, today, 2),
        assignment(r, today, 4),
        assignment(r, today, 6),
      );
      return d;
    },
  },
  {
    id: "commuter",
    label: "장거리 통학러",
    description: "외부 일정이 많고 이동시간이 김(40~60분)",
    build(today, r) {
      const d = base();
      const wd = weekdayOf(today);
      d.timetable.push(klass(r, wd, 11 * 60, 90));
      d.assignments.push(assignment(r, today, 0), assignment(r, today, 2));
      d.events.push(
        event(r, today, 14 * 60, 120, true, { title: "알바", category: "personal", travelMinutes: 50 }),
        event(r, today, 19 * 60, 90, true, { title: "친구 약속", category: "appointment", travelMinutes: 40 }),
      );
      return d;
    },
  },
  {
    id: "free-day",
    label: "공강 날",
    description: "오늘 수업 없음, 마감이 먼 과제 2개",
    build(today, r) {
      const d = base();
      d.timetable.push(klass(r, ((weekdayOf(today) + 1) % 7) as Weekday, 9 * 60, 120));
      d.assignments.push(assignment(r, today, 5, { estimatedMinutes: 240 }), assignment(r, today, 3, { estimatedMinutes: 90 }));
      return d;
    },
  },
  {
    id: "overdue",
    label: "마감 놓침",
    description: "이미 마감이 지난 과제 2개 + 오늘 마감 1개",
    build(today, r) {
      const d = base();
      const wd = weekdayOf(today);
      d.timetable.push(klass(r, wd, 13 * 60, 90));
      d.assignments.push(assignment(r, today, -1, { estimatedMinutes: 60 }), assignment(r, today, -3, { estimatedMinutes: 120, importance: 1 }), assignment(r, today, 0, { dueTime: "23:59" }));
      return d;
    },
  },
  {
    id: "packed",
    label: "연강 + 건물 이동",
    description: "9~18시 연강, 매 수업 다른 건물, 저녁 동아리",
    build(today, r) {
      const d = base();
      const wd = weekdayOf(today);
      for (let s = 9 * 60; s < 18 * 60; s += 90) d.timetable.push(klass(r, wd, s, 90));
      d.assignments.push(assignment(r, today, 0, { dueTime: "23:59", estimatedMinutes: 90 }), assignment(r, today, 1));
      d.events.push(event(r, today, 19 * 60, 120, false, { title: "동아리 정기회의", category: "club" }));
      return d;
    },
  },
  {
    id: "morning-due",
    label: "아침 마감",
    description: "내일 09:00 마감 과제 + 오늘 오후 마감 과제",
    build(today, r) {
      const d = base();
      const wd = weekdayOf(today);
      d.timetable.push(klass(r, wd, 10 * 60, 120));
      d.assignments.push(
        assignment(r, today, 0, { dueTime: "15:00", estimatedMinutes: 60, importance: 3 }),
        assignment(r, today, 1, { dueTime: "09:00", estimatedMinutes: 150, importance: 4 }),
      );
      d.events.push(event(r, today, 18 * 60, 120, true));
      return d;
    },
  },
];

/** 무작위 페르소나 — 경계 조건을 넓게 탐색하기 위함 */
export function randomData(today: string, r: Rng): CampusData {
  const d = base();
  const wd = weekdayOf(today);
  const nClasses = r.int(0, 4);
  let cursor = r.pick([9, 10, 11]) * 60;
  for (let i = 0; i < nClasses && cursor < 20 * 60; i++) {
    const len = r.pick([60, 75, 90, 120, 150]);
    d.timetable.push(klass(r, wd, cursor, len));
    cursor += len + r.pick([0, 0, 10, 15, 30, 60, 120]);
  }
  for (let i = 0; i < r.int(0, 8); i++) d.assignments.push(assignment(r, today, r.int(-2, 10)));
  for (let i = 0; i < r.int(0, 3); i++) {
    const s = r.int(8, 22) * 60 + r.pick([0, 30]);
    d.events.push(event(r, addDays(today, r.chance(0.6) ? 0 : r.int(1, 6)), s, r.pick([60, 90, 120, 180]), r.chance(0.5)));
  }
  if (r.chance(0.2)) d.settings.reserveMeals = false;
  if (r.chance(0.2)) d.settings.dayStart = "10:00";
  if (r.chance(0.2)) d.settings.dayEnd = "23:00";
  return d;
}

/**
 * 1주일 시나리오 — 요일별 시간표 + 일주일에 걸친 과제·일정.
 * 페이싱(오늘 몫) 전략이 며칠 뒤 마감에 미치는 영향을 보기 위함.
 */
export function randomWeek(monday: string, r: Rng, load: "light" | "normal" | "heavy" = "normal"): CampusData {
  const d = base();
  for (let wd = 1 as Weekday; wd <= 5; wd = (wd + 1) as Weekday) {
    let cursor = r.pick([9, 10, 12]) * 60;
    for (let i = 0; i < r.int(1, 3); i++) {
      const len = r.pick([75, 90, 120]);
      d.timetable.push(klass(r, wd, cursor, len));
      cursor += len + r.pick([15, 30, 60, 90]);
    }
  }
  const n = { light: 4, normal: 7, heavy: 11 }[load];
  for (let i = 0; i < n; i++) {
    d.assignments.push(assignment(r, monday, r.int(0, 8), { estimatedMinutes: r.pick([60, 90, 120, 180, 240]), status: "todo" }));
  }
  for (let i = 0; i < r.int(2, 6); i++) {
    d.events.push(event(r, addDays(monday, r.int(0, 6)), r.pick([12, 18, 19, 20]) * 60, r.pick([60, 120]), r.chance(0.6)));
  }
  return d;
}
