# Campus OS

> **Campus OS는 대학생의 시간표·과제·일정을 하나의 컨텍스트로 통합하고, AI가 현재 상황을 분석해 '지금 무엇을 해야 하는지'까지 제안하는 대학생활 운영체제입니다.**

일정관리 앱은 "무엇이 있는지"를 보여줍니다. Campus OS는 **"그래서 지금 나는 무엇을 해야 하지?"** 에 답합니다.

```
TODAY · 9월 26일 (토) 16:10
좋은 오후예요, 성준님.

[가장 중요한 일]  자료구조 과제 3 · 마감까지 7시간 49분
[다음 일정]      CLASS FC 풋살 18:00 ~ 20:00
[마감 임박]      오늘 23:59 마감
[이동]           17:20 출발 · 35분

지금 뭐 하지? → 지금은 '자료구조 과제 3'을 시작하는 것을 추천합니다.
                16:10 → 17:20 · 1시간 10분 (17:20 풋살 이동 출발)
```

## 핵심 아이디어: 계산은 코드, 설명은 AI

```
Raw Data ─▶ Campus Context ─▶ Priority Engine · Planner · 충돌 계산 (결정론적, 테스트됨)
                                              │
                                              ▼
                                LLM: 자연어 설명 · 요약 · 자연어 입력 해석
                                              │
                                              ▼
                            검증 (허용 시각 · id · 결정 일치) → 실패 시 규칙 기반
```

AI에게 모든 판단을 맡기지 않습니다. 우선순위 점수, 계획 시각, 출발 시각, 충돌, 날짜 계산은 코드가 하고, AI는 그 결과를 사람의 말로 설명합니다. 그래서 **AI 키가 없거나 AI가 틀려도 같은 결론**이 화면에 남습니다.

## 기능

| 영역 | 내용 |
|---|---|
| Today | 5초 요약(가장 중요한 일 · 다음 일정 · 마감 임박 · 이동), 오늘의 우선순위(점수 근거), AI Recommendation, 행동 계획 타임라인, Next, 마감 임박 과제, 일정 충돌 |
| 지금 뭐 하지? | 현재 시각 기준 할 일 · 시작~종료 · 확보 가능 시간 · 다음 출발 |
| 시간표 | 주간 그리드(모바일은 요일 탭), 수업 CRUD, 겹침 표시 |
| 과제 | CRUD, 상태(시작 전/진행 중/완료), D-day·"3시간 후 마감" 자동 계산, 마감순/우선순위순 |
| 일정 | CRUD, 카테고리, 이동시간(직접 입력 또는 추정), 출발 권장 시각, 충돌 경고 |
| 자연어 입력 | "금요일 6시에 친구들이랑 풋살 있어" → 일정 / "자료구조 과제 다음주 수요일까지 2시간" → 과제. 저장 전 미리보기·수정·충돌/중복 확인 |
| 충돌 분석 | 시간 겹침 · 이동시간 부족을 코드로 판정, AI가 설명과 해결책 제안 |
| 품질 | 모바일/데스크톱, 로딩·빈 상태·오류 상태, AI 응답 검증과 폴백, localStorage persistence, 내보내기/가져오기 |

모든 AI 결과에는 `AI` / `규칙 기반` 배지가 붙어 어느 경로로 만들어졌는지 보입니다.

## 시작하기

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 입력 (선택)
npm run dev                  # http://localhost:3000
```

- 키가 없으면 **규칙 기반 모드**로 모든 기능이 동작합니다 (설명 문장만 단순).
- 첫 화면에서 **데모 시나리오 (16:10 고정)** 를 누르면 오늘 날짜 기준 샘플 데이터와 데모 시각이 설정됩니다.

| 환경변수 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | 서버에서만 사용. 코드에 하드코딩하지 않습니다 |
| `ANTHROPIC_MODEL` | 기본 `claude-opus-5` |

### 스크립트

```bash
npm test            # 엔진 · 파서 · 검증 단위 테스트 (Vitest)
npm run typecheck
npm run build
npm run mock:ai     # API 키 없이 AI 경로를 시험하는 목 서버 (MODE=ok|badjson|slow)
```

목 서버 사용: `MODE=ok npm run mock:ai` 후 `ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:4010 npm run dev`.
`ok` 모드는 검증을 확인하려고 일부러 틀린 시각과 없는 id를 섞어 반환합니다.

## 구조

```
src/lib/domain       데이터 모델 (시간표, 과제, 일정, 설정) + zod 스키마
src/lib/context      Campus Context — 모든 데이터를 하나로 통합, 이동·충돌 계산
src/lib/engine       Priority Engine, Planner, "지금 뭐 하지?", 규칙 기반 문장
src/lib/ai           AI Context, 프롬프트, 출력 스키마, 의미 검증, 서버 클라이언트
src/lib/nlp          규칙 기반 한국어 파서, 날짜 표현 → 날짜
src/lib/integrations 이동시간 Provider, (미구현) 날씨·캘린더·알림 인터페이스
src/app/api/ai       briefing · now · parse · conflicts · status
```

## 문서

| 문서 | 내용 |
|---|---|
| [docs/problem-definition.md](docs/problem-definition.md) | 문제 정의, 기존 앱과의 차이 |
| [docs/architecture.md](docs/architecture.md) | 데이터 흐름, 모델, Priority Engine 점수표, Planner 규칙 |
| [docs/ai-workflow.md](docs/ai-workflow.md) | AI 기능별 입력·출력·검증·폴백, 목 서버 검증 결과 |
| [docs/prompt-history.md](docs/prompt-history.md) | 프롬프트 버전과 변경 이력 |
| [docs/troubleshooting.md](docs/troubleshooting.md) | 실제 발생한 문제와 해결 |
| [docs/decisions.md](docs/decisions.md) | 설계 결정과 이유 |
| [docs/future-plan.md](docs/future-plan.md) | 향후 확장 |
| [docs/demo-script.md](docs/demo-script.md) | 2~3분 데모, 중간/최종 발표 구성 |
| [docs/phase1-analysis.md](docs/phase1-analysis.md) | 착수 시 레포 분석 |

## 현재 한계 (솔직하게)

- 이동시간은 지도 API 없이 **규칙 기반 추정**입니다 (캠퍼스 내 10분, 외부 30분, 직접 입력 우선). 화면에 "추정"으로 표시됩니다.
- 데이터는 이 브라우저의 localStorage에만 저장됩니다. 기기 간 동기화는 없습니다.
- 프롬프트는 v1이며, 실제 모델 응답 품질·지연은 아직 측정 전입니다 (`prompt-history.md`).
- 날씨·외부 캘린더·알림은 인터페이스만 있고 UI에는 없습니다.
