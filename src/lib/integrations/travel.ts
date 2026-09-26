/**
 * 이동시간 추상화 계층.
 *
 * 현재 MVP 는 지도 API 없이 규칙 기반 추정(RuleBasedTravelProvider)을 사용한다.
 * 추정값은 UI 에 항상 "추정"으로 표시되며, 사용자가 일정에 직접 입력한 이동시간이 있으면 그것을 우선한다.
 * 지도/경로 API 를 붙일 때는 TravelTimeProvider 를 구현한 클래스를 만들어 교체하면 된다.
 */

export interface TravelEstimate {
  minutes: number;
  source: "user" | "same-place" | "estimate" | "none";
  note: string;
}

export interface TravelTimeProvider {
  estimate(from: string | null, to: string, userMinutes?: number | null): TravelEstimate;
}

const CAMPUS_HINTS = ["관", "캠퍼스", "학교", "강의실", "도서관", "학생회관", "공학", "hall", "campus", "library"];

export function isCampusPlace(place: string): boolean {
  const p = place.toLowerCase();
  return CAMPUS_HINTS.some((h) => p.includes(h));
}

export function normalizePlace(place: string): string {
  return place.replace(/\s+/g, "").toLowerCase();
}

export interface RuleBasedTravelOptions {
  /** 캠퍼스 내 건물 간 이동 */
  onCampusMinutes: number;
  /** 캠퍼스 밖/알 수 없는 장소 */
  offCampusMinutes: number;
}

export class RuleBasedTravelProvider implements TravelTimeProvider {
  constructor(private readonly opts: RuleBasedTravelOptions = { onCampusMinutes: 10, offCampusMinutes: 30 }) {}

  estimate(from: string | null, to: string, userMinutes?: number | null): TravelEstimate {
    if (userMinutes != null) return { minutes: userMinutes, source: "user", note: `직접 입력한 이동시간 ${userMinutes}분` };
    if (!to.trim()) return { minutes: 0, source: "none", note: "장소 정보 없음" };
    if (from && normalizePlace(from) === normalizePlace(to)) {
      return { minutes: 0, source: "same-place", note: "이전 일정과 같은 장소" };
    }
    if (from && isCampusPlace(from) && isCampusPlace(to)) {
      return { minutes: this.opts.onCampusMinutes, source: "estimate", note: `캠퍼스 내 이동 추정 ${this.opts.onCampusMinutes}분` };
    }
    if (!from && isCampusPlace(to)) {
      return { minutes: this.opts.onCampusMinutes, source: "estimate", note: `캠퍼스 이동 추정 ${this.opts.onCampusMinutes}분` };
    }
    return { minutes: this.opts.offCampusMinutes, source: "estimate", note: `외부 장소 이동 추정 ${this.opts.offCampusMinutes}분` };
  }
}

export const defaultTravelProvider: TravelTimeProvider = new RuleBasedTravelProvider();
