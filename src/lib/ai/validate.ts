import type { AIContext } from "./aiContext";
import type { BriefingOutput, ConflictOutput, NowOutput } from "./schemas";

/**
 * LLM 응답의 "의미" 검증.
 * JSON 형식은 Structured Output + zod 가 보장하지만, 내용이 틀릴 수 있다
 * (존재하지 않는 시각을 말하거나, 없는 항목 id 를 참조하거나, 결정과 다른 행동을 추천).
 * 검증에 실패한 필드는 버리고, 클라이언트는 그 자리에 코드가 만든 기본 문장을 사용한다.
 */

export interface Validated<T> {
  value: T;
  issues: string[];
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * 텍스트에 등장하는 시각을 모두 추출한다. "16:20", "오후 4시 20분", "6시 반", "18시" 형태를 인식한다.
 * 오전/오후가 없는 "N시"는 두 후보(N시, N+12시)를 모두 반환한다.
 * "N시간"은 시각이 아니므로 제외한다.
 */
export function extractTimes(text: string): string[][] {
  const found: string[][] = [];
  const colon = /(?<!\d)([01]?\d|2[0-4]):([0-5]\d)(?!\d)/g;
  for (const m of text.matchAll(colon)) found.push([`${pad(Number(m[1]))}:${m[2]}`]);
  const korean = /(오전|오후|아침|저녁|밤|새벽)?\s*(\d{1,2})시(?!간)\s*(?:(\d{1,2})분|(반))?/g;
  for (const m of text.matchAll(korean)) {
    const h = Number(m[2]);
    const min = m[4] ? 30 : m[3] ? Number(m[3]) : 0;
    if (h > 24 || min > 59) continue;
    const pm = m[1] === "오후" || m[1] === "저녁" || m[1] === "밤";
    if (m[1]) found.push([`${pad(pm && h < 12 ? h + 12 : h)}:${pad(min)}`]);
    else if (h >= 13) found.push([`${pad(h)}:${pad(min)}`]);
    else found.push([`${pad(h)}:${pad(min)}`, `${pad(h + 12)}:${pad(min)}`]);
  }
  return found;
}

/** 허용되지 않은 시각 목록 (비어 있으면 통과) */
export function findUnknownTimes(text: string, allowed: readonly string[]): string[] {
  const set = new Set(allowed);
  return extractTimes(text)
    .filter((cands) => !cands.some((c) => set.has(c)))
    .map((c) => c[0]);
}

function checkText(label: string, text: string, ctx: AIContext, issues: string[]): string | null {
  const t = text.trim();
  if (!t) {
    issues.push(`${label}: 빈 문자열`);
    return null;
  }
  const bad = findUnknownTimes(t, ctx.allowedTimes);
  if (bad.length) {
    issues.push(`${label}: 계산 결과에 없는 시각 ${bad.join(", ")} 사용`);
    return null;
  }
  return t;
}

export interface ValidBriefing {
  summary: string | null;
  recommendation: string | null;
  priorityReasons: Record<string, string>;
  planNotes: Record<string, string>;
  warnings: string[];
}

export function validateBriefing(out: BriefingOutput, ctx: AIContext): Validated<ValidBriefing> {
  const issues: string[] = [];
  const priorityIds = new Set(ctx.priorities.map((p) => p.id));
  const blockIds = new Set(ctx.plan.map((b) => b.id));

  const priorityReasons: Record<string, string> = {};
  for (const r of out.priorityReasons) {
    if (!priorityIds.has(r.id)) {
      issues.push(`priorityReasons: 존재하지 않는 id '${r.id}'`);
      continue;
    }
    const ok = checkText(`priorityReasons[${r.id}]`, r.reason, ctx, issues);
    if (ok && !priorityReasons[r.id]) priorityReasons[r.id] = ok;
  }
  const planNotes: Record<string, string> = {};
  for (const n of out.planNotes) {
    if (!blockIds.has(n.blockId)) {
      issues.push(`planNotes: 존재하지 않는 blockId '${n.blockId}'`);
      continue;
    }
    const ok = checkText(`planNotes[${n.blockId}]`, n.note, ctx, issues);
    if (ok) planNotes[n.blockId] = ok;
  }
  const warnings = out.warnings
    .map((w, i) => checkText(`warnings[${i}]`, w, ctx, issues))
    .filter((w): w is string => w !== null)
    .slice(0, 3);

  return {
    value: {
      summary: checkText("summary", out.summary, ctx, issues),
      recommendation: checkText("recommendation", out.recommendation, ctx, issues),
      priorityReasons,
      planNotes,
      warnings,
    },
    issues,
  };
}

/** 제목에서 핵심 단어 (2글자 이상 첫 토큰) */
function keyword(title: string): string {
  return title.split(/[\s()[\]·,]+/).find((w) => w.length >= 2) ?? title;
}

export function validateNow(out: NowOutput, ctx: AIContext): Validated<{ message: string | null; tips: string[] }> {
  const issues: string[] = [];
  let message = checkText("message", out.message, ctx, issues);
  const target = ctx.now.targetTitle;
  if (message && target && !message.includes(keyword(target))) {
    issues.push(`message: 결정된 대상 '${target}'을(를) 언급하지 않음 — 다른 행동을 추천했을 가능성`);
    message = null;
  }
  const tips = out.tips
    .map((t, i) => checkText(`tips[${i}]`, t, ctx, issues))
    .filter((t): t is string => t !== null)
    .slice(0, 2);
  return { value: { message, tips }, issues };
}

export function validateConflicts(
  out: ConflictOutput,
  conflicts: { id: string }[],
  allowedTimes: string[],
): Validated<Record<string, { explanation: string; suggestion: string }>> {
  const issues: string[] = [];
  const ids = new Set(conflicts.map((c) => c.id));
  const result: Record<string, { explanation: string; suggestion: string }> = {};
  for (const a of out.advice) {
    if (!ids.has(a.conflictId)) {
      issues.push(`advice: 존재하지 않는 conflictId '${a.conflictId}'`);
      continue;
    }
    const bad = [...findUnknownTimes(a.explanation, allowedTimes), ...findUnknownTimes(a.suggestion, allowedTimes)];
    // 충돌 해결 "제안"에는 새로운 시각(예: 16:30으로 변경)이 나올 수 있으므로, 설명에만 엄격히 적용한다
    const badExplain = findUnknownTimes(a.explanation, allowedTimes);
    if (badExplain.length) {
      issues.push(`advice[${a.conflictId}]: 설명에 존재하지 않는 시각 ${badExplain.join(", ")}`);
      continue;
    }
    if (bad.length) issues.push(`advice[${a.conflictId}]: 제안에 새 시각 ${bad.join(", ")} (허용, 사용자 확인 필요)`);
    result[a.conflictId] = { explanation: a.explanation.trim(), suggestion: a.suggestion.trim() };
  }
  return { value: result, issues };
}
