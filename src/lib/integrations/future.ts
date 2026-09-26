/**
 * 아직 구현하지 않은 연동의 인터페이스 정의.
 * 이 파일의 타입은 UI 어디에서도 사용되지 않는다 (가짜 기능 표시 금지 원칙).
 */
import type { CampusEvent, ISODate } from "../domain/types";

export interface WeatherSnapshot {
  date: ISODate;
  summary: string;
  precipitationChance: number;
  temperatureC: number;
}
export interface WeatherProvider {
  forecast(date: ISODate, location: string): Promise<WeatherSnapshot | null>;
}

/** Google Calendar, 학교 학사일정 등 외부 캘린더에서 일정을 가져오는 소스 */
export interface CalendarSource {
  id: string;
  label: string;
  fetchEvents(from: ISODate, to: ISODate): Promise<Omit<CampusEvent, "id" | "createdAt" | "updatedAt">[]>;
}

export interface Notifier {
  schedule(at: Date, title: string, body: string): Promise<void>;
}
