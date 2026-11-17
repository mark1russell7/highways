import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { armOrder } from "@mark1russell7/rigor-bench";
import { aaId, pairedReport, type RawTimes } from "./paired.ts";
import { COMMIT_ARM, PARENT_ARM, pairVerdicts } from "./pair-confirm.ts";
import { firstOf, homeVerdict, limitHome, pairedTimes, roundTimes } from "./home-verdict.ts";
import {
  FIXED_ARM,
  FIXED_LIMIT,
  GATE_ROUTER,
  NOISE_CAP,
  PARENT_FLOOR,
  POOL_FILE,
  gateExit,
  gateOptions,
  fixedRecord,
  gateVerdict,
  homeRecord,
  parsePool,
  type GateRun,
} from "../sections-gate-verdict.ts";

// The times in ms of two runs of the workflow `Sections gate`, copied from their artifacts `sections-gate.json`. Only the numbers are copied.
// Run 41542329976 (#257): a quiet runner, with an A/A spread of 0.027.
const QUIET_RUN = {
  parent: [47610.329418999994, 47506.322808, 47487.854320000006, 47446.145854, 47447.748315, 49923.029063, 47284.464825, 46811.937421999995, 47108.747923, 47585.016307],
  commit: [47158.030836, 47682.833892, 47142.521974999996, 47601.866364999994, 47479.836192, 47006.330405, 47729.378247, 47180.727182, 47461.530891, 47402.194501],
  fixed: [47352.389731, 48078.142463, 47403.642723, 47385.706177, 47668.609937999994, 47810.308326000006, 48725.540029, 48772.710728, 47209.215559, 47322.684323],
  aa: [48770.135752, 47176.185466, 46690.717534, 46932.477268, 47111.371323, 47229.783745, 47066.134331, 47256.043170000004, 47564.476543000004, 47135.636158],
};
// Run 41548965076 (#255): a noisy runner, with an A/A spread of 0.196. Slice 1 gave the limit 1.196, so a step of 19 % passed.
const NOISY_RUN = {
  parent: [29757.691467, 29999.559537999998, 30464.022094, 32287.155475, 31103.206093, 38562.127431999994, 42616.313579, 32942.246884, 30441.095981, 29399.976576999998],
  commit: [29098.504354, 28988.154562, 29418.959973, 31296.308381, 29802.027512, 29945.614937, 40727.867511, 32348.001687, 30857.424726, 34287.619812000004],
  fixed: [29367.815806, 29652.603755, 29226.084804, 30759.932555000003, 30393.610521000002, 31225.159966, 38660.599922, 31227.117017, 34486.611592, 33953.119793],
  aa: [29404.118021, 31449.429642000003, 31185.828029, 31124.415114, 29771.395763, 37101.331734, 40893.085517, 40556.433776, 36292.29369, 33748.567856],
};

const ENV = { cpu: "The CPU of the run", cores: 4, os: "linux", arch: "x64", node: "v26.13.0" };
/** The ids of the arms of the gate, in the order of the report. */
const IDS = [PARENT_ARM, COMMIT_ARM, FIXED_ARM, aaId(PARENT_ARM)];

/**
 * This function gives the report of a run, with the arms in the order of the gate.
 * These two runs are older than the field `orders`, so their report has no orders.
 * Their order is the local order of the fresh mode.
 * With `relabel`, the report gets the order of `armOrder` of the home. The times stay real, but the arm that ran first is made up.
 */
function reportOf(run: typeof QUIET_RUN, relabel = false) {
  const arms = IDS.map((id) => ({ id }));
  const raw: RawTimes = {
    ms: new Map([
      [
        GATE_ROUTER,
        new Map([
          [PARENT_ARM, run.parent],
          [COMMIT_ARM, run.commit],
          [FIXED_ARM, run.fixed],
          [aaId(PARENT_ARM), run.aa],
        ]),
      ],
    ]),
    peak: new Map([[GATE_ROUTER, new Map()]]),
    ...(relabel ? { orders: Array.from({ length: run.parent.length }, (_, k) => [...armOrder(IDS, k)]) } : {}),
  };
  return pairedReport("fresh", ENV, "ci", arms, [{ id: GATE_ROUTER, group: GATE_ROUTER }], raw);
}

/** The pool of the repository: 3 quiet runs, 30 A/A cases. Its pooled spread is below the floor, so the floor log(1.05) gives the margin. */
const POOL = parsePool(readFileSync(new URL(`../../${POOL_FILE}`, import.meta.url), "utf8"));

/** This function gives the limit verdict of the home on the head against the fixed base, in the form of the record. */
const fixedOf = (report: ReturnType<typeof reportOf>) => fixedRecord(limitHome(report, GATE_ROUTER, FIXED_ARM, COMMIT_ARM, FIXED_LIMIT));

/** This function gives the result of the gate on a report: the home decides with the options of the gate and the pool of the repository. */
function decide(report: ReturnType<typeof reportOf>) {
  const home = homeRecord(homeVerdict(report, GATE_ROUTER, COMMIT_ARM, gateOptions(POOL)));
  return gateVerdict(report, home, fixedOf(report));
}

describe("the records of the home", () => {
  it("gives one case for each round, with the arm that ran first", () => {
    const times = pairedTimes(reportOf(QUIET_RUN), GATE_ROUTER, COMMIT_ARM);
    expect(times).toHaveLength(10);
    expect(times[0]).toEqual({ case: `${GATE_ROUTER} #0`, round: 0, first: "a", a: QUIET_RUN.parent[0], b: QUIET_RUN.commit[0] });
    // The order of the 4 arms rotates by the round. In round 1 the order is commit, fixed, A/A, parent, so the commit runs first.
    expect(times[1]!.first).toBe("b");
    // In round 1 the A/A arm runs before the parent too. In round 2 the order is fixed, A/A, parent, commit.
    const aa = pairedTimes(reportOf(QUIET_RUN), GATE_ROUTER, aaId(PARENT_ARM));
    expect(aa.map((t) => t.first).slice(0, 4)).toEqual(["a", "b", "b", "b"]);
    expect(pairedTimes(reportOf(QUIET_RUN), "nope", COMMIT_ARM)).toEqual([]);
    expect(pairedTimes(reportOf(QUIET_RUN), GATE_ROUTER, "nope")).toEqual([]);
  });

  it("takes the arm that ran first from the orders of the report, when the report has them", () => {
    const report = reportOf(QUIET_RUN, true);
    // `armOrder` of the home: round 0 is parent, commit, fixed, A/A. Round 1 is the reverse. Round 2 starts with the commit.
    expect(report.orders![1]).toEqual([aaId(PARENT_ARM), FIXED_ARM, COMMIT_ARM, PARENT_ARM]);
    expect([0, 1, 2, 3].map((k) => firstOf(report, k, PARENT_ARM, COMMIT_ARM))).toEqual(["a", "b", "b", "a"]);
    expect(pairedTimes(report, GATE_ROUTER, COMMIT_ARM).map((t) => t.first).slice(0, 4)).toEqual(["a", "b", "b", "a"]);
    expect(() => firstOf(report, 0, PARENT_ARM, "nope")).toThrow(RangeError);
  });

  it("gives one case with the name of the input for the limit verdict, with one record for each round", () => {
    const times = roundTimes(reportOf(QUIET_RUN, true), GATE_ROUTER, FIXED_ARM, COMMIT_ARM);
    expect(times).toHaveLength(10);
    expect(new Set(times.map((t) => t.case))).toEqual(new Set([GATE_ROUTER]));
    expect(times[0]).toEqual({ case: GATE_ROUTER, round: 0, first: "b", a: QUIET_RUN.fixed[0], b: QUIET_RUN.commit[0] });
    // `armOrder` puts each arm of a pair first in one of each 2 rounds, so 10 rounds give 5 and 5.
    expect(times.filter((t) => t.first === "a")).toHaveLength(5);
    expect(roundTimes(reportOf(QUIET_RUN, true), "nope", FIXED_ARM, COMMIT_ARM)).toEqual([]);
  });

  it("refuses the limit verdict on a report of the local order: the commit runs before the fixed base in 8 of the 10 rounds", () => {
    const times = roundTimes(reportOf(QUIET_RUN), GATE_ROUTER, FIXED_ARM, COMMIT_ARM);
    expect(times.filter((t) => t.first === "b")).toHaveLength(8);
    expect(() => limitHome(reportOf(QUIET_RUN), GATE_ROUTER, FIXED_ARM, COMMIT_ARM, FIXED_LIMIT)).toThrow(RangeError);
  });
});

describe("the two runs under the home verdict of slice 3", () => {
  it("the quiet run 41542329976: the home says same, the head is within the limit of the fixed base, and the gate passes", () => {
    const g = decide(reportOf(QUIET_RUN, true));
    // The spread of slice 2 on |r - 1| and the spread of the home on |log r|. Both are below their cap.
    expect(g.parent!.spread).toBeCloseTo(0.0273, 4);
    expect(g.home!.noise!.spread!).toBeCloseTo(0.0272, 4);
    expect(g.home!.noise!.noisy).toBe(false);
    expect(g.home!.pool).toMatchObject({ cases: 30, runs: 3, floor: PARENT_FLOOR, pooled: false });
    expect(g.home!.margin).toBe(PARENT_FLOOR);
    expect(g.checks[0].ratio).toBeCloseTo(0.9992, 4);
    // The ratio of the check against the fixed base is the median of the round ratios. The old rule took the ratio of the medians, 0.9978.
    expect(g.checks[1].ratio).toBeCloseTo(0.9952, 4);
    expect(g.fixedCheck).toMatchObject({ outcome: "within", rounds: 10 });
    expect(g.fixedCheck!.noise!).toBeCloseTo(0.0169, 4);
    expect(g.fixedCheck!.bound!).toBeCloseTo(1.0217, 4);
    expect(g.words).toBe("same");
    expect(g.home!.low!).toBeCloseTo(0.9913, 4);
    expect(g.home!.high!).toBeCloseTo(1.0162, 4);
    expect(g.outcome).toBe("pass");
  });

  it("the noisy run 41548965076: the home finds the spread above the cap, and the run cannot decide", () => {
    const g = decide(reportOf(NOISY_RUN, true));
    expect(g.parent!.spread).toBeCloseTo(0.1961, 4);
    expect(g.home!.noise!.spread!).toBeGreaterThan(NOISE_CAP);
    expect(g.noisy).toBe(true);
    expect(g.checks[0].verdict).toBe("cannot decide");
    // The old rule passed the ratio of the medians. The A/A noise of these rounds is 0.176, so the bound 1.235 is above the limit.
    expect(g.checks[1].verdict).toBe("cannot decide");
    expect(g.fixedCheck!.bound!).toBeCloseTo(1.235, 3);
    expect(g.outcome).toBe("cannot decide");
    expect(g.words).toBe("cannot decide");
    expect(g.home!.reason).toContain("above the noise cap");
  });

  it("the noisy run starts the retry as the first run, and fails as the second run", () => {
    const report = reportOf(NOISY_RUN, true);
    const home = homeRecord(homeVerdict(report, GATE_ROUTER, COMMIT_ARM, gateOptions(POOL)));
    const base = { router: GATE_ROUTER, report, home, fixedCheck: fixedOf(report) } as unknown as GateRun;
    expect(gateExit({ ...base, attempt: 1 })).toBe(3);
    expect(gateExit({ ...base, attempt: 2 })).toBe(1);
    const quiet = reportOf(QUIET_RUN, true);
    const quietHome = homeRecord(homeVerdict(quiet, GATE_ROUTER, COMMIT_ARM, gateOptions(POOL)));
    expect(gateExit({ ...base, report: quiet, home: quietHome, fixedCheck: fixedOf(quiet), attempt: 1 })).toBe(0);
  });

  it("keeps the local band rule of the confirm mode: on the noisy run it says inside, and the home does not agree", () => {
    // `verdictOf` of `pair-confirm.ts` compares the ratio with 1 ± the spread of the run. The home has no such rule, so the local rule stays.
    expect(pairVerdicts(reportOf(QUIET_RUN))[0]!.verdict).toBe("inside");
    expect(pairVerdicts(reportOf(NOISY_RUN))[0]!.verdict).toBe("inside");
  });
});
