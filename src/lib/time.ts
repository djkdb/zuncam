import type { HHmm, ISODate, Weekday } from "./domain/types";

/**
 * 결정론적(deterministic) 시간 계산 유틸.
 * Campus OS 에서 모든 시간 계산은 이 파일을 거친다. LLM 은 시간을 계산하지 않는다.
 */

/** 앱이 인식하는 "현재 시각" — 로컬 날짜 + 자정 기준 분 */
export interface Clock {
  date: ISODate;
  minutes: number;
}

export function toMinutes(t: HHmm): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): HHmm {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseISODate(d: ISODate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}

/** UTC 자정 기준 epoch day — 타임존/서머타임 영향 없이 날짜 차이를 계산하기 위해 사용 */
function epochDay(d: ISODate): number {
  const { y, m, day } = parseISODate(d);
  return Math.floor(Date.UTC(y, m - 1, day) / 86_400_000);
}

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, day } = parseISODate(d);
  const dt = new Date(Date.UTC(y, m - 1, day + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function diffDays(from: ISODate, to: ISODate): number {
  return epochDay(to) - epochDay(from);
}

export function weekdayOf(d: ISODate): Weekday {
  const { y, m, day } = parseISODate(d);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay() as Weekday;
}

export function clockFromDate(date: Date): Clock {
  return { date: toISODate(date), minutes: date.getHours() * 60 + date.getMinutes() };
}

/** now 에서 (date, time) 까지 남은 분. 음수면 이미 지남 */
export function minutesUntil(now: Clock, date: ISODate, time: HHmm): number {
  return diffDays(now.date, date) * 1440 + toMinutes(time) - now.minutes;
}

export function formatDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}시간` : `${h}시간 ${r}분`;
}

export type DueTone = "overdue" | "critical" | "soon" | "normal" | "far";

export interface DueLabel {
  text: string;
  tone: DueTone;
  /** D-day (오늘 = 0) */
  dDay: number;
}

/**
 * 마감 표시 문구.
 * - 지남: "마감 지남"
 * - 6시간 이내: "3시간 후 마감" / "40분 후 마감"
 * - 같은 날: "오늘 23:59 마감"
 * - 내일: "D-1 · 내일 23:59"
 * - 그 외: "D-5"
 */
export function formatDue(now: Clock, dueDate: ISODate, dueTime: HHmm): DueLabel {
  const left = minutesUntil(now, dueDate, dueTime);
  const dDay = diffDays(now.date, dueDate);
  if (left < 0) {
    const ago = -left;
    return { text: `마감 지남 · ${ago < 1440 ? formatDuration(ago) : `${Math.floor(ago / 1440)}일`} 전`, tone: "overdue", dDay };
  }
  if (left < 60) return { text: `${left}분 후 마감`, tone: "critical", dDay };
  if (left <= 6 * 60) return { text: `${Math.floor(left / 60)}시간 후 마감`, tone: "critical", dDay };
  if (dDay === 0) return { text: `오늘 ${dueTime} 마감`, tone: "critical", dDay };
  if (dDay === 1) return { text: `D-1 · 내일 ${dueTime}`, tone: "soon", dDay };
  if (dDay <= 3) return { text: `D-${dDay}`, tone: "soon", dDay };
  if (dDay <= 7) return { text: `D-${dDay}`, tone: "normal", dDay };
  return { text: `D-${dDay}`, tone: "far", dDay };
}

export function greeting(minutes: number): string {
  if (minutes < 5 * 60) return "늦은 밤이에요";
  if (minutes < 12 * 60) return "좋은 아침이에요";
  if (minutes < 18 * 60) return "좋은 오후예요";
  return "좋은 저녁이에요";
}

export function formatKoreanDate(d: ISODate): string {
  const { m, day } = parseISODate(d);
  const w = ["일", "월", "화", "수", "목", "금", "토"][weekdayOf(d)];
  return `${m}월 ${day}일 (${w})`;
}

/** 두 구간 [aStart,aEnd) [bStart,bEnd) 겹침 */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
