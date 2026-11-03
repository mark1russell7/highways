import { describe, expect, it } from "vitest";
import { aaId, pairedReport, type Mode, type PairedReport, type RawTimes } from "./paired.ts";
import { armVerdict, pairedTable, parseReports, roundsReport, roundsTable } from "./time-gate.ts";

const env = { cpu: "Test CPU", cores: 2, os: "test", arch: "x64", node: "v0" };
// The A/A factor of each input: the second run of the base on the input takes this factor of the first run.
// The noise floor p10 to p90 is from 0.918 to 1.082.
const AA = [0.9, 0.94, 0.98, 1.02, 1.06, 1.1, 0.96, 1.04, 0.92, 1.08];
const IDS = AA.map((_, i) => `in${i}`);

/**
 * This function gives the paired report of one job from made-up times, with 1 round. No test reads the real time.
 * The cost gives the ms of the base, of the candidate and of the A/A arm on each input. The mode is `fresh`, the mode of the time test (BENCH-FRESH-CASES).
 */
function job(cost: (arm: "base" | "cand" | "aa", i: number) => number, mode: Mode = "fresh"): PairedReport {
  const arms = [{ id: "base" }, { id: "cand" }, { id: aaId("base") }];
  const raw: RawTimes = {
    ms: new Map(IDS.map((id, i) => [id, new Map([["base", [cost("base", i)]], ["cand", [cost("cand", i)]], [aaId("base"), [cost("aa", i)]]])])),
    peak: new Map(IDS.map((id) => [id, new Map<string, number>()])),
  };
  return pairedReport(mode, env, undefined, arms, IDS.map((id, i) => ({ id, group: i < 5 ? "a" : "b" })), raw);
}

/** This function gives a job where the candidate takes `factor` times the base on each input, with the A/A factors `aa`. */
const report = (factor: number, aa: readonly number[] = AA, baseMs = 10, mode: Mode = "fresh"): PairedReport =>
  job((arm, i) => (arm === "base" ? baseMs : arm === "aa" ? baseMs * aa[i]! : baseMs * factor), mode);

describe("the tables and the files of the reports", () => {
  it("gives the verdict of each arm against the noise floor", () => {
    const fast = report(0.5);
    expect(armVerdict(fast.ratios["cand"]!, fast.noiseFloor)).toBe("faster");
    expect(armVerdict(report(1.8).ratios["cand"]!, fast.noiseFloor)).toBe("slower");
    expect(armVerdict(report(1.0).ratios["cand"]!, fast.noiseFloor)).toBe("inside the noise floor");
    expect(armVerdict(fast.ratios["cand"]!, null)).toBe("no noise floor");
    const table = pairedTable(fast);
    expect(table[0]).toContain("2 x Test CPU");
    expect(table.filter((l) => l.startsWith("| `"))).toEqual([expect.stringContaining("| `cand` | 10 |")]);
    expect(table.at(-1)).toContain("| faster |");
  });

  it("gives the verdict of one fixture from the band of its A/A rounds, not from one median ratio", () => {
    // One fixture and 5 rounds, as the Profile run 41505173044: the A/A median ratio is 0.81, and the arm "new" takes 1.167 times the base.
    // The A/A ratios of the rounds are 0.7, 0.8, 0.81, 0.85, 1.2. Their spread is p90 of |r - 1|: 0.26. So the band is 0.74 to 1.26.
    const arms = [{ id: "base" }, { id: "new" }, { id: "slow" }, { id: aaId("base") }];
    const raw: RawTimes = {
      ms: new Map([["large", new Map([["base", [100, 100, 100, 100, 100]], ["new", [116.7, 116.7, 116.7, 116.7, 116.7]], ["slow", [140, 140, 140, 140, 140]], [aaId("base"), [70, 80, 81, 85, 120]]])]]),
      peak: new Map([["large", new Map<string, number>()]]),
    };
    const one = pairedReport("fresh", env, undefined, arms, [{ id: "large" }], raw);
    // The band of the median ratios is one ratio: 0.81 to 0.81. So the old table reads 1.167 as slower.
    expect(armVerdict(one.ratios["new"]!, one.noiseFloor)).toBe("slower");
    const table = roundsTable(one);
    const rows = table.filter((l) => l.startsWith("| `"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe("| `new` | large | 1.167 | 5 | 0.740 to 1.260 | inside |");
    expect(rows[1]).toBe("| `slow` | large | 1.400 | 5 | 0.740 to 1.260 | slower |");
    expect(table[0]).toContain("2 x Test CPU");
  });

  it("reads one report, a list of reports, or one report on each line", () => {
    const a = report(0.5);
    const b = report(1.8);
    expect(parseReports(JSON.stringify(a))).toHaveLength(1);
    expect(parseReports(JSON.stringify([a, b]))).toHaveLength(2);
    expect(parseReports(`${JSON.stringify(a)}\n${JSON.stringify(b)}\n`)).toHaveLength(2);
    expect(parseReports("  ")).toEqual([]);
    expect(() => parseReports(JSON.stringify({ schema: "other" }))).toThrow(/paired-time\/1/);
  });
});

describe("roundsReport", () => {
  interface Row {
    readonly strategy: string;
    readonly ms: number;
  }
  const round = (ms: Readonly<Record<string, readonly number[]>>): Row[] => Object.entries(ms).flatMap(([strategy, list]) => list.map((m) => ({ strategy, ms: m })));

  it("takes the median of the records of a key in each round, and the A/A arm by its id", () => {
    const r = roundsReport(
      [
        { id: "base", rounds: [round({ x: [10, 12, 14], y: [20] }), round({ x: [10], y: [22] })] },
        { id: "head", rounds: [round({ x: [5], y: [40] }), round({ x: [7], y: [40] })] },
        { id: "base~aa", rounds: [round({ x: [11], y: [21] }), round({ x: [11], y: [21] })] },
      ],
      (row) => row.strategy,
      (row) => row.ms,
      env,
      "test",
    );
    expect(r.mode).toBe("fresh");
    expect(r.context).toBe("test");
    expect(r.inputs.map((i) => i.id)).toEqual(["x", "y"]);
    expect(r.inputs[0]!.ms["base"]).toEqual([12, 10]);
    expect(r.inputs[0]!.median["base"]).toBe(11);
    expect(r.inputs[0]!.ratio["head"]).toBeCloseTo(6 / 11);
    expect(r.inputs[1]!.ratio["head"]).toBeCloseTo(40 / 21);
    expect(r.noiseFloor).not.toBeNull();
    expect(r.arms).toEqual(["base", "head", "base~aa"]);
  });

  it("refuses one arm, and a base with no records", () => {
    expect(() => roundsReport([{ id: "base", rounds: [round({ x: [1] })] }], (row) => row.strategy, (row) => row.ms, env)).toThrow(RangeError);
    expect(() =>
      roundsReport(
        [
          { id: "base", rounds: [[]] },
          { id: "head", rounds: [round({ x: [1] })] },
        ],
        (row: Row) => row.strategy,
        (row) => row.ms,
        env,
      ),
    ).toThrow(/no records/);
  });
});
