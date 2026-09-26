import { z } from "zod";

/**
 * LLM 입출력 스키마.
 *
 * - *OutputSchema: Structured Output(JSON Schema)으로 모델에 강제하는 형식. 제약(min/max 등)을 최소화해
 *   JSON Schema 변환이 단순하도록 유지하고, 의미 검증은 validate.ts 에서 따로 한다.
 * - 모델은 "시간을 계산"하지 않는다. 시간/순위/블록은 모두 id 로 참조하고, 설명 문장만 만든다.
 */

// ── ① 오늘의 브리핑 (우선순위 근거 + 행동 계획 설명 + 경고) ──────────────────────
export const briefingOutputSchema = z.object({
  summary: z.string().describe("오늘 상황을 2~3문장으로 요약. 가장 중요한 행동 1개를 포함"),
  recommendation: z.string().describe("AI 추천 한 단락. 계획에 있는 시각만 사용"),
  priorityReasons: z
    .array(z.object({ id: z.string(), reason: z.string() }))
    .describe("priorities 의 각 id 에 대한 한 문장 근거"),
  planNotes: z
    .array(z.object({ blockId: z.string(), note: z.string() }))
    .describe("중요한 plan 블록에 대한 짧은 설명 (선택)"),
  warnings: z.array(z.string()).describe("사용자가 놓치면 안 되는 경고 (최대 3개)"),
});
export type BriefingOutput = z.infer<typeof briefingOutputSchema>;

// ── ③ 지금 뭐 하지? ─────────────────────────────────────────────────────────────
export const nowOutputSchema = z.object({
  message: z.string().describe("지금 해야 할 행동과 이유를 2~3문장으로. 결정(decision)을 바꾸지 말 것"),
  tips: z.array(z.string()).describe("바로 실행할 수 있는 짧은 팁 0~2개"),
});
export type NowOutput = z.infer<typeof nowOutputSchema>;

// ── ④ 자연어 입력 → 구조화 ──────────────────────────────────────────────────────
/**
 * 날짜는 모델이 직접 계산하지 않고 "표현"만 구조화한다 (dateType + 인자).
 * 실제 날짜 변환은 src/lib/nlp/resolve.ts 가 코드로 수행한다.
 */
export const parseOutputSchema = z.object({
  kind: z.enum(["event", "assignment", "unknown"]),
  title: z.string().describe("짧은 제목. 예: '풋살', '자료구조 과제'"),
  subject: z.string().describe("과제의 과목명. 없으면 빈 문자열"),
  dateType: z.enum(["weekday", "relative", "absolute", "none"]),
  weekday: z.number().int().nullable().describe("dateType=weekday 일 때 0(일)~6(토)"),
  weekOffset: z.number().int().nullable().describe("0=이번 주(가장 가까운 해당 요일), 1=다음 주, 2=다다음 주"),
  relativeDays: z.number().int().nullable().describe("dateType=relative: 오늘=0, 내일=1, 모레=2"),
  month: z.number().int().nullable(),
  day: z.number().int().nullable(),
  startTime: z.string().nullable().describe("일정 시작 HH:mm (24시간제)"),
  endTime: z.string().nullable().describe("일정 종료 HH:mm. 언급 없으면 null"),
  dueTime: z.string().nullable().describe("과제 마감 HH:mm. 언급 없으면 null"),
  estimatedMinutes: z.number().int().nullable().describe("과제 예상 소요(분)"),
  importance: z.number().int().nullable().describe("1~4. 언급 없으면 null"),
  category: z.enum(["school", "appointment", "club", "exercise", "personal", "etc"]).nullable(),
  location: z.string().nullable(),
  timeAmbiguous: z.boolean().describe("오전/오후가 명시되지 않아 추정했으면 true"),
});
export type ParseOutput = z.infer<typeof parseOutputSchema>;

// ── ⑤ 일정 충돌 분석 ────────────────────────────────────────────────────────────
export const conflictOutputSchema = z.object({
  advice: z.array(z.object({ conflictId: z.string(), explanation: z.string(), suggestion: z.string() })),
});
export type ConflictOutput = z.infer<typeof conflictOutputSchema>;

// ── API 요청 본문 (클라이언트 → 서버) ────────────────────────────────────────────
export const parseRequestSchema = z.object({
  text: z.string().trim().min(1).max(300),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subjects: z.array(z.string()).max(50).default([]),
});
