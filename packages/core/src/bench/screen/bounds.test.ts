import { describe, expect, it } from "vitest";
import { B1, MIXED, type OracleRecord } from "../../../scripts/oracle.ts";
import { MODEL_STRETCH } from "../../../scripts/portfolio.ts";
import { agreement, boundsReport, boundsRuns, checkClaims, RANK_WIDTH } from "../../../scripts/bounds.ts";
import { boundsCells, gapInterval, optimumInterval, topOf } from "./bounds.ts";
import type { ExactOptimum, GapRule } from "./gap.ts";

/** This function makes a row of the file of the optima. */
const row = (input: string, nodes: number, rule: GapRule, cap: number, o: Partial<ExactOptimum>): ExactOptimum => ({
  input,
  hash: "h",
  class: "x",
  nodes,
  edges: 15,
  rule,
  cap,
  status: "optimal",
  proven: true,
  objective: 10,
  bound: 10,
  mipGap: 0,
  seconds: 1,
  binaries: 1,
  b1: 0.5,
  modelB1: null,
  b3max: null,
  highways: 1,
  ...o,
});

describe("the interval of the optimum (EXACT-BOUNDS)", () => {
  it("has a width of 0 at a proven optimum", () => {
    expect(optimumInterval(row("i", 10, "all", 1.5, {}))).toEqual({ lo: 0.5, hi: 0.5, proven: true });
  });

  it("scales the ink of the best solution by the ratio of the bound to the objective", () => {
    // The ink share of the best solution is 0.5. The bound is 0.8 of the objective, so the ink share of the optimum is at least 0.4.
    const i = optimumInterval(row("i", 18, "all", 1.5, { status: "time-limit", proven: false, objective: 10, bound: 8, mipGap: 0.2 }))!;
    expect(i.lo).toBeCloseTo(0.5);
    expect(i.hi).toBeCloseTo(0.6);
    expect(i.proven).toBe(false);
  });

  it("gives the high end 1 without a positive bound, and no interval without a solution", () => {
    expect(optimumInterval(row("i", 40, "all", 1.5, { proven: false, bound: null }))!.hi).toBe(1);
    expect(optimumInterval(row("i", 40, "all", 1.5, { proven: false, bound: -3 }))!.hi).toBe(1);
    expect(optimumInterval(row("i", 40, "all", 1.5, { proven: false, objective: null, b1: null }))).toBeUndefined();
  });
});

describe("the interval of the gap closed (EXACT-BOUNDS)", () => {
  it("takes the low end from the high end of the optimum, and the reverse", () => {
    const g = gapInterval(0.3, 0.1, { lo: 0.5, hi: 0.6 })!;
    expect(g.lo).toBeCloseTo(0.2 / 0.5);
    expect(g.hi).toBeCloseTo(0.2 / 0.4);
    expect(g.mid).toBeCloseTo((0.4 + 0.5) / 2);
    expect(g.width).toBeCloseTo(0.1);
  });

  it("keeps the order of the ends for a run below the baseline, and has no value when the optimum is at the baseline", () => {
    const g = gapInterval(0, 0.1, { lo: 0.5, hi: 0.6 })!;
    expect(g.lo).toBeCloseTo(-0.1 / 0.4);
    expect(g.hi).toBeCloseTo(-0.1 / 0.5);
    expect(gapInterval(0.3, 0.5, { lo: 0.5, hi: 0.9 })).toBeUndefined();
  });
});

// A small screen: 2 inputs at 10 nodes with proven optima, and 2 inputs at 18 nodes with bounds.
const IN10 = ["exact-v1/x/s0", "exact-v1/x/s1"];
const IN18 = ["exact-v1-bounds/x-n18/s0", "exact-v1-bounds/x-n18/s1"];
// Each run: B1, the largest stretch of the model and the flag of mixed collections.
const RUNS: Record<string, [number, number, boolean]> = {
  shared: [0.1, 1.05, false],
  "hw:shared-ways-all": [0.1, 1.05, false],
  a: [0.4, 1.05, false],
  b: [0.3, 1.2, false],
  c: [0.45, 1.05, true],
};
const rec = (strategy: string, input: string, [b1, stretch, mixed]: [number, number, boolean], extra: Record<string, number> = {}): OracleRecord => ({
  strategy,
  input,
  seed: 0,
  measures: { [B1]: b1, [MODEL_STRETCH]: stretch, [MIXED]: mixed ? 1 : 0, ...extra },
});
const RECORDS: OracleRecord[] = [...IN10, ...IN18].flatMap((i) => Object.entries(RUNS).map(([s, r]) => rec(s, i, r)));
const OPTIMA: ExactOptimum[] = [
  ...IN10.flatMap((i) => (["collection", "all"] as const).flatMap((rule) => [1.1, 1.25, 1.5].map((cap) => row(i, 10, rule, cap, { b1: 0.5 })))),
  ...IN18.flatMap((i) =>
    (["collection", "all"] as const).flatMap((rule) => [1.1, 1.25, 1.5].map((cap) => row(i, 18, rule, cap, { proven: false, status: "time-limit", b1: 0.5, objective: 10, bound: 8 }))),
  ),
];

describe("the gap closed by size, rule and cap (EXACT-BOUNDS)", () => {
  const cells = boundsCells(boundsRuns(RECORDS), OPTIMA);

  it("gives one cell for each size, rule and cap, with the counts of the solves", () => {
    expect(cells.length).toBe(2 * 2 * 3);
    const c = cells.find((x) => x.nodes === 18 && x.rule === "all" && x.cap === 1.5)!;
    expect([c.inputs, c.proven, c.bounded, c.none]).toEqual([2, 0, 2, 0]);
    expect(c.optimumWidth).toBeCloseTo(0.1);
  });

  it("refuses a run above the cap, and a run that mixes collections under the rule `collection`", () => {
    const c10 = cells.find((x) => x.nodes === 10 && x.rule === "collection" && x.cap === 1.1)!;
    expect(topOf(c10).map((r) => r.strategy)).toEqual(["a", "hw:shared-ways-all", "shared"]);
    expect(c10.rows.find((r) => r.strategy === "a")!.mid).toBeCloseTo(0.75);
    expect(c10.rows.find((r) => r.strategy === "b")!.values).toBe(0);
    expect(c10.rows.find((r) => r.strategy === "c")!.values).toBe(0);
    const all = cells.find((x) => x.nodes === 10 && x.rule === "all" && x.cap === 1.25)!;
    expect(topOf(all).map((r) => r.strategy)).toEqual(["c", "a", "b", "hw:shared-ways-all", "shared"]);
  });

  it("gives an interval at a bound, and a width of 0 at a proven optimum", () => {
    const c18 = cells.find((x) => x.nodes === 18 && x.rule === "all" && x.cap === 1.5)!;
    const a = c18.rows.find((r) => r.strategy === "a")!;
    expect(a.lo).toBeCloseTo(0.3 / 0.5);
    expect(a.hi).toBeCloseTo(0.3 / 0.4);
    expect(cells.find((x) => x.nodes === 10 && x.rule === "all" && x.cap === 1.5)!.rows.find((r) => r.strategy === "a")!.width).toBeCloseTo(0);
  });

  it("checks the claims of the prediction, and agrees with the gap closed of the screen at 10 nodes", () => {
    const claims = checkClaims(cells);
    expect(claims.map((c) => c.id)).toEqual([1, 2, 3]);
    // The same 5 strategies rank at 10 and 18 nodes. There are no cells at 24 and 40 nodes.
    expect(claims[0]!.verdict).toBe("met");
    expect(claims[1]!.verdict).toBe("no data");
    expect(RANK_WIDTH).toBe(0.3);
    const withScreen = RECORDS.filter((r) => r.input.startsWith("exact-v1/")).map((r) =>
      r.strategy === "a" ? { ...r, measures: { ...r.measures, "route.bundle.gap-closed.collection": 0.75, "route.bundle.gap-closed.all": 0.7 } } : r,
    );
    expect(agreement(withScreen, OPTIMA)).toEqual({ runs: 4, agree: 2 });
    const report = boundsReport(RECORDS, OPTIMA);
    expect(report.markdown).toContain("## The solves by size, rule and cap");
    expect(report.markdown).toContain("### The rule `all` at the cap 1.5");
  });
});
