# Cloudflare 배포

Campus OS는 AI API 라우트(서버 코드)가 있으므로 정적 호스팅(Pages 정적 사이트)만으로는 동작하지 않는다.
**OpenNext 어댑터(`@opennextjs/cloudflare`)로 Cloudflare Workers에 배포**한다. 설정은 레포에 이미 들어 있다.

| 파일 | 역할 |
|---|---|
| `wrangler.jsonc` | Worker 이름(`campus-os`), `nodejs_compat` 플래그, 정적 파일 바인딩 |
| `open-next.config.ts` | OpenNext 설정 (기본값 — 이 앱은 ISR/캐시 미사용) |
| `.dev.vars.example` | 로컬 미리보기용 비밀값 예시 (`.dev.vars`로 복사, 커밋 금지) |
| `package.json` | `cf:build` · `cf:preview` · `cf:deploy` 스크립트 |

## 방법 A — 내 컴퓨터에서 CLI로 배포 (가장 빠름)

```bash
npm install
npx wrangler login                          # 브라우저에서 Cloudflare 계정 로그인 (최초 1회)
npx wrangler secret put ANTHROPIC_API_KEY   # AI 키 입력 (선택 — 없으면 규칙 기반 모드)
npm run cf:deploy                           # 빌드 + 배포
```

완료되면 `https://campus-os.<계정 서브도메인>.workers.dev` 주소가 출력된다.

- 모델을 바꾸려면: `npx wrangler secret put ANTHROPIC_MODEL` (기본 `claude-opus-5`)
- 비밀값은 **코드·`wrangler.jsonc`에 쓰지 않는다.** `wrangler secret`으로만 넣는다.

## 방법 B — GitHub 연결 자동 배포 (push할 때마다 배포)

1. Cloudflare 대시보드 → **Workers & Pages** → **Create** → **Import a repository** → `djkdb/zuncam` 선택
2. 빌드 설정
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
   - 배포할 브랜치 선택 (예: `main`, 또는 지금 작업 브랜치)
3. 생성된 Worker → **Settings → Variables and Secrets** → `ANTHROPIC_API_KEY`를 **Secret**으로 추가
4. 저장 후 재배포

> 대시보드 메뉴 이름은 바뀔 수 있다. 막히면 Cloudflare 문서의 "Next.js on Workers" 가이드를 참고.

## 배포 전 로컬에서 Workers 런타임으로 확인

```bash
cp .dev.vars.example .dev.vars   # 필요하면 키 입력
npm run cf:preview               # http://localhost:8787
```

`npm run dev`(Node)가 아니라 실제 Workers 런타임(workerd)에서 돈다. 배포 후 생길 문제를 미리 잡을 수 있다.

## 2026-09-26 검증 결과 (이 레포에서 실제로 실행)

실제 Cloudflare 계정 배포는 하지 않았다(이 작업 환경에 계정 인증 정보가 없음). 대신 배포와 같은 빌드 산출물을 로컬 Workers 런타임에서 확인했다.

| 항목 | 결과 |
|---|---|
| `npm run cf:build` | 성공 (Next 16.3.6 + OpenNext 1.20.6) |
| 번들 크기 (`wrangler deploy --dry-run`) | 8,071 KiB / **gzip 1,597 KiB** — 무료 플랜 한도(압축 3 MiB) 이내 |
| 페이지 (`/`, `/timetable` …) | 200 |
| `/api/ai/*` 키 없음 | 규칙 기반 폴백 정상 |
| `/api/ai/*` 키 있음 (목 서버) | Workers 런타임에서 비밀값 인식, Anthropic SDK 호출·응답 검증 정상 |
| 브라우저 데모 시나리오 (Playwright) | 자연어 입력 → 충돌 → 집중 세션 기록까지 오류 없음 |

## 알아둘 점

- **데이터는 여전히 각 사용자 브라우저(localStorage)에 저장된다.** 배포해도 사용자끼리, 기기끼리 데이터가 공유되지 않는다. 서버 저장이 필요하면 `StorageAdapter`를 Cloudflare D1/KV 구현으로 교체 (future-plan.md).
- 페이지는 정적 파일로 제공되고, Worker 코드는 `/api/ai/*` 요청에서만 실행된다. AI 호출은 대부분 응답 대기 시간이라 CPU 사용량은 작다.
- **API 키가 공개 URL 뒤에 있다.** 누구나 `/api/ai/*`를 호출해 내 키로 비용을 발생시킬 수 있다. 발표·시연용이면 괜찮지만, 공개 운영 전에는 Cloudflare **Rate Limiting 규칙**(대시보드 → Security)이나 접근 제한(Cloudflare Access)을 거는 것을 권장한다.
- `wrangler.jsonc`의 `global_fetch_strictly_public` 플래그는 Worker가 사설 IP로 요청하지 못하게 막는다(보안). 로컬 목 서버(`127.0.0.1`)로 AI 경로를 시험할 때만 잠시 빼야 한다.
