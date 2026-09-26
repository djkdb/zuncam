import type { CampusData, Weekday } from "./domain/types";
import { DEFAULT_SETTINGS } from "./domain/types";
import { addDays, weekdayOf } from "./time";

/**
 * 발표 데모용 샘플 데이터. 사용자가 "데모 데이터 불러오기"를 눌렀을 때만 사용된다.
 * 날짜는 항상 '오늘' 기준으로 만들어 언제 시연해도 같은 흐름이 재현된다.
 */
export function createDemoData(today: string, userName = "성준"): CampusData {
  const wd = weekdayOf(today);
  const stamp = new Date().toISOString();
  const meta = (id: string) => ({ id, createdAt: stamp, updatedAt: stamp });
  const other = ((wd + 2) % 7) as Weekday;

  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, userName },
    timetable: [
      { ...meta("demo-c1"), subject: "운영체제", professor: "김민수", weekday: wd, startTime: "10:00", endTime: "12:00", room: "301호", location: "공학관", memo: "" },
      { ...meta("demo-c2"), subject: "컴퓨터 네트워크", professor: "이지은", weekday: wd, startTime: "14:00", endTime: "16:00", room: "512호", location: "IT관", memo: "퀴즈 있음" },
      { ...meta("demo-c3"), subject: "자료구조", professor: "박준호", weekday: other, startTime: "13:00", endTime: "15:00", room: "204호", location: "공학관", memo: "" },
    ],
    assignments: [
      { ...meta("demo-a1"), title: "자료구조 과제 3 (힙 구현)", subject: "자료구조", dueDate: today, dueTime: "23:59", estimatedMinutes: 90, importance: 4, status: "in_progress", memo: "우선순위 큐 테스트 포함" },
      { ...meta("demo-a2"), title: "네트워크 소켓 실습 보고서", subject: "컴퓨터 네트워크", dueDate: addDays(today, 1), dueTime: "23:59", estimatedMinutes: 60, importance: 3, status: "todo", memo: "" },
      { ...meta("demo-a3"), title: "운영체제 스케줄링 과제", subject: "운영체제", dueDate: addDays(today, 5), dueTime: "18:00", estimatedMinutes: 180, importance: 3, status: "todo", memo: "" },
      { ...meta("demo-a4"), title: "교양 독후감", subject: "글쓰기", dueDate: addDays(today, 2), dueTime: "12:00", estimatedMinutes: 60, importance: 2, status: "done", memo: "" },
    ],
    events: [
      { ...meta("demo-e1"), title: "CLASS FC 풋살", date: today, startTime: "18:00", endTime: "20:00", location: "한강 풋살장", category: "exercise", memo: "", travelMinutes: 35 },
      { ...meta("demo-e2"), title: "동아리 정기회의", date: addDays(today, 2), startTime: "19:00", endTime: "20:30", location: "학생회관 204호", category: "club", memo: "", travelMinutes: null },
    ],
  };
}
