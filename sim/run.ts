/**
 * Campus OS 시뮬레이션.
 *   npm run sim            → 요약 출력
 *   npm run sim -- --write → docs/simulation-report.md 갱신
 */
import { writeFileSync } from "node:fs";
import type { CampusData } from "../src/lib/domain/types";
import { addDays } from "../src/lib/time";
import { checkInvariants, type Violation } from "./invariants";
import { evaluateCorpus, HOLDOUT } from "./nlpCorpus";
import { PERSONAS, randomData, randomWeek, rng } from "./personas";
import { playDay, playWeek, type DayResult, type Policy, type WeekResult } from "./playthrough";

const WEEK_START = "2026-09-21"; // 월요일
const DATES = Array.from({ length: 7 }, (_, i) => addDays(WEEK_START, i));
const RANDOM_SEEDS = 300;
const POLICIES: Policy[] = ["campus-os", "campus-os-eager", "campus-os-blind", "edf", "procrastinate"];
const WEEK_POLICIES: Policy[] = ["campus-os", "campus-os-eager", "edf", "procrastinate"];
const WEEKS_PER_LOAD = 60;

interface Scenario {
  name: string;
  persona: string;
  date: string;
  data: CampusData;
}

function scenarios(): Scenario[] {
  const out: Scenario[] = [];
  for (const p of PERSONAS) {
    DATES.forEach((date, i) => out.push({ name: `${p.id}@${date}`, persona: p.id, date, data: p.build(date, rng(1000 + i)) }));
  }
  for (let s = 0; s < RANDOM_SEEDS; s++) {
    const date = DATES[s % 7];
    out.push({ name: `random#${s}@${date}`, persona: "random", date, data: randomData(date, rng(s)) });
  }
  return out;
}

// ── 1) 불변식 스윕 ────────────────────────────────────────────────────────────
function sweep(list: Scenario[]) {
  const byCode = new Map<string, { count: number; examples: string[] }>();
  let checks = 0;
  for (const sc of list) {
    const step = sc.persona === "random" ? 30 : 10;
    for (let t = 7 * 60; t < 24 * 60; t += step) {
      checks++;
      const vs: Violation[] = checkInvariants(sc.data, { date: sc.date, minutes: t });
      for (const v of vs) {
        const e = byCode.get(v.code) ?? { count: 0, examples: [] };
        e.count++;
        if (e.examples.length < 3) e.examples.push(`${sc.name} ${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")} — ${v.message}`);
        byCode.set(v.code, e);
      }
    }
  }
  return { checks, byCode };
}

// ── 2) 하루 재생 ──────────────────────────────────────────────────────────────
interface Agg {
  days: number;
  dueTotal: number;
  dueMet: number;
  overdueCleared: number;
  work: number;
  idle: number;
  idleDue: number;
  late: number;
  switches: number;
  flip: number;
  churn: number;
  misinformed: number;
}
const empty = (): Agg => ({ days: 0, dueTotal: 0, dueMet: 0, overdueCleared: 0, work: 0, idle: 0, idleDue: 0, late: 0, switches: 0, flip: 0, churn: 0, misinformed: 0 });
function addTo(a: Agg, r: DayResult) {
  a.days++;
  a.dueTotal += r.dueTodayTotal;
  a.dueMet += r.dueTodayMet;
  a.overdueCleared += r.overdueCleared;
  a.work += r.workMinutes;
  a.idle += r.idleWithWorkMinutes;
  a.idleDue += r.idleWithDueTodayMinutes;
  a.late += r.lateNightMinutes;
  a.switches += r.switches;
  a.flip += r.flipFlops;
  a.churn += r.planChurn;
  a.misinformed += r.misinformedMinutes;
}

function playthrough(list: Scenario[]) {
  const byPolicy = new Map<Policy, Agg>(POLICIES.map((p) => [p, empty()]));
  const byPersona = new Map<string, Map<Policy, Agg>>();
  const misses: string[] = [];
  for (const sc of list) {
    for (const policy of POLICIES) {
      const r = playDay(sc.data, sc.date, policy);
      addTo(byPolicy.get(policy)!, r);
      const pm = byPersona.get(sc.persona) ?? new Map<Policy, Agg>(POLICIES.map((p) => [p, empty()]));
      addTo(pm.get(policy)!, r);
      byPersona.set(sc.persona, pm);
      if (policy === "campus-os" && r.dueTodayMet < r.dueTodayTotal) {
        const edf = playDay(sc.data, sc.date, "edf");
        if (edf.dueTodayMet > r.dueTodayMet && misses.length < 8) misses.push(`${sc.name}: campus-os ${r.dueTodayMet}/${r.dueTodayTotal}, edf ${edf.dueTodayMet}/${edf.dueTodayTotal}`);
      }
    }
  }
  return { byPolicy, byPersona, misses };
}

const pct = (a: number, b: number) => (b === 0 ? "-" : `${((a / b) * 100).toFixed(1)}%`);
const perDay = (x: number, d: number) => (d === 0 ? "-" : (x / d).toFixed(1));

function aggRow(name: string, a: Agg) {
  return `| ${name} | ${a.dueMet}/${a.dueTotal} (${pct(a.dueMet, a.dueTotal)}) | ${a.overdueCleared} | ${perDay(a.work, a.days)} | ${perDay(a.idle, a.days)} | ${perDay(a.idleDue, a.days)} | ${perDay(a.late, a.days)} | ${perDay(a.switches, a.days)} | ${a.flip} | ${perDay(a.churn, a.days)} | ${perDay(a.misinformed, a.days)} |`;
}
const AGG_HEADER = "| 정책 | 오늘 마감 준수 | 지난 마감 처리 | 과제(분/일) | 할 일 있는데 쉼(분/일) | 오늘 마감 남았는데 쉼(분/일) | 23시 이후(분/일) | 전환(회/일) | 번복 | 계획 흔들림(회/일) | 잘못된 정보로 조언(분/일) |\n|---|---|---|---|---|---|---|---|---|---|---|";

// ── 3) 1주일 재생 ─────────────────────────────────────────────────────────────
function weeks() {
  const table = new Map<string, WeekResult[]>();
  for (const load of ["light", "normal", "heavy"] as const) {
    for (let s = 0; s < WEEKS_PER_LOAD; s++) {
      const data = randomWeek(WEEK_START, rng(5000 + s), load);
      for (const p of WEEK_POLICIES) {
        const key = `${load}|${p}`;
        table.set(key, [...(table.get(key) ?? []), playWeek(data, WEEK_START, p, addDays)]);
      }
    }
  }
  return table;
}

// ── 실행 ─────────────────────────────────────────────────────────────────────
const list = scenarios();
const t0 = Date.now();
const sw = sweep(list);
const pt = playthrough(list);
const corpus = evaluateCorpus();
const holdout = evaluateCorpus(HOLDOUT);
const week = weeks();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

const lines: string[] = [];
lines.push(`# Simulation Report`, "", `생성: \`npm run sim -- --write\` · 시나리오 ${list.length}개 (페르소나 ${PERSONAS.length}종 × 7일 + 무작위 ${RANDOM_SEEDS}개) · ${elapsed}s`, "");
lines.push(`## 1. 불변식 검사`, "", `시점 검사 ${sw.checks.toLocaleString()}회 (페르소나 10분 간격, 무작위 30분 간격, 07:00~23:50)`, "");
if (sw.byCode.size === 0) lines.push("위반 없음.");
else {
  lines.push("| 코드 | 위반 수 | 예시 |", "|---|---|---|");
  for (const [code, e] of [...sw.byCode.entries()].sort((a, b) => b[1].count - a[1].count)) lines.push(`| ${code} | ${e.count} | ${e.examples.map((x) => x.replace(/\|/g, "/")).join("<br>")} |`);
}
lines.push("", `## 2. 하루 재생 (가상의 학생이 10분마다 행동 선택)`, "", "### 전체", "", AGG_HEADER);
for (const p of POLICIES) lines.push(aggRow(p, pt.byPolicy.get(p)!));
lines.push("", "### 페르소나별 (campus-os / edf)", "", AGG_HEADER);
for (const [persona, pm] of pt.byPersona) {
  lines.push(aggRow(`${persona} · campus-os`, pm.get("campus-os")!));
  lines.push(aggRow(`${persona} · edf`, pm.get("edf")!));
}
if (pt.misses.length) lines.push("", "campus-os 가 EDF 보다 마감을 적게 지킨 사례:", "", ...pt.misses.map((m) => `- ${m}`));
lines.push("", `## 3. 1주일 연속 재생`, "", `무작위 주간 시나리오 부하별 ${WEEKS_PER_LOAD}개 (light 과제 4개 · normal 7개 · heavy 11개, 60~240분). 진행 상태를 다음 날로 이어간다.`, "");
lines.push("| 부하 | 정책 | 마감 준수 | 과제(분/주) | 하루 최대(분, 평균) | 23시 이후(분/주) |", "|---|---|---|---|---|---|");
for (const [key, rs] of week) {
  const [load, p] = key.split("|");
  const dl = rs.reduce((s, r) => s + r.deadlines, 0);
  const met = rs.reduce((s, r) => s + r.met, 0);
  const n = rs.length;
  lines.push(`| ${load} | ${p} | ${met}/${dl} (${pct(met, dl)}) | ${(rs.reduce((s, r) => s + r.workMinutes, 0) / n).toFixed(0)} | ${(rs.reduce((s, r) => s + r.maxDayWork, 0) / n).toFixed(0)} | ${(rs.reduce((s, r) => s + r.lateNightMinutes, 0) / n).toFixed(0)} |`);
}
const okCount = corpus.filter((c) => c.ok).length;
lines.push("", `## 4. 자연어 파서 (규칙 기반)`, "", `### 튜닝 코퍼스`, "", `정확도 **${okCount}/${corpus.length} (${pct(okCount, corpus.length)})**`, "");
const fails = corpus.filter((c) => !c.ok);
if (fails.length) {
  lines.push("| 입력 | 불일치 |", "|---|---|");
  for (const f of fails) lines.push(`| ${f.text} | ${f.mismatches.join("; ")} |`);
}

const hOk = holdout.filter((c) => c.ok).length;
lines.push("", `### 홀드아웃 (튜닝에 쓰지 않은 문장)`, "", `정확도 **${hOk}/${holdout.length} (${pct(hOk, holdout.length)})**`, "");
if (holdout.some((c) => !c.ok)) {
  lines.push("| 입력 | 불일치 |", "|---|---|");
  for (const f of holdout.filter((c) => !c.ok)) lines.push(`| ${f.text} | ${f.mismatches.join("; ")} |`);
}

const report = lines.join("\n") + "\n";
console.log(report);
if (process.argv.includes("--write")) {
  writeFileSync(new URL("../docs/simulation-report.md", import.meta.url), report);
  console.log("→ docs/simulation-report.md");
}
