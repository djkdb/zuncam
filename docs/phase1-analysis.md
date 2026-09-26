# Phase 1 — 레포지토리 분석 (2026-09-26)

개발 시작 전에 요청대로 기존 레포를 분석했다. 그 결과를 그대로 기록한다.

## 분석 결과

| 항목 | 결과 |
|---|---|
| 커밋 / 브랜치 | 없음. `djkdb/zuncam` 원격에 브랜치가 하나도 없었고 작업 브랜치(`claude/gracious-turing-6973o4`)도 커밋 0개 |
| 파일 | `.git` 외 없음 |
| 기술 스택 | 없음 |

따라서 원래 질문 6가지에 대한 답은 다음과 같다.

1. **현재 구현된 기능** — 없음.
2. **재사용 가능한 코드** — 없음. "기존 기능을 제거하지 말 것", "전면 재작성 금지" 원칙은 지킬 대상이 없어서, 대신 *처음부터 확장 가능한 구조*로 시작하는 데 집중했다.
3. **개선이 필요한 부분** — 해당 없음.
4. **새로 추가해야 할 기능** — 요구사항 전체 (시간표/과제/일정 CRUD, Campus Context, Priority Engine, Today, AI 5종, 검증·폴백, 문서).
5. **권장 개발 순서** — 요청된 Phase 순서를 그대로 따르되, AI(Phase 5)보다 결정론적 엔진(Phase 2~4)을 먼저 완성하고 테스트한다. AI 없이도 앱이 완전히 동작해야 AI 실패 시 폴백이 가능하기 때문이다.
6. **예상 기술 리스크**

| 리스크 | 대응 |
|---|---|
| LLM이 시간을 잘못 계산 | 시간·순위·충돌 계산은 모두 코드. LLM은 id 로 참조하고 설명만 작성. 응답의 시각을 화이트리스트로 검증 |
| JSON 형식 오류 | Structured Output(JSON Schema) + zod 재검증 + 규칙 기반 폴백 |
| 타임존/날짜 경계 버그 | 날짜를 `YYYY-MM-DD` 문자열, 시간을 `HH:mm` 문자열로만 저장 (D-03) |
| API 키 노출 | 서버 라우트에서만 호출, `server-only` 로 클라이언트 번들 차단, `.env` gitignore |
| AI 응답 지연 | effort `low`, 서버·클라이언트 이중 타임아웃, 즉시 보이는 규칙 기반 결과 위에 AI 설명을 덧씌움 |
| 로그인 없는 persistence | localStorage + `StorageAdapter` 추상화 (나중에 서버 DB로 교체) |

## 선택한 스택과 이유

| 선택 | 이유 |
|---|---|
| Next.js (App Router) + TypeScript | 프론트와 AI 서버 라우트를 한 프로젝트로. API 키를 서버에만 둘 수 있음 |
| Tailwind CSS | 카드 기반 UI를 빠르게, 모바일/데스크톱 반응형 |
| zod | 저장 데이터·API 요청·LLM 응답 검증을 한 방식으로 |
| Anthropic SDK (`@anthropic-ai/sdk`) | Structured Output 지원 |
| Vitest | 엔진(순수 함수) 단위 테스트 |
| localStorage | 요구사항상 로그인 불필요, MVP 에서 가장 단순한 persistence |
