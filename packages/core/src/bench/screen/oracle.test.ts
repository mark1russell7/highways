import { describe, expect, it } from "vitest";
import {
  B1,
  B3_Q95,
  bestSingle,
  crossFit,
  gainShare,
  guardedB1,
  halfFolds,
  ideasOf,
  measureRows,
  oracle,
  oracleReport,
  pairedBootstrap,
  pooledShare,
  valueTable,
  winnerCounts,
  type OracleRecord,
} from "../../../scripts/oracle.ts";

/** This function makes a record of the strategy `strategy` on the input `input`, with the measures `measures`. */
const rec = (strategy: string, input: string, measures: Record<string, number>, hard: Record<string, number> = {}): OracleRecord => ({
  strategy,
  input,
  seed: Number(input.split("/s").pop()),
  measures,
  hard,
});

// A small hand-made screen: 2 boards of 2 seeds, a baseline and 3 strategies.
// `a` saves much ink on the board `x` but stretches more on `x/s1`. `b` is good on the board `y`. `c` is a little better than `shared` everywhere.
const IN = ["t/x/s0", "t/x/s1", "t/y/s0", "t/y/s1"];
const B1S: Record<string, number[]> = { shared: [0.1, 0.1, 0.2, 0.2], a: [0.3, 0.4, 0.2, 0.25], b: [0.1, 0.1, 0.5, 0.4], c: [0.12, 0.12, 0.24, 0.24] };
const Q95: Record<string, number[]> = { shared: [1.1, 1.1, 1.2, 1.2], a: [1.1, 1.3, 1.2, 1.2], b: [1.1, 1.1, 1.2005, 1.2], c: [1.1, 1.1, 1.2, 1.2] };
const RECORDS: OracleRecord[] = Object.keys(B1S).flatMap((s) => IN.map((i, k) => rec(s, i, { [B1]: B1S[s]![k]!, [B3_Q95]: Q95[s]![k]! })));

describe("the oracle bound (ORACLE)", () => {
  it("gives the best value of each input, with each tie within RECORD_EPS", () => {
    const table = valueTable(RECORDS, (r) => r.measures[B1]);
    const cells = oracle(table, "higher");
    expect(cells.get("t/x/s0")).toEqual({ value: 0.3, winners: ["a"] });
    expect(cells.get("t/y/s0")?.winners).toEqual(["b"]);
    expect(oracle(table, "lower").get("t/x/s0")).toEqual({ value: 0.1, winners: ["b", "shared"] });
    // A strategy that `keep` refuses is never a winner.
    expect(oracle(table, "higher", (s) => s !== "a").get("t/x/s1")).toEqual({ value: 0.12, winners: ["c"] });
  });

  it("gives the best single strategy by its median, with a share of inputs with a value", () => {
    const table = valueTable(RECORDS, (r) => r.measures[B1]);
    expect(bestSingle(table, "higher")).toMatchObject({ strategy: "a", values: 4 });
    expect(bestSingle(table, "higher")?.median).toBeCloseTo(0.275);
    expect(bestSingle(table, "higher", { inputs: ["t/y/s0", "t/y/s1"] })?.strategy).toBe("b");
    expect(bestSingle(table, "higher", { keep: (s) => s === "c" || s === "shared" })?.strategy).toBe("c");
    // A strategy with a value on fewer than half of the inputs is not a candidate.
    const sparse = valueTable([...RECORDS, rec("d", "t/x/s0", { [B1]: 0.9 })], (r) => r.measures[B1]);
    expect(bestSingle(sparse, "higher")?.strategy).toBe("a");
  });

  it("gives a paired bootstrap of two medians and of their difference", () => {
    const a = [1, 2, 3, 4, 5];
    const same = pairedBootstrap(a, a, { runs: 200 });
    expect(same.diff).toEqual({ median: 0, lo: 0, hi: 0 });
    const shifted = pairedBootstrap(
      a.map((v) => v + 1),
      a,
      { runs: 200 },
    );
    expect(shifted.diff).toEqual({ median: 1, lo: 1, hi: 1 });
    expect(shifted.a.median).toBe(4);
    expect(shifted.a.lo).toBeLessThanOrEqual(4);
    expect(shifted.a.hi).toBeGreaterThanOrEqual(4);
    expect(() => pairedBootstrap([1], [1, 2])).toThrow();
  });

  it("guards B1 with the B3 q95 of `shared`, with the tie rule of RECORD_EPS and a fall back to `shared`", () => {
    const g = guardedB1(RECORDS);
    // `a` stretches more than `shared` on `x/s1`, so it falls back to the ratio 1 there.
    expect(g.pass.get("t/x/s1")?.has("a")).toBe(false);
    expect(g.ratio.get("t/x/s1")?.get("a")).toBe(1);
    expect(g.ratio.get("t/x/s0")?.get("a")).toBeCloseTo(3);
    // `b` is 0.0005 above `shared` on `y/s0`: a tie, so it passes.
    expect(g.pass.get("t/y/s0")?.has("b")).toBe(true);
    expect(g.ratio.get("t/y/s0")?.get("b")).toBeCloseTo(2.5);
    // With the hard rules, a run with more breaks than `shared` falls back too.
    const hard = guardedB1([...RECORDS.filter((r) => r.strategy !== "c"), rec("c", "t/x/s0", { [B1]: 0.2, [B3_Q95]: 1 }, { complete: 1 })], { hard: true });
    expect(hard.pass.get("t/x/s0")?.has("c")).toBe(false);
    expect(guardedB1([...RECORDS, rec("shared", "t/z/s0", { [B1]: 0, [B3_Q95]: 1 })]).ratio.has("t/z/s0")).toBe(false);
  });

  it("tests a realistic selector on half of the seeds, and gives its share of the oracle gain", () => {
    const g = guardedB1(RECORDS);
    const cells = oracle(g.ratio, "higher", (s, i) => g.pass.get(i)?.has(s) ?? false);
    const folds = halfFolds(IN, (i) => Number(i.split("/s").pop()));
    expect(folds.map((f) => f.groups.map((x) => [x.group, x.train, x.test]))).toEqual([
      [
        ["x", ["t/x/s0"], ["t/x/s1"]],
        ["y", ["t/y/s0"], ["t/y/s1"]],
      ],
      [
        ["x", ["t/x/s1"], ["t/x/s0"]],
        ["y", ["t/y/s1"], ["t/y/s0"]],
      ],
    ]);
    const fits = crossFit(g.ratio, "higher", folds, "c", cells);
    // The first split chooses `a` on `x/s0`, and `a` falls back to 1 on `x/s1`. It chooses `b` on `y`.
    expect(fits[0]!.choices).toEqual({ x: "a", y: "b" });
    expect(fits[0]!.values.selector).toEqual([1, 2]);
    expect(fits[1]!.choices).toEqual({ x: "c", y: "b" });
    const pooled = pooledShare(fits);
    expect(pooled.inputs).toBe(4);
    expect(pooled.share).toBeCloseTo(gainShare(pooled.selector, pooled.single, pooled.oracle));
    expect(gainShare(1, 1, 1)).toBeNaN();
    expect(gainShare(1.5, 1, 2)).toBeCloseTo(0.5);
  });

  it("counts the wins of each strategy, and the sole wins", () => {
    const table = valueTable(RECORDS, (r) => r.measures[B1]);
    const wins = winnerCounts(oracle(table, "higher"));
    expect(wins.map((w) => [w.strategy, w.wins, w.sole])).toEqual([
      ["a", 2, 2],
      ["b", 2, 2],
    ]);
  });

  it("gives a row for each measure of the records, with the better side of the measure", () => {
    const rows = measureRows(RECORDS);
    const b1 = rows.find((r) => r.id === "B1")!;
    expect(b1).toMatchObject({ better: "higher", single: "a" });
    expect(b1.oracleMedian).toBeCloseTo(0.4);
    const q95 = rows.find((r) => r.measure === B3_Q95)!;
    expect(q95.better).toBe("lower");
    expect(q95.oracleMedian).toBeCloseTo(1.15);
  });

  it("names the ideas of a strategy, and no idea for a baseline", () => {
    const ideas = [{ id: "HWY-999", stage: "screened", result: { verdict: "dropped", records: ["screen-v1/*/made-up@abc1234"] } }];
    expect(ideasOf("w9z:made-up", ideas)).toEqual(["HWY-999 dropped"]);
    expect(ideasOf("hw:shared-ways", ideas)).toBeUndefined();
    expect(ideasOf("other", ideas)).toEqual([]);
  });

  it("writes the tables of the screen set", () => {
    const screen = RECORDS.map((r) => ({ ...r, input: r.input.replace("t/x", "screen-v1/small-clustered").replace("t/y", "screen-v1/dense-groups") }));
    const report = oracleReport([], screen);
    expect(report.markdown).toContain("## `screen-v1`: B1 under the guard");
    expect(report.markdown).toContain("The realistic selector on `screen-v1`");
    expect(report.markdown).toContain("each measure without a guard");
  });
});
