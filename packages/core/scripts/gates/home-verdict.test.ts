import { describe, expect, it } from "vitest";
import { aaId, pairedReport, type RawTimes } from "./paired.ts";
import { COMMIT_ARM, PARENT_ARM, pairVerdicts } from "./pair-confirm.ts";
import { homeVerdict, pairedTimes } from "./home-verdict.ts";
import { FIXED_ARM, GATE_ROUTER, MIN_EFFECT, NOISE_CAP, gateExit, gateVerdict, parentLimit, type GateRecord, type PoolBand } from "../sections-gate-verdict.ts";

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

/** This function gives the report of a run, with the arms in the order of the gate. */
function reportOf(run: typeof QUIET_RUN) {
  const arms = [{ id: PARENT_ARM }, { id: COMMIT_ARM }, { id: FIXED_ARM }, { id: aaId(PARENT_ARM) }];
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
  };
  return pairedReport("fresh", ENV, "ci", arms, [{ id: GATE_ROUTER, group: GATE_ROUTER }], raw);
}

/** The band of a pool with fewer than 5 runs: the floor 1.05. The seed pool has 3 quiet runs. */
const FLOOR: PoolBand = { runs: 3, ratios: 30, spread: 0.0427, pooled: false, limit: 1 + MIN_EFFECT };

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
});

describe("the two runs under the rule of slice 2", () => {
  it("the quiet run 41542329976: the gate passes, and the home says same", () => {
    const report = reportOf(QUIET_RUN);
    const g = gateVerdict(report, FLOOR);
    expect(g.parent!.spread).toBeCloseTo(0.0273, 4);
    expect(g.parent!.spread).toBeLessThanOrEqual(NOISE_CAP);
    expect(g.checks[0].ratio).toBeCloseTo(0.9992, 4);
    expect(g.checks[1].ratio).toBeCloseTo(0.9978, 4);
    expect(g.outcome).toBe("pass");
    expect(g.words).toBe("same");
    const home = homeVerdict(report, GATE_ROUTER, COMMIT_ARM);
    expect(home.outcome).toBe("same");
    expect(home.interval!.low).toBeCloseTo(0.9913, 4);
    expect(home.interval!.high).toBeCloseTo(1.0162, 4);
  });

  it("the noisy run 41548965076: the run cannot decide, and the home says cannot decide too", () => {
    const report = reportOf(NOISY_RUN);
    const g = gateVerdict(report, FLOOR);
    expect(g.parent!.spread).toBeCloseTo(0.1961, 4);
    // Slice 1 gave the limit 1 + the spread of the run, so the run passed. Slice 2 caps the noise.
    expect(g.checks[0].ratio!).toBeLessThan(parentLimit(g.parent!.spread));
    expect(g.noisy).toBe(true);
    expect(g.checks[0].verdict).toBe("cannot decide");
    expect(g.checks[1].verdict).toBe("pass");
    expect(g.outcome).toBe("cannot decide");
    expect(g.words).toBe("cannot decide");
    const home = homeVerdict(report, GATE_ROUTER, COMMIT_ARM);
    expect(home.outcome).toBe("cannot decide");
    expect(home.interval!.low).toBeCloseTo(0.8413, 4);
    expect(home.interval!.high).toBeCloseTo(1.0156, 4);
  });

  it("the noisy run starts the retry as the first run, and fails as the second run", () => {
    const report = reportOf(NOISY_RUN);
    const base = { band: FLOOR, router: GATE_ROUTER, report } as unknown as GateRecord;
    expect(gateExit({ ...base, attempt: 1 })).toBe(3);
    expect(gateExit({ ...base, attempt: 2 })).toBe(1);
    expect(gateExit({ ...base, report: reportOf(QUIET_RUN), attempt: 1 })).toBe(0);
  });

  it("keeps the local band rule of the confirm mode: on the noisy run it says inside, and the home does not agree", () => {
    // `verdictOf` of `pair-confirm.ts` compares the ratio with 1 ± the spread of the run. The home has no such rule, so the local rule stays.
    expect(pairVerdicts(reportOf(QUIET_RUN))[0]!.verdict).toBe("inside");
    expect(pairVerdicts(reportOf(NOISY_RUN))[0]!.verdict).toBe("inside");
  });
});
