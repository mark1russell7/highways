import { describe, expect, it } from "vitest";
import { measureIsolated, type PairedReport } from "./paired.ts";
import { armVerdict, pairedTable, TAIL_NOT_MEASURED, pairedTimeTest, parseReports, roundsReport, timeText, type TimeLimits } from "./time-gate.ts";

const env = { cpu: "Test CPU", cores: 2, os: "test", arch: "x64", node: "v0" };
const LIMITS: TimeLimits = { timeRatio: 1.5, timeJobs: 5, timeTailQ: 0.95, timeTail: 2, timeFloorMs: 5 };
/** This function gives the 5 reports of the policy: the same job 5 times. */
const five = (r: () => PairedReport): PairedReport[] => Array.from({ length: 5 }, r);
// The A/A factor of each input: the second run of the base on the input takes this factor of the first run.
// The noise floor p10 to p90 is from 0.918 to 1.082, and the A/A q0.95 is 1.091. So both checks are valid.
const AA = [0.9, 0.94, 0.98, 1.02, 1.06, 1.1, 0.96, 1.04, 0.92, 1.08];
// Noisy A/A factors: the p90 is 1.51, above the limit 1.5. So the median check cannot decide.
const NOISY = [0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 0.7, 0.9, 1.3, 1.5];
const IDS = AA.map((_, i) => `in${i}`);

/**
 * This function gives the paired report of one job from a fake clock. No test reads the real time.
 * The cost gives the ms of the base, of the candidate and of the A/A arm on each input. The first run of the base on an input is the base arm, and the second run is the A/A arm.
 */
function job(cost: (arm: "base" | "cand" | "aa", i: number) => number): PairedReport {
  let t = 0;
  const calls = new Map<number, number>();
  return measureIsolated({
    arms: [
      {
        id: "base",
        run: (i: number) => {
          const k = calls.get(i) ?? 0;
          calls.set(i, k + 1);
          t += cost(k === 0 ? "base" : "aa", i);
        },
      },
      { id: "cand", run: (i: number) => (t += cost("cand", i)) },
    ],
    inputs: IDS.map((id, i) => ({ id, group: i < 5 ? "a" : "b", value: i })),
    repeats: 1,
    warmup: 0,
    mode: "process",
    clock: () => t,
    env,
  });
}

/** This function gives a job where the candidate takes `factor` times the base on each input, with the A/A factors `aa`. */
const report = (factor: number, aa: readonly number[] = AA, baseMs = 10): PairedReport => job((arm, i) => (arm === "base" ? baseMs : arm === "aa" ? baseMs * aa[i]! : baseMs * factor));

describe("pairedTimeTest", () => {
  it("passes a ratio inside the noise floor, and does not count it as a speed gain", () => {
    const t = pairedTimeTest(five(() => report(1.03)), "base", "cand", undefined, LIMITS);
    expect(t.median).toBeCloseTo(1.03);
    expect(t.checks.map((c) => [c.check, c.valid, c.verdict])).toEqual([
      ["median", true, "pass"],
      ["tail", true, "pass"],
    ]);
    expect(t.checks[0]!.aa).toBeCloseTo(1.082);
    expect(t.checks[1]!.aa).toBeCloseTo(1.091);
    // The 5 jobs have the same A/A values, so the spread of the A/A values is 0.
    expect(t.checks[0]!.aaSpread).toBeCloseTo(0);
    expect(t.status).toBe("pass");
    expect(t.faster).toBe(false);
    expect(timeText(t, 0.95)).toMatch(/: pass\.$/);
  });

  it("cannot decide when the A/A p90 plus its spread is not below the limit, and then it does not pass", () => {
    const t = pairedTimeTest(five(() => report(1.03, NOISY)), "base", "cand", undefined, LIMITS);
    const median = t.checks[0]!;
    expect(median.valid).toBe(false);
    expect(median.aa).toBeCloseTo(1.51);
    expect(median.why).toContain("A/A p90 1.510");
    expect(t.status).toBe("noise");
    expect(t.pass).toBe(false);
    expect(timeText(t, 0.95)).toContain("cannot decide (noise)");
    expect(timeText(t, 0.95)).toContain("This is not a pass.");
  });

  it("fails a ratio above the limit and outside the noise floor", () => {
    const t = pairedTimeTest(five(() => report(1.8)), "base", "cand", undefined, LIMITS);
    expect(t.median).toBeCloseTo(1.8);
    expect(t.checks[0]!.verdict).toBe("fail");
    expect(t.status).toBe("fail");
    expect(t.pass).toBe(false);
    expect(timeText(t, 0.95)).toContain(": fail. The median 1.80 is above 1.5.");
  });

  it("gives a pass and a speed gain for a ratio below 1 and below the noise floor", () => {
    const t = pairedTimeTest(five(() => report(0.5)), "base", "cand", undefined, LIMITS);
    expect(t.median).toBeCloseTo(0.5);
    expect(t.status).toBe("pass");
    expect(t.pass).toBe(true);
    expect(t.faster).toBe(true);
    expect(t.env).toEqual(env);
    expect(t.mode).toBe("process");
    expect(timeText(t, 0.95)).toContain("pass, and faster than the baseline");
  });

  it("takes the worst median and the worst tail over the jobs, so each job must pass", () => {
    const steady = pairedTimeTest([0.5, 0.52, 0.53, 0.5, 0.54].map((f) => report(f)), "base", "cand", undefined, LIMITS);
    expect(steady.jobs).toBe(5);
    expect(steady.median).toBeCloseTo(0.54);
    // The record keeps the median and the tail of each job, and the CPU model of each job.
    expect(steady.medians.map((m) => Number(m.toFixed(2)))).toEqual([0.5, 0.52, 0.53, 0.5, 0.54]);
    expect(steady.tails.map((m) => Number(m!.toFixed(2)))).toEqual([0.5, 0.52, 0.53, 0.5, 0.54]);
    expect(steady.cpus).toEqual(Array(5).fill("Test CPU"));
    expect(steady.status).toBe("pass");
    expect(timeText(steady, 0.95)).toContain("over 5 jobs of 5 and 10 inputs");
    // A candidate that passes in 4 jobs and not in the fifth fails. No tolerance on the spread of the jobs is necessary.
    const one = pairedTimeTest([0.5, 0.5, 0.5, 0.5, 1.8].map((f) => report(f)), "base", "cand", undefined, LIMITS);
    expect(one.median).toBeCloseTo(1.8);
    expect(one.checks[0]!.verdict).toBe("fail");
    expect(one.status).toBe("fail");
  });

  it("does not count a job whose A/A band does not contain 1, so the test cannot decide with 4 jobs of 5", () => {
    // In the fifth job the second run of the base is faster on each input: the A/A band is 0.66 to 0.79, so that job measured the runner.
    const slow = AA.map((x) => x * 0.73);
    const t = pairedTimeTest([AA, AA, AA, AA, slow].map((aa) => report(1.03, aa)), "base", "cand", undefined, LIMITS);
    expect(t.jobs).toBe(4);
    expect(t.outside).toBe(1);
    expect(t.checks[0]!.why).toBe("4 jobs of 5, 1 with an A/A band that does not contain 1");
    expect(t.status).toBe("noise");
    const none = pairedTimeTest(five(() => report(1.03, slow)), "base", "cand", undefined, LIMITS);
    expect(none.status).toBe("void");
    expect(none.reason).toContain("does not contain 1");
  });

  it("adds the spread of the A/A values of the jobs to the worst A/A value, with no margin factor", () => {
    // 4 jobs have the A/A band 0.918 to 1.082. One job has a band 3.7 times as wide around 1, from 0.697 to 1.303. It contains 1, so the job counts.
    // The worst A/A p90 1.303 is below the limit 1.5, but 1.303 plus the spread 0.221 is above it. So the median check cannot decide.
    const wide = AA.map((x) => 1 + (x - 1) * 3.7);
    const t = pairedTimeTest([AA, AA, AA, AA, wide].map((aa) => report(1.03, aa)), "base", "cand", undefined, LIMITS);
    const median = t.checks[0]!;
    expect(median.aa).toBeCloseTo(1.303);
    expect(median.aaSpread).toBeCloseTo(0.221);
    expect(median.valid).toBe(false);
    expect(median.why).toContain("plus its spread 0.221");
    expect(t.status).toBe("noise");
  });

  it("fails a tail above its limit when the median passes", () => {
    // The candidate takes 50 ms on the input in9 only, so its ratio is 5. The q0.95 of the ratios is 2.975, above 2.
    const t = pairedTimeTest(five(() => job((arm, i) => (arm === "cand" ? (i === 9 ? 50 : 5) : 10))), "base", "cand", undefined, LIMITS);
    expect(t.checks.map((c) => c.verdict)).toEqual(["pass", "fail"]);
    expect(t.tail).toBeCloseTo(2.975);
    expect(t.status).toBe("fail");
  });

  it("keeps an input with both medians below the time floor in the median, and not in the tail", () => {
    // On in0, the base takes 1 ms and the candidate 4 ms: the ratio is 4, with both medians below 5 ms. Each other input has the ratio 1.
    const t = pairedTimeTest(five(() => job((arm, i) => (i === 0 ? (arm === "cand" ? 4 : 1) : 10))), "base", "cand", undefined, LIMITS);
    expect(t.inputs).toBe(10);
    expect(t.median).toBeCloseTo(1);
    // With in0 in the tail set, the q0.95 is 2.65. Without it, the tail is 1.
    expect(t.tail).toBeCloseTo(1);
    expect(t.status).toBe("pass");
    // An input below the floor is in the median.
    expect(pairedTimeTest(five(() => job((arm) => (arm === "cand" ? 4 : 1))), "base", "cand", undefined, LIMITS).checks.map((c) => c.verdict)).toEqual(["fail", "not measured"]);
  });

  it("does not measure the tail with an empty tail set in each job, and cannot decide with an empty tail set in only some jobs", () => {
    const small = job((arm) => (arm === "cand" ? 1.2 : 1));
    const none = pairedTimeTest(five(() => small), "base", "cand", undefined, LIMITS);
    expect(none.tails).toEqual(Array(5).fill(null));
    // This tail is not a pass, but it does not stop a promotion.
    expect(none.checks[1]!.verdict).toBe("not measured");
    expect(none.note).toBe(TAIL_NOT_MEASURED);
    expect(TAIL_NOT_MEASURED).toBe("tail: not measured, no input above timeFloorMs");
    expect(none.pass).toBe(true);
    expect(timeText(none, 0.95)).toContain("`tail: not measured, no input above timeFloorMs`");
    const some = pairedTimeTest([small, small, small, small, report(1.2)], "base", "cand", undefined, LIMITS);
    expect(some.checks[1]!.valid).toBe(false);
    expect(some.checks[1]!.why).toBe("4 of 5 jobs have an empty tail set");
    expect(some.status).toBe("noise");
  });

  it("cannot decide with fewer jobs than the policy, and decides with 5 jobs", () => {
    // 1 job of a candidate that is faster: each check cannot decide, so the test does not pass.
    const one = pairedTimeTest([report(0.5)], "base", "cand", undefined, LIMITS);
    expect(one.jobs).toBe(1);
    expect(one.policy).toBe(5);
    expect(one.checks.map((c) => [c.check, c.valid, c.why, c.verdict])).toEqual([
      ["median", false, "1 job of 5", "noise"],
      ["tail", false, "1 job of 5", "noise"],
    ]);
    expect(one.status).toBe("noise");
    expect(one.pass).toBe(false);
    expect(one.faster).toBe(false);
    expect(timeText(one, 0.95)).toContain(": cannot decide (1 job of 5). This is not a pass, and it does not promote.");
    // 1 job of a slow candidate also cannot decide: too few jobs do not give a fail.
    expect(pairedTimeTest([report(1.8)], "base", "cand", undefined, LIMITS).status).toBe("noise");
    expect(timeText(pairedTimeTest([report(0.5), report(0.5)], "base", "cand", undefined, LIMITS), 0.95)).toContain("cannot decide (2 jobs of 5)");
    // 5 jobs decide.
    const all = pairedTimeTest(five(() => report(0.5)), "base", "cand", undefined, LIMITS);
    expect(all.jobs).toBe(5);
    expect(all.checks.map((c) => c.verdict)).toEqual(["pass", "pass"]);
    expect(all.pass).toBe(true);
  });

  it("reads only the inputs of the keys", () => {
    expect(pairedTimeTest([report(0.5)], "base", "cand", new Set(["in0", "in1", "nothere"]), LIMITS).inputs).toBe(2);
  });

  it("gives void and fails with no report of mode process of the pair", () => {
    const none = pairedTimeTest([], "base", "cand", undefined, LIMITS);
    expect(none.status).toBe("void");
    expect(none.pass).toBe(false);
    expect(timeText(none, 0.95)).toContain("so the time test fails");
    expect(pairedTimeTest([report(0.5)], "base", "other", undefined, LIMITS).status).toBe("void");
    expect(pairedTimeTest([report(0.5)], "base", "cand", new Set(["nothere"]), LIMITS).status).toBe("void");
    const fresh = { ...report(0.5), mode: "fresh" as const };
    expect(pairedTimeTest([fresh], "base", "cand", undefined, LIMITS).status).toBe("void");
  });
});

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
