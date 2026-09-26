# Future Plan

현재 MVP에서 의도적으로 구현하지 않은 것과, 붙일 때의 연결 지점.

## 데이터 소스

| 기능 | 연결 지점 | 메모 |
|---|---|---|
| 지도/이동시간 API | `TravelTimeProvider` 구현 교체 (`src/lib/integrations/travel.ts`) | 현재는 규칙 기반 추정. 결과의 `source`를 `"estimate"`에서 API 값으로 |
| 날씨 | `WeatherProvider` (`future.ts`) → `CampusContext.weather` 추가 → `toAIContext`에 요약 | 비 오면 이동 버퍼 증가 같은 규칙은 코드로 |
| Google Calendar / 학교 학사일정 | `CalendarSource` (`future.ts`) → `CampusEvent`로 변환해 병합 | 가져온 일정은 읽기 전용 표시 필요 |
| 시험 일정 | 새 엔티티 `Exam` → FixedBlock + 준비 과제 자동 생성 | Priority Engine에 "시험까지 D-n" 요인 추가 |
| 동아리/출석 | `CampusEvent.category` 확장 또는 별도 엔티티 | |
| 알림/푸시 | `Notifier` (`future.ts`) — 출발 시각, 마감 N시간 전 | 서비스 워커 필요 |
| 음성 입력 | QuickAdd 텍스트 입력 앞단에 Web Speech API | 파싱 경로는 동일 |

## 제품

- 서버 저장소(계정 선택형)로 기기 간 동기화 — `StorageAdapter` 교체
- 과제 진행률(남은 시간) 기록 → 예상 소요시간 자동 보정
- 계획 블록을 드래그로 조정하고 그 결과를 다음 계획에 반영
- 주간 뷰(이번 주 과제 분배)

## AI

- 실제 모델로 프롬프트 측정 후 개선 (`prompt-history.md` "다음에 측정할 것")
- 검증 실패 시 1회 재요청(검증 오류를 피드백으로 전달) — 지연과 품질 트레이드오프 측정 후 결정
- 자연어로 수정("풋살 7시로 미뤄줘") — 기존 항목 매칭은 코드, 의도 해석은 AI
