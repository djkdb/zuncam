/**
 * Campus OS 도메인 모델.
 *
 * 규칙
 * - 날짜는 로컬 기준 "YYYY-MM-DD", 시간은 "HH:mm" 문자열로 저장한다.
 *   (Date 객체/UTC ISO 문자열을 쓰면 타임존 변환 때문에 마감일이 하루 밀리는 문제가 생긴다 — docs/troubleshooting.md #1)
 * - 모든 엔티티는 id / createdAt / updatedAt 을 가진다.
 * - 새 데이터 종류(시험, 동아리, 출석 …)는 여기 타입을 추가하고 CampusData 에 컬렉션을 추가하는 방식으로 확장한다.
 */

export type ISODate = string; // "2026-09-26"
export type HHmm = string; // "14:00"

/** 0 = 일요일 … 6 = 토요일 (JS Date.getDay 와 동일) */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** A. 시간표 (매주 반복되는 수업) */
export interface TimetableEntry extends BaseEntity {
  subject: string;
  professor: string;
  weekday: Weekday;
  startTime: HHmm;
  endTime: HHmm;
  room: string;
  /** 건물/캠퍼스 등 이동시간 계산에 쓰이는 위치 */
  location: string;
  memo: string;
}

export type AssignmentStatus = "todo" | "in_progress" | "done";
/** 1 낮음 · 2 보통 · 3 높음 · 4 매우 높음 */
export type Importance = 1 | 2 | 3 | 4;

/** B. 과제 */
export interface Assignment extends BaseEntity {
  title: string;
  subject: string;
  dueDate: ISODate;
  dueTime: HHmm;
  /** 남은 작업 기준 예상 소요시간(분) */
  estimatedMinutes: number;
  importance: Importance;
  status: AssignmentStatus;
  memo: string;
}

export type EventCategory = "school" | "appointment" | "club" | "exercise" | "personal" | "etc";

/** C. 개인 일정 */
export interface CampusEvent extends BaseEntity {
  title: string;
  date: ISODate;
  startTime: HHmm;
  endTime: HHmm;
  location: string;
  category: EventCategory;
  memo: string;
  /** 사용자가 직접 입력한 이동시간(분). 없으면 TravelTimeProvider 가 추정한다. */
  travelMinutes: number | null;
}

export interface UserSettings {
  userName: string;
  /** 하루 계획을 세우는 시작/종료 시간 */
  dayStart: HHmm;
  dayEnd: HHmm;
  /** 행동 계획에 식사 시간을 자동으로 확보할지 */
  reserveMeals: boolean;
  /** 이동 출발 전 여유 시간(분) */
  departureBufferMinutes: number;
}

export interface CampusData {
  version: 1;
  settings: UserSettings;
  timetable: TimetableEntry[];
  assignments: Assignment[];
  events: CampusEvent[];
}

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  school: "학교",
  appointment: "약속",
  club: "동아리",
  exercise: "운동",
  personal: "개인",
  etc: "기타",
};

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  todo: "시작 전",
  in_progress: "진행 중",
  done: "완료",
};

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  1: "낮음",
  2: "보통",
  3: "높음",
  4: "매우 높음",
};

export const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const DEFAULT_SETTINGS: UserSettings = {
  userName: "",
  dayStart: "08:00",
  dayEnd: "24:00",
  reserveMeals: true,
  departureBufferMinutes: 5,
};

export function emptyCampusData(): CampusData {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, timetable: [], assignments: [], events: [] };
}
