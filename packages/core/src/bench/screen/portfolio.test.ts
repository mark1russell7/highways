import { describe, expect, it } from "vitest";
import { B1, B10, B3_Q95, MIXED, type OracleRecord } from "../../../scripts/oracle.ts";
import {
  API_KS,
  capTable,
  capValue,
  choose,
  discordance,
  discordanceByCause,
  fallbackValue,
  gapValue,
  greedySet,
  MODEL_STRETCH,
  obeys,
  paretoCurve,
  passes,
  portfolioReport,
  portfolioValues,
  ratioValue,
  RULE_CAP,
  RULE_CAPS,
  ruleBaselines,
  ruleForms,
  ruleGapName,
  ruleTable,
  ruleValue,
  runTable,
  screenSplits,
  seedSplits,
  setTimes,
  shareOf,
  singleBest,
  strategyTimes,
} from "../../../scripts/portfolio.ts";
import type { TimeRecord } from "../../../scripts/portfolio-time.ts";
import { GAP_CAPS, GAP_RULES, gapCap, type ExactOptimum, type GapRule } from "./gap.ts";

/** This function makes a record of the strategy `strategy` on the input `input`, with the measures `measures`. */
const rec = (strategy: string, input: string, measures: Record<string, number>, hard: Record<string, number> = {}): OracleRecord => ({
  strategy,
  input,
  seed: Number(input.split("/s").pop()),
  measures,
  hard,
});

// A small hand-made screen: 2 boards of 2 seeds, the baseline `shared` and 3 strategies.
// `a` saves much ink on the board `x` but stretches more on `x/s1`. `b` is good on the board `y`. `c` is a little better than `shared` everywhere.
const IN = ["t/x/s0", "t/x/s1", "t/y/s0", "t/y/s1"];
const B1S: Record<string, number[]> = { shared: [0.1, 0.1, 0.2, 0.2], a: [0.3, 0.4, 0.2, 0.25], b: [0.1, 0.1, 0.5, 0.4], c: [0.12, 0.12, 0.24, 0.24] };
const Q95: Record<string, number[]> = { shared: [1.1, 1.1, 1.2, 1.2], a: [1.1, 1.3, 1.2, 1.2], b: [1.1, 1.1, 1.2005, 1.2], c: [1.1, 1.1, 1.2, 1.2] };
// The gap closed is not the order of B1: on `x/s0`, `c` closes more of the gap than `a`.
const GAP: Record<string, number[]> = { shared: [0, 0, 0, 0], a: [0.5, 0.9, 0.1, 0.2], b: [0, 0, 0.8, 0.6], c: [0.6, 0.2, 0.3, 0.3] };
const RECORDS: OracleRecord[] = Object.keys(B1S).flatMap((s) =>
  IN.map((i, k) => rec(s, i, { [B1]: B1S[s]![k]!, [B3_Q95]: Q95[s]![k]!, [B10]: GAP[s]![k]!, [MODEL_STRETCH]: 1.2 })),
);
const POOL = ["shared", "a", "b", "c"];

describe("the portfolio (PORTFOLIO)", () => {
  it("guards a run with the B3 q95 and the hard counts of `shared`, and with the largest cap of the stretch", () => {
    const table = runTable(RECORDS);
    const base = table.get("t/x/s1")!.get("shared")!;
    expect(passes(table.get("t/x/s1")!.get("a")!, base, "q95")).toBe(false);
    expect(passes(table.get("t/x/s1")!.get("a")!, base, "cap")).toBe(true);
    // A tie within RECORD_EPS passes.
    expect(passes(table.get("t/y/s0")!.get("b")!, table.get("t/y/s0")!.get("shared")!, "q95")).toBe(true);
    // More hard breaks than `shared`, or a stretch above 1.5, fail each guard.
    expect(passes({ b1: 1, q95: 1, hard: { complete: 1 } }, base, "cap")).toBe(false);
    expect(passes({ b1: 1, q95: 1, stretch: 1.6, hard: {} }, base, "cap")).toBe(false);
  });

  it("keeps the output with the best B1 that passes the guard, and falls back to `shared`", () => {
    const table = runTable(RECORDS);
    expect(choose(table.get("t/x/s0")!, ["a", "b", "c"], "q95")).toBe("a");
    expect(choose(table.get("t/x/s1")!, ["a", "c"], "q95")).toBe("c");
    expect(choose(table.get("t/x/s1")!, ["a"], "q95")).toBe("shared");
    expect(choose(table.get("t/x/s1")!, ["a"], "cap")).toBe("a");
    expect(choose(new Map(), ["a"], "q95")).toBeUndefined();
    expect(portfolioValues(table, IN, ["a", "b"], "q95", gapValue(table))).toEqual([0.5, 0, 0.8, 0.6]);
  });

  it("gives the ratio of B1 to `shared`, and no ratio where `shared` saves no ink", () => {
    const table = runTable([...RECORDS, rec("shared", "t/z/s0", { [B1]: 0, [B3_Q95]: 1 }), rec("a", "t/z/s0", { [B1]: 0.2, [B3_Q95]: 1 })]);
    expect(ratioValue(table)("t/x/s0", "a")).toBeCloseTo(3);
    expect(ratioValue(table)("t/z/s0", "a")).toBeUndefined();
  });

  it("chooses a set greedily, and stops when no strategy improves the median", () => {
    const table = runTable(RECORDS);
    const value = gapValue(table);
    const one = greedySet(table, IN, POOL, 1, "q95", value);
    expect(one).toEqual(["b"]);
    const two = greedySet(table, IN, POOL, 2, "q95", value);
    expect(two[0]).toBe("b");
    expect(two).toHaveLength(2);
    // The set never holds `shared`, and it stops at the size of the pool.
    expect(greedySet(table, IN, POOL, 8, "q95", value)).not.toContain("shared");
    expect(greedySet(table, IN, POOL, 8, "q95", value).length).toBeLessThanOrEqual(3);
  });

  it("gives the best single strategy, and with `strict` only one that passes the guard on each input", () => {
    const table = runTable(RECORDS);
    expect(singleBest(table, IN, POOL, gapValue(table))).toBe("a");
    expect(singleBest(table, IN, POOL, ratioValue(table), { strict: "q95" })).toBe("b");
  });

  it("finds the pairs where the order by B1 is the reverse of the order by B10", () => {
    const table = runTable(RECORDS);
    // On `x/s0`: a > c > shared = b by B1, and c > a > shared = b by B10. Only the pair (a, c) is reversed.
    expect(discordance(table.get("t/x/s0")!)).toEqual({ pairs: 5, reversed: 1 });
  });

  it("splits the seeds into halves, and the boards of `screen-v1` by seed", () => {
    expect(seedSplits(IN)).toEqual([
      { name: "first half to second half", train: ["t/x/s0", "t/y/s0"], test: ["t/x/s1", "t/y/s1"] },
      { name: "second half to first half", train: ["t/x/s1", "t/y/s1"], test: ["t/x/s0", "t/y/s0"] },
    ]);
    const s = screenSplits(["screen-v1/small-clustered/s0", "screen-v1/small-clustered/s2", "screen-v1/hub-chain/s0", "screen-v1/tiny-uniform/s0"]);
    expect(s[0]).toMatchObject({ train: ["screen-v1/small-clustered/s0", "screen-v1/hub-chain/s0"], test: ["screen-v1/small-clustered/s2"] });
    expect(s[1]!.test).toEqual(["screen-v1/small-clustered/s0", "screen-v1/hub-chain/s0"]);
  });

  it("gives the Pareto curve on held-out seeds, with the share of the oracle gain", () => {
    const table = runTable(RECORDS);
    const curve = paretoCurve(table, seedSplits(IN), POOL, "cap", gapValue(table), { ks: [1, 3], full: true });
    expect(curve.map((p) => p.k)).toEqual([1, 3, 4]);
    for (const p of curve) {
      expect(p.portfolio).toHaveLength(p.inputs.length);
      expect(p.sets).toHaveLength(2);
    }
    // The oracle of each test input is at least the value of the portfolio.
    for (const p of curve) p.portfolio.forEach((v, n) => expect(v).toBeLessThanOrEqual(p.oracle[n]! + 1e-12));
    expect(shareOf(0.5, 0, 1)).toBe(0.5);
    expect(shareOf(1, 1, 1)).toBeNaN();
  });

  it("gives the time of a set one after the other and in parallel, with `corners` and `shared`", () => {
    const t = (strategy: string, seed: number, ms: number, rep = 0): TimeRecord => ({ strategy, cls: "uniform", seed, nodes: 10, edges: 15, rep, ms, scoreMs: 0 });
    const times = [t("corners", 0, 1), t("shared", 0, 2), t("shared", 0, 4, 1), t("a", 0, 10), t("b", 0, 5), t("corners", 1, 1), t("shared", 1, 2), t("a", 1, 20), t("b", 1, 5)];
    const [st] = setTimes(times, ["a", "b"]);
    // Board 0: 1 + 3 + 10 + 5 = 19, the longest run 10. Board 1: 1 + 2 + 20 + 5 = 28, the longest run 20.
    expect(st!.serial.median).toBeCloseTo(23.5);
    expect(st!.parallel.median).toBeCloseTo(15);
    expect(st!.shared).toBeCloseTo(2.5);
    expect(strategyTimes(times).get("a")?.get(10)?.median).toBe(15);
  });

  it("writes the report of both corpora and of the times", () => {
    const exact = RECORDS.map((r) => ({ ...r, input: r.input.replace("t/", "exact-v1/") }));
    const screen = RECORDS.map((r) => ({ ...r, input: r.input.replace("t/x", "screen-v1/small-clustered").replace("t/y", "screen-v1/hub-chain") }));
    const times: TimeRecord[] = POOL.concat("corners").map((s) => ({ strategy: s, cls: "uniform", seed: 0, nodes: 10, edges: 15, rep: 0, ms: 1, scoreMs: 0 }));
    const report = portfolioReport(exact, screen, times);
    expect(report.markdown).toContain("## The check of the claim on `exact-v1`");
    expect(report.markdown).toContain("## `screen-v1`: the guarded B1 of the portfolio");
    expect(report.markdown).toContain("## The time of each set");
    expect(report.data["sets"]).toBeDefined();
  });
});

// A small hand-made screen of `exact-v1` with the rule of each run (PORTFOLIO-RULE).
// The baseline of `collection` is the B1 of `shared` (0.1), and the baseline of `all` is 0.05. Each cap has its own optimum.
const OPT: Record<GapRule, Record<string, number>> = { collection: { "1.1": 0.5, "1.25": 0.6, "1.5": 0.8 }, all: { "1.1": 0.7, "1.25": 0.8, "1.5": 1 } };
const BASE: Record<GapRule, number> = { collection: 0.1, all: 0.05 };
// Each run: B1, the largest stretch of the model and the flag of a shared segment with two collections.
const RUNS: Record<string, [number, number, boolean]> = {
  shared: [0.1, 1.05, false],
  a: [0.6, 1.05, true],
  c: [0.45, 1.3, false],
  d: [0.4, 1.05, false],
  e: [0.7, 1.3, true],
  f: [0.3, 1.05, false],
};
const OPTIMA: ExactOptimum[] = IN.flatMap((input) =>
  GAP_RULES.flatMap((rule) =>
    GAP_CAPS.map((cap) => ({
      input,
      hash: "h",
      class: "x",
      nodes: 10,
      edges: 15,
      rule,
      cap,
      status: "optimal",
      proven: true,
      objective: 0,
      bound: 0,
      mipGap: 0,
      seconds: 0,
      binaries: 0,
      b1: OPT[rule][String(cap)]!,
      modelB1: null,
      b3max: null,
      highways: 0,
    })),
  ),
);
/** This function makes a record of a run with the gap closed of each rule at the cap of its stretch. */
const gapRecord = (strategy: string, input: string, [b1, stretch, mixed]: [number, number, boolean]): OracleRecord => {
  const cap = gapCap(stretch);
  const m: Record<string, number> = { [B1]: b1, [B3_Q95]: 1, [MODEL_STRETCH]: stretch, [MIXED]: mixed ? 1 : 0 };
  if (cap !== undefined) {
    for (const rule of GAP_RULES) m[ruleGapName(rule)] = (b1 - BASE[rule]) / (OPT[rule][String(cap)]! - BASE[rule]);
    m[B10] = m[ruleGapName(mixed ? "all" : "collection")]!;
  }
  return rec(strategy, input, m);
};
const RULE_RECORDS: OracleRecord[] = Object.entries(RUNS).flatMap(([s, run]) => IN.map((i) => gapRecord(s, i, run)));

describe("the portfolio with the rule of the caller (PORTFOLIO-RULE)", () => {
  it("counts the reversed pairs by cause, and finds none for the same rule and the same cap", () => {
    const row = runTable(RULE_RECORDS).get("t/x/s0")!;
    // `c` and `f` tie by B10, so 14 of the 15 pairs count. `c`-`d` and `a`-`e` reverse with another cap, and `d`-`e` with another rule.
    expect(discordanceByCause(row)).toEqual({ same: { pairs: 3, reversed: 0 }, cap: { pairs: 3, reversed: 2 }, rule: { pairs: 8, reversed: 1 } });
    expect(discordance(row)).toEqual({ pairs: 14, reversed: 3 });
  });

  it("keeps only the runs that obey the rule, and gives the gap closed of the rule", () => {
    const table = runTable(RULE_RECORDS);
    const a = table.get("t/x/s0")!.get("a")!;
    expect(obeys(a, "collection")).toBe(false);
    expect(obeys(a, "all")).toBe(true);
    expect([...ruleTable(table, "collection").get("t/x/s0")!.keys()].sort()).toEqual(["c", "d", "f", "shared"]);
    expect(ruleTable(table, "all").get("t/x/s0")!.size).toBe(6);
    expect(ruleValue(table, "collection")("t/x/s0", "a")).toBeUndefined();
    expect(ruleValue(table, "collection")("t/x/s0", "d")).toBeCloseTo(0.75);
    expect(ruleValue(table, "all")("t/x/s0", "d")).toBeCloseTo(0.35 / 0.65);
    // `a` fails the rule `collection`, so it falls back to `shared`.
    expect(fallbackValue(ruleTable(table, "collection"), ruleValue(table, "collection"), "cap")("t/x/s0", "a")).toBeCloseTo(0);
  });

  it("finds the baseline of each rule from the runs, and gives the gap closed at one cap", () => {
    const table = runTable([...RULE_RECORDS, gapRecord("g", "t/x/s0", [0.9, 1.6, false])]);
    const bases = ruleBaselines(table, OPTIMA);
    expect(bases.get("t/x/s0")!.collection).toBeCloseTo(0.1);
    expect(bases.get("t/x/s0")!.all).toBeCloseTo(0.05);
    const coll = capValue(table, "collection", RULE_CAP, OPTIMA, bases);
    // At one cap, the order by the gap closed is the order by B1: `c` is now above `d`.
    expect(coll("t/x/s0", "c")).toBeCloseTo(0.5);
    expect(coll("t/x/s0", "d")).toBeCloseTo(0.3 / 0.7);
    expect(coll("t/x/s0", "a")).toBeUndefined();
    // A stretch above the cap has no value.
    expect(coll("t/x/s0", "g")).toBeUndefined();
    expect(capValue(table, "all", RULE_CAP, OPTIMA, bases)("t/x/s0", "a")).toBeCloseTo(0.55 / 0.95);
  });

  it("gives a curve for each rule and cap, and the whole pool at one cap reaches the oracle", () => {
    const table = runTable(RULE_RECORDS);
    const pool = Object.keys(RUNS).sort();
    const forms = ruleForms(table, seedSplits(IN), pool, OPTIMA, { ks: [1] });
    expect(forms.map((f) => [f.rule, f.cap])).toEqual([
      ["collection", undefined],
      ...RULE_CAPS.map((c) => ["collection", c]),
      ["all", undefined],
      ...RULE_CAPS.map((c) => ["all", c]),
    ]);
    expect(RULE_CAPS[RULE_CAPS.length - 1]).toBe(RULE_CAP);
    for (const f of forms.filter((x) => x.cap !== undefined)) {
      const whole = f.curve[f.curve.length - 1]!;
      whole.portfolio.forEach((v, n) => expect(v).toBeCloseTo(whole.oracle[n]!));
    }
    // At the cap of each run, the best B1 of the rule `collection` (`c`) does not give the best gap closed (`d`).
    const collection = forms[0]!.curve[forms[0]!.curve.length - 1]!;
    expect(collection.portfolio[0]).toBeCloseTo(0.5);
    expect(collection.oracle[0]).toBeCloseTo(0.75);
    const report = portfolioReport(RULE_RECORDS.map((r) => ({ ...r, input: r.input.replace("t/", "exact-v1/") })), [], [], OPTIMA.map((o) => ({ ...o, input: o.input.replace("t/", "exact-v1/") })));
    expect(report.markdown).toContain("## `exact-v1`: the reversed pairs by cause (PORTFOLIO-RULE)");
    expect(report.markdown).toContain("## `exact-v1`: the portfolio with the rule of the caller (PORTFOLIO-RULE)");
    expect(report.data["causes"]).toEqual({ same: { pairs: 12, reversed: 0 }, cap: { pairs: 12, reversed: 8 }, rule: { pairs: 32, reversed: 4 } });
  });

  it("chooses only among the runs at or below the cap, and gives the greedy sets of each rule and cap on all inputs (EXACT-BOUNDS)", () => {
    const table = runTable(RULE_RECORDS);
    expect([...capTable(table, 1.25).get("t/x/s0")!.keys()].sort()).toEqual(["a", "d", "f", "shared"]);
    expect(API_KS).toEqual([3, 5, 8]);
    const pool = Object.keys(RUNS).sort();
    const forms = ruleForms(table, seedSplits(IN), pool, OPTIMA, { ks: [1], apiKs: [1, 2] });
    // At the cap 1.25, `c` is above the cap and `a` mixes collections. Thus the best run of the rule `collection` is `d`, and `f` adds nothing.
    const collection = forms.find((f) => f.rule === "collection" && f.cap === 1.25)!;
    expect(collection.sets).toEqual([
      { k: 1, set: ["d"] },
      { k: 2, set: ["d"] },
    ]);
    // At the cap 1.25, `e` is above the cap. Thus the best run of the rule `all` is `a`.
    expect(forms.find((f) => f.rule === "all" && f.cap === 1.25)!.sets[0]).toEqual({ k: 1, set: ["a"] });
    expect(forms.find((f) => f.rule === "all" && f.cap === 1.5)!.sets[0]).toEqual({ k: 1, set: ["e"] });
    for (const f of forms.filter((x) => x.cap === undefined)) expect(f.sets).toEqual([]);
  });
});
