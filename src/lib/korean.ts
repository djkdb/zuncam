/**
 * 한국어 조사 선택. "풋살이(가)" 같은 어색한 표기 대신 받침 여부로 조사를 고른다.
 * 마지막 글자가 한글이 아니면(영문, 숫자, 괄호 등) 괄호 병기 형태로 둔다.
 */
type JosaPair = "이/가" | "을/를" | "은/는" | "과/와" | "으로/로";

function lastHangul(word: string): { hasBatchim: boolean; isRieul: boolean } | null {
  const trimmed = word.trim().replace(/['"’”)\]]+$/, "");
  const ch = trimmed.charCodeAt(trimmed.length - 1);
  if (Number.isNaN(ch) || ch < 0xac00 || ch > 0xd7a3) return null;
  const jong = (ch - 0xac00) % 28;
  return { hasBatchim: jong !== 0, isRieul: jong === 8 };
}

export function josa(word: string, pair: JosaPair): string {
  const [withB, withoutB] = pair.split("/");
  const info = lastHangul(word);
  if (!info) return `${word}${withB}(${withoutB})`.replace("으로(로)", "(으)로");
  if (pair === "으로/로") return word + (info.hasBatchim && !info.isRieul ? "으로" : "로");
  return word + (info.hasBatchim ? withB : withoutB);
}

/** 제목을 따옴표로 감싸면서 조사를 붙인다: q("풋살", "이/가") → "'풋살'이" */
export function q(title: string, pair: JosaPair): string {
  return josa(`'${title}'`, pair);
}
