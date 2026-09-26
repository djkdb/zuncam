import { describe, expect, it } from "vitest";
import { checkInvariants } from "../sim/invariants";
import { evaluateCorpus } from "../sim/nlpCorpus";
import { PERSONAS, randomData, randomWeek, rng } from "../sim/personas";
import { playDay } from "../sim/playthrough";
import { addDays } from "@/lib/time";

/** npm run sim 의 축소판 — 회귀 방지용 (전체 리포트는 npm run sim) */
const DATES = Array.from({ length: 7 }, (_, i) => addDays("2026-09-21", i));

describe("시뮬레이션 회귀", () => {
  it("페르소나 × 7일 × 30분 간격에서 불변식 위반 0", () => {
    const violations: string[] = [];
    for (const p of PERSONAS) {
      DATES.forEach((date, i) => {
        const data = p.build(date, rng(1000 + i));
        for (let t = 7 * 60; t < 24 * 60; t += 30) for (const v of checkInvariants(data, { date, minutes: t })) violations.push(`${p.id}@${date} ${t}: ${v.code} ${v.message}`);
      });
    }
    for (let s = 0; s < 60; s++) {
      const date = DATES[s % 7];
      const data = randomData(date, rng(s));
      for (let t = 7 * 60; t < 24 * 60; t += 60) for (const v of checkInvariants(data, { date, minutes: t })) violations.push(`random#${s}: ${v.code} ${v.message}`);
    }
    expect(violations.slice(0, 5)).toEqual([]);
  });
  it("조언을 따르면 번복(A→B→A)이 없다", () => {
    let flips = 0;
    for (const p of PERSONAS) DATES.forEach((date, i) => (flips += playDay(p.build(date, rng(1000 + i)), date, "campus-os").flipFlops));
    expect(flips).toBe(0);
  });
  it("같은 시드는 앞에서 무엇을 생성했든 같은 id·같은 시나리오를 만든다 (TS-17)", () => {
    const a = JSON.stringify(randomWeek("2026-09-21", rng(5007), "normal"));
    randomData("2026-09-21", rng(1));
    randomWeek("2026-09-21", rng(9), "heavy");
    expect(JSON.stringify(randomWeek("2026-09-21", rng(5007), "normal"))).toBe(a);
  });
  it("자연어 튜닝 코퍼스 전부 통과", () => {
    expect(evaluateCorpus().filter((c) => !c.ok).map((c) => c.text)).toEqual([]);
  });
});
