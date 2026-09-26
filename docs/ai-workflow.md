# AI Workflow

## 원칙

```
Raw Data → Campus Context → Priority Engine / Planner (코드) → LLM (자연어 설명 + 해석) → 검증 → UI
```

1. **계산은 코드, 해석은 AI.** 우선순위 점수, 계획 시각, 출발 시각, 충돌 여부, 날짜 계산은 LLM이 하지 않는다.
2. **AI 입력은 UI 데이터와 분리한다.** `toAIContext()`가 계산 결과만 요약해 보낸다 (메모 등 불필요한 개인정보 제외, 시각은 모두 `HH:mm` 문자열).
3. **출력은 JSON만.** Structured Output(JSON Schema)으로 형식을 강제하고, 서버에서 zod로 한 번 더 검증한다.
4. **형식이 맞아도 내용을 검증한다.** 허용되지 않은 시각, 없는 id, 결정과 다른 추천은 필드 단위로 버린다.
5. **실패해도 앱은 동작한다.** 버려진 필드 자리에는 코드가 만든 규칙 기반 문장이 남는다. 화면에는 항상 `AI` / `규칙 기반` 배지를 표시한다.

## 호출 구성

| 항목 | 값 | 이유 |
|---|---|---|
| 모델 | `claude-opus-5` (환경변수 `ANTHROPIC_MODEL`로 변경 가능) | |
| effort | `low` | 설명·구조화 작업이라 깊은 추론보다 응답 속도가 UX에 중요 |
| 출력 | `output_config.format` = zod 스키마에서 만든 JSON Schema | JSON 형식 오류 방지 |
| 거절 폴백 | `fallbacks: "default"` (Opus 5 / Fable 계열일 때만) | 모델이 요청을 거절하면 서버측에서 다른 모델로 재시도 |
| 타임아웃 | 서버 12초 × 최대 2회, 브라우저 30초 | 서버 최악 시간이 브라우저 타임아웃보다 짧아야 함 (TS-03) |
| 키 | 서버 환경변수 `ANTHROPIC_API_KEY`만. `server-only`로 클라이언트 번들 차단 | 하드코딩 금지 |

코드: `src/lib/ai/client.ts`

## AI 기능별 흐름

### ① 오늘의 우선순위 근거 + ② 행동 계획 설명 — `POST /api/ai/briefing`

- 입력: `AIContext` 전체 (priorities[id, rank, score, factors, facts], plan[id, start, end, reason], assignments, conflicts, travel, warnings, allowedTimes)
- 출력 스키마: `{ summary, recommendation, priorityReasons[{id, reason}], planNotes[{blockId, note}], warnings[] }`
- 검증 (`validateBriefing`)
  - `priorityReasons.id`가 입력 priorities에 없으면 버림
  - `planNotes.blockId`가 입력 plan에 없으면 버림
  - 모든 문장에서 시각을 추출(`16:20`, `오후 4시 20분`, `6시 반` …)해 `allowedTimes`에 없으면 그 필드를 버림
- 호출 시점: Today 진입 시 자동. 원천 데이터가 바뀌거나 60분이 지나면 다시 호출 (D-07)

### ③ 지금 뭐 하지? — `POST /api/ai/now`

- 입력: `now`(코드가 이미 내린 결정: mode, targetTitle, start, end, focusMinutes, nextStop, reasons) + 상위 우선순위 + 이후 계획
- 출력: `{ message, tips[] }`
- 검증 (`validateNow`): 허용 시각 검사 + **message가 결정된 대상의 핵심 단어를 포함하는지** 검사 → 다른 일을 추천하면 폐기
- UI: 버튼을 누르면 코드 결정(헤드라인·근거)이 즉시 보이고, AI 설명이 도착하면 근거 목록 자리를 대체

### ④ 자연어 입력 — `POST /api/ai/parse`

- 입력: `{ text, today, todayWeekday, subjects }`
- 출력: 날짜를 **계산하지 않고 표현만** 구조화한다.
  `dateType: weekday|relative|absolute|none` + `weekday/weekOffset/relativeDays/month/day`
- 날짜 계산은 코드(`resolveDate`)가 한다. "다음주 수요일" = 다음 달력 주(월요일 시작)의 수요일 (D-04)
- 누락값 기본값·안내 문구: `toDraft()` (마감 시각 없음 → 23:59, 소요 없음 → 60분, 오전/오후 모호 → 알림)
- 실패 시: 서버가 규칙 기반 파서(`parseKorean`)로 같은 형식을 만들어 반환. 서버에 닿지도 못하면 브라우저에서 규칙 파서 실행
- 저장 전 사용자가 폼에서 확인·수정. 충돌·중복은 코드가 미리 계산해 표시

### ⑤ 일정 충돌 분석 — `POST /api/ai/conflicts`

- 충돌 판정: 코드(`detectConflicts`) — 시간 겹침(overlap), 이전 일정 종료 후 이동시간 부족(travel)
- AI 출력: `{ advice[{conflictId, explanation, suggestion}] }`
- 검증: 없는 conflictId 폐기, **설명(explanation)** 에 허용되지 않은 시각이 있으면 폐기. 제안(suggestion)은 새 시각(예: "16:30으로 변경")이 필요할 수 있어 허용하되 issues에 기록

## 폴백 경로

| 실패 | 서버 응답 | 사용자에게 보이는 것 |
|---|---|---|
| 키 없음 | `source: rules`, `no_key` | 규칙 기반 배지 + "AI 키가 설정되지 않아…" |
| 타임아웃 / 429 / API 오류 / 거절 / 잘림 | `source: rules` + 사유 | 규칙 기반 결과 + 사유 문구 |
| JSON 파싱 실패 / 스키마 불일치 | `source: rules` | 규칙 기반 결과 |
| 일부 필드 의미 검증 실패 | `source: ai`, `issues[]` | AI 배지 + "검증 N건 보정", 해당 필드만 규칙 문장 |
| 네트워크 오류 / 브라우저 타임아웃 | (클라이언트에서 생성) | 규칙 기반 결과 |

모든 AI 호출은 서버 콘솔에 한 줄 JSON 로그를 남긴다:
`{"tag":"campus-os.ai","route":"briefing","ok":true,"latencyMs":..,"issues":[..]}` — 트러블슈팅 기록의 근거로 사용.

## 검증 방법 (API 키 없이)

`scripts/mock-anthropic.mjs`는 Anthropic Messages API 형식으로 응답하는 목 서버다.

```bash
MODE=ok node scripts/mock-anthropic.mjs        # 정상 + 의도적 환각(16:20, 17:50, 없는 id)
MODE=badjson node scripts/mock-anthropic.mjs   # 잘린 JSON
MODE=slow node scripts/mock-anthropic.mjs      # 40초 지연
ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://localhost:4010 npm run dev
```

2026-09-26 확인 결과 (목 서버 기준, 실제 모델 응답 아님):

| 모드 | 결과 |
|---|---|
| ok | 환각 시각이 든 recommendation과 없는 id의 reason이 버려지고 `issues`에 2건 기록, 화면에 "AI · 검증 2건 보정" |
| badjson | `invalid_json` → 규칙 기반. parse 는 규칙 파서 결과("자료구조 과제", 2026-09-30, 120분)로 정상 등록 |
| slow | 수정 전 50초 → 수정 후 약 25초에 `timeout`으로 폴백 (TS-03) |
| 잘못된 요청 본문 | 400 + zod issues |

> 실제 모델(Claude)로의 응답 품질·환각 빈도·지연은 API 키를 연결한 뒤 측정해 `prompt-history.md`에 기록해야 한다.
