import { describe, expect, it } from "vitest";
import { aaId, pairedReport, type Mode, type PairedReport, type RawTimes } from "./paired.ts";
import { jobRecords, promotionTimeTest, TAIL_NOT_MEASURED, timeText, type WinTimeParams } from "./win-time.ts";

const env = { cpu: "Test CPU", cores: 2, os: "test", arch: "x64", node: "v0" };
// The settings of promotion.ts: the margin of the home, the noise cap of the sections gate and the tail of highways.
const P: WinTimeParams = { timeMargin: 0.05, noiseCap: 0.06, timeJobs: 5, timeFloorMs: 5, timeTail: 2, timeTailQ: 0.95, timeTailLevel: 0.95 };
const ARMS = [{ id: "base" }, { id: "cand" }, { id: aaId("base") }];

/** This function gives the 5 reports of the policy: the same job 5 times. */
const five = (r: () => PairedReport): PairedReport[] => Array.from({ length: 5 }, r);

// The fixtures of the old rule (MEASURE-ISOLATE): 1 round in each job, 10 inputs, and an A/A factor for each input.
// The A/A spread of these factors is 0.096 on a log scale, above the noise cap 0.06. Thus the home cannot decide on each of them.
const AA = [0.9, 0.94, 0.98, 1.02, 1.06, 1.1, 0.96, 1.04, 0.92, 1.08];
const NOISY = [0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 0.7, 0.9, 1.3, 1.5];
const IDS = AA.map((_, i) => `in${i}`);

/** This function gives the paired report of one job of the old fixtures from made-up times, with 1 round and the order `rotate`. */
function job(cost: (arm: "base" | "cand" | "aa", i: number) => number, mode: Mode = "fresh"): PairedReport {
  const raw: RawTimes = {
    ms: new Map(IDS.map((id, i) => [id, new Map([["base", [cost("base", i)]], ["cand", [cost("cand", i)]], [aaId("base"), [cost("aa", i)]]])])),
    peak: new Map(IDS.map((id) => [id, new Map<string, number>()])),
  };
  return pairedReport(mode, env, undefined, ARMS, IDS.map((id, i) => ({ id, group: i < 5 ? "a" : "b" })), raw);
}

/** This function gives a job where the candidate takes `factor` times the base on each input, with the A/A factors `aa`. */
const report = (factor: number, aa: readonly number[] = AA, baseMs = 10, mode: Mode = "fresh"): PairedReport =>
  job((arm, i) => (arm === "base" ? baseMs : arm === "aa" ? baseMs * aa[i]! : baseMs * factor), mode);

// The new fixtures: 5 jobs of 3 rounds with the order `turn` and the round offset of each job, as the workflow `Screen` makes them.
const ROUNDS = 3;
const INPUTS = Array.from({ length: 20 }, (_, i) => `case${i}`);

/** This function gives a small made-up jitter of one arm on one input in one global round, from 0.99 to 1.01. */
const jitter = (salt: number, i: number, g: number): number => 1 + 0.01 * Math.sin(1.7 * i + 2.3 * g + salt);

/** This function gives the report of the job `j` from 0. The cost gives the ms of an arm on the input `i` in the global round `g`. */
function turnJob(j: number, cost: (arm: "base" | "cand" | "aa", i: number, g: number) => number): PairedReport {
  const times = (arm: "base" | "cand" | "aa", i: number): number[] => Array.from({ length: ROUNDS }, (_, k) => cost(arm, i, j * ROUNDS + k));
  const raw: RawTimes = {
    ms: new Map(INPUTS.map((id, i) => [id, new Map([["base", times("base", i)], ["cand", times("cand", i)], [aaId("base"), times("aa", i)]])])),
    peak: new Map(INPUTS.map((id) => [id, new Map<string, number>()])),
  };
  return pairedReport("fresh", env, "ci", ARMS, INPUTS.map((id) => ({ id })), raw, { job: String(j + 1), roundOffset: j * ROUNDS, order: "turn" });
}

/** This function gives 5 jobs where the candidate takes `factor(i, j)` times the base, with a quiet A/A arm. */
const quiet = (factor: (i: number, j: number) => number, baseMs = 10): PairedReport[] =>
  Array.from({ length: 5 }, (_, j) =>
    turnJob(j, (arm, i, g) => baseMs * (arm === "base" ? jitter(0, i, g) : arm === "aa" ? jitter(1, i, g) : factor(i, j) * jitter(2, i, g))),
  );

describe("promotionTimeTest: the cases of the block win-test of rigor", () => {
  it("gives same for a sure gain inside the margin, and the test passes with no speed gain", () => {
    const t = promotionTimeTest(quiet(() => 0.97), "base", "cand", undefined, P);
    expect(t.outcome).toBe("same");
    // The whole interval is below 1, but it is in [exp(-0.05), exp(0.05)]. The margin comes first.
    expect(t.interval!.high).toBeLessThan(1);
    expect(t.interval!.low).toBeGreaterThan(Math.exp(-P.timeMargin));
    expect(t.status).toBe("pass");
    expect(t.faster).toBe(false);
    // The order turn and the round offsets keep each case turned, so the balance removes no record.
    expect(t.trimmed).toBe(0);
    expect(t.jobVerdicts.map((j) => j.job)).toEqual(["1", "2", "3", "4", "5"]);
    expect(t.tail!.status).toBe("pass");
    expect(t.inputs).toBe(20);
  });

  it("gives faster out of the margin, and the test passes with a speed gain", () => {
    const t = promotionTimeTest(quiet(() => 0.8), "base", "cand", undefined, P);
    expect(t.outcome).toBe("faster");
    expect(t.status).toBe("pass");
    expect(t.faster).toBe(true);
    expect(timeText(t)[0]).toContain("pass, and faster than the baseline");
  });

  it("cannot decide on a noisy run, because the A/A spread is above the noise cap", () => {
    const noisy = Array.from({ length: 5 }, (_, j) => turnJob(j, (arm, i, g) => 10 * (arm === "base" ? 1 : arm === "aa" ? NOISY[i % NOISY.length]! : 0.8) * jitter(arm === "base" ? 0 : 2, i, g)));
    const t = promotionTimeTest(noisy, "base", "cand", undefined, P);
    expect(t.outcome).toBe("cannot decide");
    expect(t.spread!).toBeGreaterThan(P.noiseCap);
    expect(t.reason).toContain("above the noise cap 0.06");
    expect(t.status).toBe("cannot decide");
    expect(t.pass).toBe(false);
    expect(timeText(t)[0]).toContain("This is not a pass.");
  });

  it("cannot decide when one job alone gives the opposite direction (the guard of the jobs)", () => {
    // The jobs 1 to 4 see the candidate at 0.8 times the base. The job 5 sees it at 1.3 times the base.
    const t = promotionTimeTest(quiet((_, j) => (j === 4 ? 1.3 : 0.8)), "base", "cand", undefined, P);
    expect(t.jobVerdicts.map((j) => j.outcome)).toEqual(["faster", "faster", "faster", "faster", "slower"]);
    expect(t.opposed).toEqual(["5"]);
    expect(t.outcome).toBe("cannot decide");
    expect(t.status).toBe("cannot decide");
    expect(timeText(t)[3]).toContain("The opposed jobs: 5.");
  });

  it("fails a time tail with too many cases beyond timeTail, while the pooled outcome is same", () => {
    // The cases 0 and 1 take 3 times the base. The share 0.05 of 20 cases permits 1 case that is not within 2.
    const t = promotionTimeTest(quiet((i) => (i < 2 ? 3 : 1)), "base", "cand", undefined, P);
    expect(t.outcome).toBe("same");
    expect(t.tail!.beyond).toBe(2);
    expect(t.tail!.status).toBe("fail");
    expect(t.status).toBe("fail");
    // One case beyond the limit is in the share, so the tail passes.
    const one = promotionTimeTest(quiet((i) => (i < 1 ? 3 : 1)), "base", "cand", undefined, P);
    expect(one.tail!.beyond).toBe(1);
    expect(one.tail!.status).toBe("pass");
    expect(one.status).toBe("pass");
  });

  it("gives the merged rounds of all jobs, with the global round and the first arm of the order turn", () => {
    const jobs = jobRecords(quiet(() => 1), "cand", new Set(["case0"]));
    expect(jobs.map((j) => j.job)).toEqual(["1", "2", "3", "4", "5"]);
    const rounds = jobs.flatMap((j) => j.candidate.map((r) => [r.round, r.first]));
    expect(rounds).toEqual(Array.from({ length: 15 }, (_, g) => [g, g % 2 === 0 ? "a" : "b"]));
    expect(jobs.flatMap((j) => j.aa.map((r) => r.first))).toEqual(Array.from({ length: 15 }, (_, g) => (g % 2 === 0 ? "a" : "b")));
  });
});

// The old fixtures with the verdict of the home. Each changed verdict tells the reason of the home.
describe("promotionTimeTest: the fixtures of the old rule", () => {
  it("a ratio 1.03 with the A/A factors: the old rule passed, and the home cannot decide (noise cap)", () => {
    const t = promotionTimeTest(five(() => report(1.03)), "base", "cand", undefined, P);
    expect(t.spread!).toBeCloseTo(0.0963, 3);
    expect(t.status).toBe("cannot decide");
    expect(t.reason).toContain("above the noise cap 0.06");
  });

  it("the noisy A/A factors: the old rule could not decide, and the home cannot decide", () => {
    expect(promotionTimeTest(five(() => report(1.03, NOISY)), "base", "cand", undefined, P).status).toBe("cannot decide");
  });

  it("a ratio 1.8 and a ratio 0.5: the old rule failed and passed, and the home cannot decide (noise cap)", () => {
    const slow = promotionTimeTest(five(() => report(1.8)), "base", "cand", undefined, P);
    expect(slow.status).toBe("cannot decide");
    expect(slow.reason).toContain('Without the cap, the outcome is "slower"');
    const fast = promotionTimeTest(five(() => report(0.5)), "base", "cand", undefined, P);
    expect(fast.status).toBe("cannot decide");
    expect(fast.reason).toContain('Without the cap, the outcome is "faster"');
    expect(fast.env).toEqual(env);
    expect(fast.mode).toBe("fresh");
  });

  it("the jobs 0.5 to 0.54, and four jobs of 0.5 with one of 1.8: the old rule passed and failed, and the home cannot decide (noise cap)", () => {
    const steady = promotionTimeTest([0.5, 0.52, 0.53, 0.5, 0.54].map((f) => report(f)), "base", "cand", undefined, P);
    expect(steady.status).toBe("cannot decide");
    expect(steady.jobVerdicts.map((j) => j.cpu)).toEqual(Array(5).fill("Test CPU"));
    expect(promotionTimeTest([0.5, 0.5, 0.5, 0.5, 1.8].map((f) => report(f)), "base", "cand", undefined, P).status).toBe("cannot decide");
  });

  it("a job with a biased A/A arm, and a job with a wide A/A arm: the old rule could not decide, and the home cannot decide", () => {
    const slow = AA.map((x) => x * 0.73);
    expect(promotionTimeTest([AA, AA, AA, AA, slow].map((aa) => report(1.03, aa)), "base", "cand", undefined, P).status).toBe("cannot decide");
    // The old rule gave void, because no job counted. The home sees the A/A spread above the cap.
    expect(promotionTimeTest(five(() => report(1.03, slow)), "base", "cand", undefined, P).status).toBe("cannot decide");
    const wide = AA.map((x) => 1 + (x - 1) * 3.7);
    expect(promotionTimeTest([AA, AA, AA, AA, wide].map((aa) => report(1.03, aa)), "base", "cand", undefined, P).status).toBe("cannot decide");
  });

  it("a tail of one case at 5 times the base: the old rule failed the tail, and the home fails it", () => {
    const t = promotionTimeTest(five(() => job((arm, i) => (arm === "cand" ? (i === 9 ? 50 : 5) : 10))), "base", "cand", undefined, P);
    expect(t.outcome).toBe("faster");
    expect(t.tail!.status).toBe("fail");
    expect(t.status).toBe("fail");
  });

  it("keeps an input with both medians below the time floor in the pooled verdict, and not in the tail", () => {
    const t = promotionTimeTest(five(() => job((arm, i) => (i === 0 ? (arm === "cand" ? 4 : 1) : 10))), "base", "cand", undefined, P);
    expect(t.inputs).toBe(10);
    expect(t.tail!.cases.map((c) => c.case)).not.toContain("in0");
    expect(t.outcome).toBe("same");
    expect(t.status).toBe("pass");
    // Each input below the floor: the old rule failed the median, and the home gives slower with no tail.
    const small = promotionTimeTest(five(() => job((arm) => (arm === "cand" ? 4 : 1))), "base", "cand", undefined, P);
    expect([small.outcome, small.tail!.status, small.status]).toEqual(["slower", "not measured", "fail"]);
  });

  it("does not measure an empty tail set, and the line of the record tells it", () => {
    const small = job((arm) => (arm === "cand" ? 1.2 : 1));
    const none = promotionTimeTest(five(() => small), "base", "cand", undefined, P);
    expect(none.note).toBe(TAIL_NOT_MEASURED);
    expect(TAIL_NOT_MEASURED).toBe("tail: not measured, no input above timeFloorMs");
    expect(timeText(none).join("\n")).toContain("`tail: not measured, no input above timeFloorMs`");
    // The old rule passed this run. The home sees the candidate 1.2 times the base with no A/A noise, so it gives slower.
    expect(none.outcome).toBe("slower");
    expect(none.status).toBe("fail");
  });

  it("cannot decide with fewer jobs than the policy, also for a slow candidate", () => {
    const one = promotionTimeTest([report(0.5)], "base", "cand", undefined, P);
    expect([one.jobs, one.policy, one.status, one.pass, one.faster]).toEqual([1, 5, "cannot decide", false, false]);
    expect(one.reason).toBe("1 job of 5");
    expect(timeText(one)[0]).toContain("This is not a pass, and it does not promote.");
    expect(promotionTimeTest([report(1.8)], "base", "cand", undefined, P).status).toBe("cannot decide");
    expect(promotionTimeTest([report(0.5), report(0.5)], "base", "cand", undefined, P).reason).toBe("2 jobs of 5");
  });

  it("reads only the inputs of the keys", () => {
    expect(promotionTimeTest([report(0.5)], "base", "cand", new Set(["in0", "in1", "nothere"]), P).inputs).toBe(2);
  });

  it("gives void and fails with no report of mode fresh of the pair", () => {
    const none = promotionTimeTest([], "base", "cand", undefined, P);
    expect([none.status, none.pass]).toEqual(["void", false]);
    expect(none.reason).toContain("no paired time report of mode fresh");
    expect(timeText(none)[0]).toContain("so the time test fails");
    expect(promotionTimeTest([report(0.5)], "base", "other", undefined, P).status).toBe("void");
    expect(promotionTimeTest([report(0.5)], "base", "cand", new Set(["nothere"]), P).status).toBe("void");
  });

  it("does not count a report of mode process (BENCH-FRESH-CASES)", () => {
    const old = promotionTimeTest(five(() => report(0.5, AA, 10, "process")), "base", "cand", undefined, P);
    expect([old.status, old.inProcess, old.jobs]).toEqual(["void", 5, 0]);
    expect(old.reason).toContain("cannot decide: the 5 paired time reports of the pair have the mode process");
    const mixed = promotionTimeTest([report(0.5), report(0.5), report(0.5), report(0.5), report(0.5, AA, 10, "process")], "base", "cand", undefined, P);
    expect([mixed.jobs, mixed.inProcess, mixed.status]).toEqual([4, 1, "cannot decide"]);
    expect(mixed.reason).toBe("4 jobs of 5, 1 of mode process");
  });

  it("gives void when two reports have one job label, because the home refuses them (FAIL-CLOSED)", () => {
    const twins = quiet(() => 1).map((r) => ({ ...r, job: "1" }));
    const t = promotionTimeTest(twins, "base", "cand", undefined, P);
    expect(t.status).toBe("void");
    expect(t.reason).toContain("two jobs have the label");
  });
});
