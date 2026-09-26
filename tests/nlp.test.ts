import { describe, expect, it } from "vitest";
import { parseKorean } from "@/lib/nlp/ruleParser";
import { resolveDate, toDraft } from "@/lib/nlp/resolve";

const SAT = "2026-09-26"; // 토요일

function draft(text: string, today = SAT, subjects: string[] = []) {
  return toDraft(parseKorean(text, subjects), today);
}

describe("resolveDate", () => {
  const spec = { dateType: "weekday" as const, relativeDays: null, month: null, day: null };
  it("이번 주 요일 = 오늘 포함 가장 가까운 날", () => {
    expect(resolveDate({ ...spec, weekday: 5, weekOffset: 0 }, SAT)).toBe("2026-10-02");
    expect(resolveDate({ ...spec, weekday: 6, weekOffset: 0 }, SAT)).toBe(SAT);
  });
  it("다음 주 요일 = 다음 달력 주(월요일 시작)", () => {
    expect(resolveDate({ ...spec, weekday: 3, weekOffset: 1 }, SAT)).toBe("2026-09-30");
    expect(resolveDate({ ...spec, weekday: 3, weekOffset: 1 }, "2026-09-21")).toBe("2026-09-30"); // 월요일 기준
    expect(resolveDate({ ...spec, weekday: 0, weekOffset: 1 }, "2026-09-21")).toBe("2026-10-04");
  });
  it("절대 날짜 / 잘못된 날짜", () => {
    expect(resolveDate({ ...spec, dateType: "absolute", weekday: null, weekOffset: null, month: 10, day: 3 }, SAT)).toBe("2026-10-03");
    expect(resolveDate({ ...spec, dateType: "absolute", weekday: null, weekOffset: null, month: 1, day: 5 }, SAT)).toBe("2027-01-05");
    expect(resolveDate({ ...spec, dateType: "absolute", weekday: null, weekOffset: null, month: 2, day: 30 }, SAT)).toBeNull();
  });
});

describe("규칙 기반 파서", () => {
  it("금요일 6시에 친구들이랑 풋살 있어", () => {
    const d = draft("금요일 6시에 친구들이랑 풋살 있어");
    expect(d.kind).toBe("event");
    if (d.kind !== "event") return;
    expect(d.event).toMatchObject({ title: "풋살", date: "2026-10-02", startTime: "18:00", category: "exercise" });
    expect(d.notes.some((n) => n.includes("오전/오후"))).toBe(true);
  });
  it("자료구조 과제 다음주 수요일까지고 2시간 정도 걸릴 것 같아", () => {
    const d = draft("자료구조 과제 다음주 수요일까지고 2시간 정도 걸릴 것 같아", SAT, ["자료구조"]);
    expect(d.kind).toBe("assignment");
    if (d.kind !== "assignment") return;
    expect(d.assignment).toMatchObject({ title: "자료구조 과제", subject: "자료구조", dueDate: "2026-09-30", dueTime: "23:59", estimatedMinutes: 120 });
  });
  it("내일 오후 3시부터 5시까지 도서관에서 스터디", () => {
    const d = draft("내일 오후 3시부터 5시까지 도서관에서 스터디");
    expect(d.kind).toBe("event");
    if (d.kind !== "event") return;
    expect(d.event).toMatchObject({ title: "스터디", date: "2026-09-27", startTime: "15:00", endTime: "17:00", location: "도서관" });
  });
  it("10월 3일 18:30 동아리 정기회의", () => {
    const d = draft("10월 3일 18:30 동아리 정기회의");
    expect(d.kind === "event" && d.event).toMatchObject({ date: "2026-10-03", startTime: "18:30", category: "club" });
  });
  it("네트워크 보고서 금요일 오후 6시 마감 한 시간 반", () => {
    const d = draft("네트워크 보고서 금요일 오후 6시 마감 1시간 30분 걸림");
    expect(d.kind === "assignment" && d.assignment).toMatchObject({ dueDate: "2026-10-02", dueTime: "18:00", estimatedMinutes: 90 });
  });
  it("알 수 없는 입력", () => {
    expect(draft("안녕").kind).toBe("unknown");
  });
});
