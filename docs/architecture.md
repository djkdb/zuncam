# 아키텍처

## 전체 흐름

```
┌───────────────────────── 브라우저 ─────────────────────────┐
│                                                            │
│  CampusData (localStorage, StorageAdapter)                 │
│    ├ timetable[]   ├ assignments[]   ├ events[]  ├ settings│
│    ▼                                                       │
│  buildCampusContext(data, now)            src/lib/context  │
│    · 수업/일정 → FixedBlock 로 정규화                        │
│    · 이동시간 추정 → 출발 권장 시각                          │
│    · 7일간 충돌(겹침/이동 부족) 계산                          │
│    · 과제 남은 시간·D-day                                    │
│    ▼                                                       │
│  computePriorities → buildActionPlan → adviseNow           │
│    (Priority Engine)   (Planner)        ("지금 뭐 하지?")    │
│    src/lib/engine — 전부 순수 함수, 단위 테스트              │
│    ▼                                                       │
│  UI 즉시 렌더링 (AI 없이도 완전한 결과)                      │
│    ▼                                                       │
│  toAIContext() — LLM 입력용 요약 + 허용 시각 화이트리스트     │
└────────────┬───────────────────────────────────────────────┘
             │ POST /api/ai/{briefing, now, parse, conflicts}
┌────────────▼──────────── 서버 (Next.js Route) ──────────────┐
│  zod 요청 검증 → Anthropic API (Structured Output)           │
│  → zod 형식 검증 → 의미 검증(validate.ts) → 통과한 필드만 반환 │
│  실패 시 { source: "rules", fallbackMessage }                │
└────────────────────────────────────────────────────────────┘
             │
             ▼  브라우저: AI 문장이 있으면 덮어쓰고, 없으면 규칙 기반 문장 유지
```

## 디렉터리

```
src/
├── app/                      # 페이지 + API 라우트
│   ├── page.tsx              # Today
│   ├── timetable/ assignments/ events/ settings/
│   └── api/ai/               # briefing · now · parse · conflicts · status
├── components/
│   ├── today/                # TodayDashboard, NowCard
│   ├── QuickAdd.tsx          # 자연어 입력
│   ├── forms.tsx             # 시간표/과제/일정 폼
│   └── ui.tsx                # 디자인 시스템 기본 요소
└── lib/
    ├── domain/               # 타입 + zod 스키마 (데이터 모델)
    ├── context/              # Campus Context (통합 컨텍스트, 충돌 계산)
    ├── engine/               # Priority Engine, Planner, Now Advisor, narrative(규칙 문장)
    ├── ai/                   # AI Context, 프롬프트, 스키마, 검증, 서버 클라이언트, 훅
    ├── nlp/                  # 규칙 기반 한국어 파서, 날짜 표현 → 날짜 계산
    ├── integrations/         # 이동시간 Provider(동작), 날씨/캘린더/알림 인터페이스(미구현)
    ├── store.ts              # 저장소 + 시계(데모 시간)
    └── time.ts, korean.ts    # 시간 계산, 한국어 조사
tests/                        # 엔진·파서·검증 단위 테스트 + 시뮬레이션 회귀 (Vitest)
sim/                          # 시뮬레이션: 페르소나, 불변식, 하루/1주일 재생, 자연어 코퍼스 (docs/simulation.md)
scripts/mock-anthropic.mjs    # API 키 없이 AI 경로를 재현하는 목 서버
```

## 데이터 모델

`src/lib/domain/types.ts`

| 엔티티 | 주요 필드 |
|---|---|
| `TimetableEntry` | subject, professor, weekday(0~6), startTime, endTime, room, location, memo |
| `Assignment` | title, subject, dueDate, dueTime, estimatedMinutes(총 예상), importance(1~4), status(todo/in_progress/done), memo, **progress[{date, minutes}]** |
| `CampusEvent` | title, date, startTime, endTime, location, category, memo, travelMinutes(선택) |
| `UserSettings` | userName, dayStart, dayEnd, reserveMeals, departureBufferMinutes |
| `CampusData.activeSession` | 집중 세션 {refId, date, startMinutes} \| null — 멈추면 경과 시간이 progress 에 기록 |

남은 시간 = 총 예상 − 진행 기록 합계 (− 진행 중 세션 경과). 기록이 예상을 넘었는데 완료가 아니면 마무리용 10분으로 보고 "예상 수정" 안내.

- 날짜 `YYYY-MM-DD`, 시간 `HH:mm` 문자열 (D-03)
- localStorage 로드 시 항목 단위로 zod 검증 → 깨진 항목만 제외, JSON 자체가 깨지면 백업 키로 옮기고 새로 시작

### 확장 방법

새 데이터(예: 시험)를 추가할 때:
1. `types.ts`에 타입, `schemas.ts`에 스키마, `CampusData`에 컬렉션 추가
2. `campusContext.ts`에서 `FixedBlock`(시간이 정해진 것) 또는 별도 뷰로 정규화
3. 우선순위에 반영해야 하면 `priority.ts`에 점수 함수 추가
4. AI에 필요한 요약만 `toAIContext()`에 추가

외부 소스(날씨, Google Calendar, 학교 학사일정, 알림)는 `integrations/future.ts`에 인터페이스만 정의되어 있고 UI에는 노출하지 않는다.

## Priority Engine

`src/lib/engine/priority.ts` — 점수와 근거(factors)를 함께 반환한다. UI의 "점수 근거"에서 그대로 볼 수 있다.

**과제 (최대 100)**

| 요인 | 점수 |
|---|---|
| 마감 임박도 | 지남 50 · 6h 이내 45 · 24h 38 · 48h 30 · 72h 22 · 7일 12 · 그 외 4 |
| 마감까지 남은 시간 < 남은 작업 | +10 |
| 중요도 | 낮음 3 · 보통 8 · 높음 14 · 매우 높음 20 |
| 예상 소요 (**총 예상** 기준 — 진행해도 순위가 흔들리지 않게, TS-05/06) | 2h↑ 10 · 1h↑ 6 · 30m↑ 3 · 그 외 1 (72h 밖 마감이면 절반) |
| 진행 중 | +4 |
| 완료 | 후보에서 제외 |

**고정 일정 (수업/약속)**

| 요인 | 점수 |
|---|---|
| 시간 고정 | 15 |
| 시작 임박 | 진행 중 35 · 1h 30 · 3h 20 · 그 외 8 |
| 이동 필요(15분 이상) | +10 |
| 수업(출석) | +5 |
| 이미 끝남 | 제외 |

설계 의도: 오늘 밤 마감 + 매우 중요 + 90분짜리 과제(≈68점)가 3시간 뒤 풋살(≈45점)보다 위, 1시간 이내 시작하는 수업(50점대)은 내일 마감 과제와 비슷한 수준.

## Planner (행동 계획)

`src/lib/engine/planner.ts`

1. 계획 구간: `max(설정 시작, 현재 시각을 10분 단위로 올림)` ~ 설정 종료
2. 고정 일정 + 이동 블록(출발 권장 ~ 시작) 배치
3. 식사: 12:00/18:00 1시간이 비면 확보, 아니면 30분 단위로 앞뒤 탐색. 이미 시작된 식사는 제자리 유지 (TS-09)
4. 빈 시간에 과제 배치: 최소 25분, 최대 90분, 세션 사이 10분 휴식, 오늘 마감은 마감 시각 전까지만
   - **배치 순서**: 36시간 내 마감 → 마감 순(EDF), 다음 마감 지난 과제, 나머지는 우선순위 점수 순 (D-16, TS-05)
5. 마감이 이틀 이상 남은 과제는 **오늘 몫** = (남은 + 오늘 한 것) / 남은 일수 − 오늘 한 것 (TS-01, TS-06)
6. 하루 과제 합계 최대 6시간 — **오늘 이미 기록한 작업 포함**. 오늘·내일 아침 마감은 예외 + 경고 (D-19, TS-07)
7. 경고: 출발 시각, 오늘 마감인데 시간 부족, 마감 지남, 오늘 충돌

## "지금 뭐 하지?"

`src/lib/engine/nowAdvisor.ts` — 현재 시각을 기준으로:

| 상황 | mode |
|---|---|
| 수업/일정 진행 중 | `in_block` |
| 계획상 이동 시각 | `depart` |
| 계획상 식사 | `meal` |
| 계획상 과제 | `focus` — 대상, 종료 시각, 확보 가능한 시간, 다음 출발/일정 |
| 집중 세션 진행 중 | `focus` — 세션 대상 유지, 경과 시간, 다음 멈춤 전 기록 안내 (출발·수업이 우선) |
| 다음 일정까지 25분 미만 | `short_gap` — 다음 과제와 시작 시각 안내 |
| 배치된 작업 없음 | `free` — 다음 과제/식사 안내 |
| 하루 계획 종료 | `day_over` |

AI는 이 결정을 바꾸지 못한다 (검증: 대상 제목을 언급하지 않거나 허용되지 않은 시각을 쓰면 폐기).
