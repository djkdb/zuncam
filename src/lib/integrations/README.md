# integrations/

외부 데이터 소스와의 연결 지점. **현재 MVP에서 실제로 동작하는 것은 `travel.ts`(규칙 기반 이동시간 추정)뿐이다.**
나머지는 UI에 노출하지 않고, 연결 시점에 구현할 인터페이스만 `future.ts`에 정의해 두었다.

| 영역 | 상태 | 파일 |
|---|---|---|
| 이동시간 | 규칙 기반 추정 (사용자 입력 우선) | `travel.ts` |
| 날씨 | 인터페이스만 | `future.ts` → `WeatherProvider` |
| 외부 캘린더 (Google/학교) | 인터페이스만 | `future.ts` → `CalendarSource` |
| 알림/푸시 | 인터페이스만 | `future.ts` → `Notifier` |

새 소스를 연결할 때는 결과를 `CampusContext`(src/lib/context)의 새 필드로 합치고,
`toAIContext()`에 필요한 요약만 추가한다. UI 데이터와 AI 입력은 분리 유지한다.
