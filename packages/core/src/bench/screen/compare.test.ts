import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { boardWins, compareMeasure, minEffectOf, type CompareSpec } from "./compare.ts";
import { RECORD_EPS } from "./hash.ts";
import { compareSpec, MEASURES, MIN_EFFECTS, measureByKey } from "./measures.ts";

const LOWER: CompareSpec = { direction: "lower" };
const HIGHER: CompareSpec = { direction: "higher" };

describe("minEffectOf (WIN-RES)", () => {
  it("gives RECORD_EPS without a minimum effect, and for 0", () => {
    expect(minEffectOf({})).toBe(RECORD_EPS);
    expect(minEffectOf({ minEffect: 0 })).toBe(RECORD_EPS);
    expect(minEffectOf({ minEffect: 0.0001 })).toBe(RECORD_EPS);
  });

  it("gives an absolute minimum effect above RECORD_EPS", () => {
    expect(minEffectOf({ minEffect: 0.5 }, 3, 4)).toBe(0.5);
  });

  it("scales a relative minimum effect with the larger absolute value", () => {
    expect(minEffectOf({ minEffect: { rel: 0.01 } }, 100, 200)).toBeCloseTo(2, 12);
    expect(minEffectOf({ minEffect: { rel: 0.01 } }, 200, 100)).toBeCloseTo(2, 12);
    expect(minEffectOf({ minEffect: { rel: 0.01 } }, -300, 10)).toBeCloseTo(3, 12);
    expect(minEffectOf({ minEffect: { rel: 0.01 } }, 0.01, 0.02)).toBe(RECORD_EPS);
  });

  it("falls back to RECORD_EPS when the relative product is not finite", () => {
    expect(minEffectOf({ minEffect: { rel: 0.01 } }, Infinity, 1)).toBe(RECORD_EPS);
    expect(minEffectOf({ minEffect: { rel: 0.01 } }, 1, Number.NaN)).toBe(RECORD_EPS);
  });
});

describe("compareMeasure (WIN-RES)", () => {
  it("gives a tie for a change of at most the threshold", () => {
    expect(compareMeasure(1.152043, 1.152046, LOWER)).toBe("tie");
    expect(compareMeasure(1, 1 + RECORD_EPS, LOWER)).toBe("tie");
    expect(compareMeasure(100, 101, { direction: "lower", minEffect: { rel: 0.01 } })).toBe("tie");
  });

  it("gives better or worse by the direction above the threshold", () => {
    expect(compareMeasure(1.148957, 1.152046, LOWER)).toBe("better");
    expect(compareMeasure(1.148957, 1.152046, HIGHER)).toBe("worse");
    expect(compareMeasure(0.22239, 0.209678, HIGHER)).toBe("better");
    expect(compareMeasure(0.22239, 0.209678, LOWER)).toBe("worse");
    expect(compareMeasure(100, 102.5, { direction: "lower", minEffect: { rel: 0.01 } })).toBe("better");
  });

  it("is symmetric: a swap of the values swaps better and worse", () => {
    const specs: CompareSpec[] = [LOWER, HIGHER, { direction: "lower", minEffect: { rel: 0.01 } }, { direction: "higher", minEffect: 0.2 }];
    const pairs: [number, number][] = [[1, 1.0005], [1, 1.5], [100, 101], [100, 103], [0, 0.3], [-2, 2]];
    const swap = { better: "worse", worse: "better", tie: "tie" } as const;
    for (const spec of specs) for (const [a, b] of pairs) expect(compareMeasure(b, a, spec)).toBe(swap[compareMeasure(a, b, spec)]);
  });

  it("gives a tie for two equal infinite values, and a result for one infinite value", () => {
    expect(compareMeasure(Infinity, Infinity, LOWER)).toBe("tie");
    expect(compareMeasure(-Infinity, -Infinity, HIGHER)).toBe("tie");
    expect(compareMeasure(5, Infinity, LOWER)).toBe("better");
    expect(compareMeasure(Infinity, 5, { direction: "lower", minEffect: { rel: 0.01 } })).toBe("worse");
  });

  it("refuses NaN", () => {
    expect(() => compareMeasure(Number.NaN, 1, LOWER)).toThrow(RangeError);
    expect(() => compareMeasure(1, Number.NaN, LOWER)).toThrow(RangeError);
  });
});

describe("boardWins (the wave rule of WIN-RES)", () => {
  it("needs one better compare and no worse compare", () => {
    expect(boardWins(["better", "tie"])).toBe(true);
    expect(boardWins(["better", "better"])).toBe(true);
    expect(boardWins(["tie", "tie"])).toBe(false);
    expect(boardWins(["better", "worse"])).toBe(false);
    expect(boardWins([])).toBe(false);
  });
});

describe("the minimum effects of MEASURES (WIN-RES)", () => {
  it("has a rule for each unit, and each unit in one rule only", () => {
    const units = MIN_EFFECTS.flatMap((r) => r.units);
    expect(new Set(units).size).toBe(units.length);
    for (const m of MEASURES) expect(units).toContain(m.unit);
    for (const r of MIN_EFFECTS) expect(r.reason.length).toBeGreaterThan(0);
  });

  it("gives RECORD_EPS to the shares, the stretch values and the counts, and 1% to the lengths and the angles", () => {
    for (const m of MEASURES) {
      if (m.unit.startsWith("count")) expect(m.minEffect).toBe(0);
      else if (m.unit === "units" || m.unit === "units of the board" || m.unit === "degrees") expect(m.minEffect).toEqual({ rel: 0.01 });
      else expect(m.minEffect).toBeUndefined();
    }
  });

  it("gives a spec with the direction and the minimum effect of the measure", () => {
    const b1 = measureByKey("B1.inkSaved")!;
    expect(compareSpec(b1)).toEqual({ direction: "higher" });
    for (const m of MEASURES) expect(compareSpec(m).direction).toBe(m.better);
  });
});

describe("the copy and the text of docs/PROMOTION.md agree (WIN-RES)", () => {
  const text = readFileSync(new URL("../../../../../docs/PROMOTION.md", import.meta.url), "utf8");

  it("writes the formula of minEffectOf", () => {
    expect(text).toContain("with `m = spec.minEffect ?? 0`, is `threshold(a, b) = max(RECORD_EPS, typeof m === \"number\" ? m : m.rel * max(|a|, |b|))`");
    expect(text).toContain("A non-finite `rel` product falls back to `RECORD_EPS`.");
    expect(text).toContain("`minEffect?: number | { rel: number }`");
  });

  it("writes the tie rule of compareMeasure", () => {
    expect(text).toContain("gives `\"tie\"` when `|a − b| ≤ threshold(a, b)`");
    expect(text).toContain("Two equal `Infinity` values are a tie. `compareMeasure` refuses `NaN`.");
    expect(text).toContain("A tie does not count as a win.");
  });

  it("lists each rule of MIN_EFFECTS in the table of the minimum effects", () => {
    for (const r of MIN_EFFECTS) {
      const units = r.units.map((u) => `\`${u}\``).join(", ");
      expect(text).toContain(`| ${units} |`);
    }
  });
});
