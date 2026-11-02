import { describe, expect, it } from "vitest";
import { pairedReport, type PairedReport, type RawTimes, type RecordEnv } from "./gates/paired.ts";
import {
  ALONE,
  ALONE_AA,
  IN_ORDER,
  IN_ORDER_NOTE,
  caseVerdict,
  casePlan,
  effectOf,
  exceedP,
  resampleRates,
  sizeOf,
  spreadOf,
  pickCases,
  roundUnits,
  runRounds,
  valuesOf,
  verdictOf,
  verdictText,
  type CaseArm,
  type CaseRecord,
} from "./case-order-verdict.ts";

// Made-up reports and times only. No test starts a process or reads a clock.
const PATHS = { node: ["node"], scripts: "/repo/packages/core/scripts" };
const ENV: RecordEnv = { cpu: "Test CPU", cores: 2, os: "linux", arch: "x64", node: "v26.0.0", mode: "process" };
const PAIRED_ENV = { cpu: "Test CPU", cores: 2, os: "linux", arch: "x64", node: "v26.0.0" };

/** This function gives a made-up report with one time for each paired arm on each input. */
function report(times: Readonly<Record<string, Readonly<Record<string, number>>>>): PairedReport {
  const ids = Object.keys(times);
  const arms = Object.keys(times[ids[0]!]!).map((id) => ({ id }));
  const raw: RawTimes = {
    ms: new Map(ids.map((id) => [id, new Map(arms.map((a) => [a.id, [times[id]![a.id]!]]))])),
    peak: new Map(ids.map((id) => [id, new Map()])),
  };
  return pairedReport("process", PAIRED_ENV, "ci", arms, ids.map((id) => ({ id })), raw);
}

/** This function gives a made-up record of one process. */
function record(job: number, round: number, arm: CaseArm, input: string | undefined, times: Readonly<Record<string, Readonly<Record<string, number>>>>): CaseRecord {
  const reports = [report(times)];
  return { schema: "case-order/1", target: "screen", job, round, slot: 0, arm, ...(input === undefined ? {} : { input }), env: ENV, values: valuesOf(reports, [""]), reports };
}

describe("casePlan", () => {
  it("gives the screen in order as scripts/screen.ts, and the screen alone as the child of case-order.ts", () => {
    const plan = casePlan("screen", PATHS);
    const io = plan.inOrder("/w/a");
    expect(io.slice(0, 2)).toEqual(["node", "/repo/packages/core/scripts/screen.ts"]);
    expect(io).toContain("--paired");
    expect(io[io.indexOf("--paired-base") + 1]).toBe("shared");
    // The in-order arm keeps the old mode of the paired screen: each input after the other inputs in one process.
    expect(io[io.indexOf("--paired-mode") + 1]).toBe("process");
    const alone = plan.alone("screen-v3/pipeline/s5", "/w/b");
    expect(alone.slice(0, 4)).toEqual(["node", "/repo/packages/core/scripts/case-order.ts", "--child", "screen"]);
    expect(alone[alone.indexOf("--input") + 1]).toBe("screen-v3/pipeline/s5");
    expect(plan.reportOf("/w/b/")).toBe("/w/b/paired.json");
  });

  it("gives levels alone as scripts/levels.ts with one fixture, and PORTFOLIO-SPEED alone with --only", () => {
    const levels = casePlan("levels", PATHS);
    const alone = levels.alone("grid-400", "/w");
    expect(alone[alone.indexOf("--fixture") + 1]).toBe("grid-400");
    expect(levels.inOrder("/w")[levels.inOrder("/w").indexOf("--fixture") + 1]).toContain("tiny-uniform,small-clustered");
    expect(levels.reportLabels).toEqual(["route", "links"]);
    const speed = casePlan("portfolio-speed", PATHS);
    expect(speed.alone("setup:hubs-41-s0", "/w").slice(-2)).toEqual(["--only", "setup:hubs-41-s0"]);
    expect(speed.inOrder("/w")).not.toContain("--only");
    expect(speed.reportOf("/w")).toBe("/w/paired-job1.json");
  });
});

describe("pickCases and roundUnits", () => {
  it("takes each case at the step of the stride", () => {
    expect(pickCases(["a", "b", "c", "d", "e"], 2)).toEqual(["a", "c", "e"]);
    expect(pickCases(["a", "b"], 1)).toEqual(["a", "b"]);
    expect(() => pickCases(["a"], 0)).toThrow(RangeError);
  });

  it("puts the arm in order first in an even round and last in an odd round", () => {
    const even = roundUnits(["a", "b"], 0);
    expect(even.map((u) => `${u.arm}${u.input ?? ""}`)).toEqual([IN_ORDER, `${ALONE}a`, `${ALONE_AA}a`, `${ALONE}b`, `${ALONE_AA}b`]);
    const odd = roundUnits(["a", "b"], 1);
    expect(odd.at(-1)!.arm).toBe(IN_ORDER);
    expect(odd[0]).toEqual({ arm: ALONE_AA, input: "b" });
  });
});

describe("exceedP, verdictOf and effectOf", () => {
  it("gives the chance of k or more values above each other value", () => {
    expect(exceedP(20, 20, 0)).toBe(1);
    expect(exceedP(20, 20, 1)).toBeCloseTo(0.5, 10);
    expect(exceedP(20, 20, 5)).toBeCloseTo(15504 / 658008, 10);
    expect(exceedP(3, 3, 4)).toBe(0);
  });

  it("gives the four verdicts of E against the budget, and no budget without one", () => {
    expect(verdictOf({ lo: 0.95, hi: 1.05 }, 0.1)).toBe("no change");
    expect(verdictOf({ lo: 1.2, hi: 1.4 }, 0.1)).toBe("slower");
    expect(verdictOf({ lo: 0.6, hi: 0.8 }, 0.1)).toBe("faster");
    expect(verdictOf({ lo: 0.95, hi: 1.15 }, 0.1)).toBe("cannot decide");
    expect(verdictOf({ lo: 0.95, hi: 1.05 }, undefined)).toBe("no budget");
    expect(verdictOf(null, 0.1)).toBe("void");
  });

  it("takes the band of R over the jobs, widened by the worst A/A half-spread, and skips a job whose A/A band excludes 1", () => {
    const aa = [0.98, 0.99, 1, 1.01, 1.02];
    const e = effectOf(
      [
        { ratios: [1.0, 1.02, 1.04], aa },
        { ratios: [0.96, 0.98, 1.0], aa: [0.9, 1, 1.1] },
        { ratios: [3, 3, 3], aa: [1.2, 1.3, 1.4] },
      ],
      0.15,
    );
    expect(e.jobs).toBe(2);
    expect(e.r).toEqual([1.02, 0.98]);
    expect(e.h).toBeCloseTo(0.08, 10);
    expect(e.e!.lo).toBeCloseTo(0.9, 10);
    expect(e.e!.hi).toBeCloseTo(1.1, 10);
    expect(e.verdict).toBe("no change");
    expect(effectOf([{ ratios: [1], aa: [1.2, 1.3] }], 0.1).verdict).toBe("void");
  });
});

describe("runRounds", () => {
  it("runs the arm in order first, takes the cases from its report and runs two alone arms for each case", async () => {
    const plan = casePlan("screen", PATHS);
    const started: string[][] = [];
    const kept: CaseRecord[] = [];
    const inputs = ["i0", "i1", "i2", "i3"];
    const { records, cases } = await runRounds(
      plan,
      2,
      {
        start: async (argv) => void started.push([...argv]),
        read: () => {
          const last = started.at(-1)!;
          const one = last.includes("--input") ? [last[last.indexOf("--input") + 1]!] : inputs;
          return [report(Object.fromEntries(one.map((id) => [id, { shared: 10, corners: 12, "shared~aa": 10 }])))];
        },
        dirOf: (round, slot) => `/w/r${round}-s${slot}`,
        env: () => ENV,
        keep: (r) => void kept.push(r),
      },
      2,
    );
    expect(cases).toEqual(["i0", "i2"]);
    expect(records).toHaveLength(2 * (1 + 2 * 2));
    expect(kept).toEqual(records);
    expect(records[0]!.arm).toBe(IN_ORDER);
    expect(records.at(-1)!.arm).toBe(IN_ORDER);
    expect(records.filter((r) => r.arm === ALONE_AA && r.input === "i2")).toHaveLength(2);
    expect(started[1]![started[1]!.indexOf("--input") + 1]).toBe("i0");
    expect(records[1]!.values.map((v) => v.arm).sort()).toEqual(["corners", "shared", "shared~aa"]);
  });

  it("fails when a process writes no report", async () => {
    const plan = casePlan("levels", PATHS);
    const deps = { start: async () => {}, read: () => [], dirOf: () => "/w", env: () => ENV, keep: () => {} };
    await expect(runRounds(plan, 1, deps)).rejects.toThrow(/no report/);
  });
});

describe("caseVerdict", () => {
  // The alone times of 20 rounds: 100 to 104 ms for the base arm shared. The head arm corners takes 1.2 times that.
  const ROUNDS = 20;
  const alone = (i: number): number => 100 + ((i * 3) % 5);
  const aa = (i: number): number => 100 + ((i * 2 + 1) % 5);
  const pair = (s: number, head = 1.2) => ({ shared: s, corners: s * head });

  /**
   * This function gives the records of two jobs of 20 rounds. In order, `calm` has the alone times, and `both` is 1.5 times slower on each arm.
   * `head` is 1.5 times slower on corners only, and `slow` has 9 slow processes on each arm.
   */
  function records(): CaseRecord[] {
    const out: CaseRecord[] = [];
    for (const job of [1, 2])
      for (let i = 0; i < ROUNDS; i++) {
        const slow = i % 2 === 0 && i < 18 ? 2 : 1;
        out.push(record(job, i, IN_ORDER, undefined, { calm: pair(aa(i + 3)), both: pair(1.5 * alone(i)), head: pair(alone(i), 1.8), slow: pair(slow * alone(i)), other: pair(1) }));
        for (const id of ["calm", "both", "head", "slow"]) {
          out.push(record(job, i, ALONE, id, { [id]: pair(alone(i)) }));
          out.push(record(job, i, ALONE_AA, id, { [id]: pair(aa(i)) }));
        }
      }
    return out;
  }
  const PLAN = { target: "screen" as const, describe: "made-up", budget: { value: 0.1, source: "default 0.1" } };
  const verdict = caseVerdict(PLAN, records(), ["calm", "both", "head", "slow"], undefined, 200);
  const row = (input: string, arm: string) => verdict.rows.find((r) => r.input === input && r.arm === arm)!;

  it("records a shift of both arms and a shift of one arm, and a slow mode in the slow count only", () => {
    expect(verdict.jobs).toEqual([1, 2]);
    expect(verdict.budget).toBe(0.1);
    expect(verdict.budgetSource).toBe("default 0.1");
    expect(row("calm", "shared").effect.verdict).toBe("no change");
    expect(row("calm", "corners").r2!.verdict).toBe("no change");
    expect(row("calm", "corners").record).toBe("no effect shown");
    expect(row("both", "shared").effect.verdict).toBe("slower");
    expect(row("both", "corners").r2!.verdict).toBe("no change");
    expect(row("both", "shared").record).toBe("slower");
    expect(row("head", "shared").effect.verdict).toBe("no change");
    expect(row("head", "corners").r2!.verdict).toBe("slower");
    expect(row("head", "shared").record).toBe("slower");
    expect(row("slow", "shared").slowInOrder).toBe(18);
    expect(row("slow", "shared").slowAA).toBe(0);
    // A slow mode of 9 of 20 processes leaves the median R at 1. Only the slow count records it.
    expect(row("slow", "shared").record).toBe("no effect shown");
    expect(row("calm", "shared").r2).toBeNull();
    expect(verdict.withEffect).toBe(2);
    expect(verdict.label).toBe("record only, not sized");
  });

  it("gives σ of the single alone processes and the processes n of a sized run", () => {
    expect(spreadOf([1])).toBeNaN();
    expect(spreadOf([99, 100, 101])).toBeCloseTo(0.01, 10);
    expect(sizeOf(0.01, 0.1)).toBe(1);
    expect(sizeOf(0.1, 0.1)).toBe(7);
    expect(sizeOf(0.2, 0.05)).toBe(99);
    expect(sizeOf(0.1, undefined)).toBeNull();
    const calm = row("calm", "shared");
    expect(calm.sigma).toBeGreaterThan(0);
    expect(calm.n).toBe(sizeOf(calm.sigma, 0.1));
  });

  it("gives the pass rate with no effect and the power at the budget from a seeded resample", () => {
    const rates = row("calm", "corners").rates!;
    expect(rates.noEffectPass).toBeGreaterThan(0.5);
    expect(rates.powerArm).toBeGreaterThanOrEqual(0);
    expect(rates.powerR2).not.toBeNull();
    const again = caseVerdict(PLAN, records(), ["calm"], undefined, 200).rows.find((r) => r.arm === "corners")!.rates;
    expect(again).toEqual(rates);
    const jobs = [{ inOrder: [{ v: 1, base: 1 }], alone: [{ v: 1, base: 1 }], aa: [{ v: 1, base: 1 }] }];
    expect(resampleRates(jobs, 0.1, false, 50)).toEqual({ noEffectPass: 1, powerArm: 0, powerR2: null, resamples: 50, seed: 20261102 });
  });

  it("gives no budget without a budget, and takes the input --budget over the default", () => {
    const none = caseVerdict({ target: "levels", describe: "made-up" }, records(), ["calm"], undefined, 10);
    expect(none.budgetSource).toBe("no budget");
    expect(none.rows.every((r) => r.effect.verdict === "no budget" && r.rates === null && r.record === "no budget" && r.n === null)).toBe(true);
    const given = caseVerdict(PLAN, records(), ["calm"], 0.3, 10);
    expect(given.budgetSource).toBe("input --budget");
    expect(() => caseVerdict(PLAN, records(), ["calm"], 2, 10)).toThrow(RangeError);
  });

  it("gives one row for each paired arm of each case in the text, with both E columns and the note on the times in order", () => {
    const text = verdictText(verdict).join("\n");
    expect(text).toContain(IN_ORDER_NOTE);
    expect(text).toContain("| E in-order / alone (record only, not sized) | E of R2 (record only, not sized) | record of the case | σ | b | n |");
    expect(text).not.toContain("stays in order");
    expect(text).toContain("| slow | shared (base) |");
    expect(text).toContain("b = 0.1 (default 0.1)");
    expect(text).toContain("Test CPU");
    expect(verdictText(caseVerdict({ target: "levels", describe: "made-up" }, records(), ["calm"], undefined, 10)).join("\n")).toContain("no budget");
  });
});
