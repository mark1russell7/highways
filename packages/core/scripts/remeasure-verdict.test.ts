import { describe, expect, it } from "vitest";
import { InputError } from "./gates/inputs.ts";
import { aaId, pairedReport, type Mode, type PairedReport, type RawTimes } from "./gates/paired.ts";
import {
  CLAIM_PLANS,
  CLAIMS,
  NEW_ARM,
  OLD_ARM,
  claimVerdict,
  jobNames,
  jobOfFile,
  joinJobs,
  joinText,
  parseClaim,
  reportFile,
  targetVerdict,
  type ClaimPlan,
  type JobEntry,
} from "./remeasure-verdict.ts";

// Made-up reports only. No test reads a clock.
// The A/A factors of the inputs of each group. With 2 groups, the floor p10 to p90 is 0.97 to 1.03.
const AA = [0.97, 0.99, 1.0, 1.01, 1.03];
const ARMS = [{ id: OLD_ARM }, { id: NEW_ARM }, { id: aaId(OLD_ARM) }];

/** This function gives a made-up report: on each input, the old arm takes `oldMs`, the workspace takes `ratio` times that, and the A/A arm takes an A/A factor of it. */
function fake(mode: Mode, groups: Readonly<Record<string, number>>, cpu = "Test CPU", aa: readonly number[] = AA, oldMs = 100): PairedReport {
  const inputs = Object.keys(groups).flatMap((group) => aa.map((_, i) => ({ id: `${group}/${i}`, group })));
  const raw: RawTimes = { ms: new Map(), peak: new Map(inputs.map((x) => [x.id, new Map()])) };
  inputs.forEach((x, k) => {
    const i = k % aa.length;
    raw.ms.set(
      x.id,
      new Map([
        [OLD_ARM, [oldMs]],
        [NEW_ARM, [oldMs * groups[x.group]!]],
        [aaId(OLD_ARM), [oldMs * aa[i]!]],
      ]),
    );
  });
  return pairedReport(mode, { cpu, cores: 4, os: "test", arch: "x64", node: "v0" }, "test", ARMS, inputs, raw);
}

const PLAN: ClaimPlan = {
  claim: "route-scale",
  rows: ["TEST"],
  old: "a made-up old version",
  board: "a made-up board",
  mode: "fresh",
  rounds: 3,
  warmup: 0,
  targets: [
    { id: "fast", claim: 0.1, source: "TEST: 10 times faster" },
    { id: "free", claim: null, source: "TEST: no ratio" },
  ],
};

/** This function gives the 5 jobs of the plan, each with the ratios `groups`. */
const five = (groups: Readonly<Record<string, number>>, mode: Mode = "fresh"): JobEntry[] => jobNames().map((job, i) => ({ job, report: fake(mode, groups, `CPU ${i + 1}`) }));

describe("parseClaim", () => {
  it("reads each claim of the input, in any case of the letters", () => {
    for (const c of CLAIMS) expect(parseClaim(c)).toBe(c);
    expect(parseClaim(" H3 ")).toBe("h3");
    expect(parseClaim("Route-Scale")).toBe("route-scale");
  });

  it("throws a RangeError for a value that is not a claim", () => {
    expect(() => parseClaim("rel15")).toThrow(RangeError);
    expect(() => parseClaim("")).toThrow(/The claims are h3, portfolio-speed, route-scale/);
    expect(() => parseClaim(undefined)).toThrow(RangeError);
  });

  it("has a plan for each claim, with the modes and the claimed ratios of the rows", () => {
    expect(Object.keys(CLAIM_PLANS).sort()).toEqual([...CLAIMS].sort());
    expect(CLAIM_PLANS.h3.mode).toBe("fresh");
    expect(CLAIM_PLANS["portfolio-speed"].mode).toBe("process");
    expect(CLAIM_PLANS["route-scale"]).toMatchObject({ mode: "fresh", rounds: 3 });
    expect(CLAIM_PLANS.h3.targets.every((t) => t.claim === 0.5)).toBe(true);
    expect(CLAIM_PLANS["portfolio-speed"].targets.find((t) => t.id === "setup n100")!.claim).toBeCloseTo(25 / 172);
    expect(CLAIM_PLANS["route-scale"].targets.map((t) => [t.id, t.claim])).toEqual([
      ["shared", 21 / 302],
      ["shared-all", 0.1],
      ["portfolio", 28 / 300],
    ]);
  });
});

describe("the report files", () => {
  it("names the file of a job, and reads the job back from a path", () => {
    expect(reportFile(3)).toBe("paired-job3.json");
    expect(jobOfFile("paired-job3.json")).toBe("job3");
    expect(jobOfFile("remeasure-h3-job4/paired-job4.json")).toBe("job4");
    expect(jobOfFile("a\\paired-job12.json")).toBe("job12");
    expect(jobOfFile("paired.json")).toBeUndefined();
    expect(jobOfFile("board-h3.json")).toBeUndefined();
    expect(jobOfFile("xpaired-job1.json")).toBeUndefined();
  });
});

describe("targetVerdict", () => {
  const floor = { p10: 0.97, p90: 1.03 };
  const rows = (...ratios: number[]) => ratios.map((ratio) => ({ ratio, floor }));

  it("holds when each job is below the floor and at the claimed ratio or below", () => {
    expect(targetVerdict(0.5, rows(0.4, 0.45, 0.5, 0.3, 0.42))).toBe("holds");
  });

  it("gives smaller when each job is outside the floor and one job is above the claimed ratio", () => {
    expect(targetVerdict(0.5, rows(0.4, 0.45, 0.6, 0.3, 0.42))).toBe("smaller");
    // A workspace that is slower in each job is outside the floor, and its effect is smaller than the claim.
    expect(targetVerdict(0.5, rows(1.2, 1.3, 1.25, 1.2, 1.4))).toBe("smaller");
  });

  it("gives inside the noise floor when one job is inside the floor", () => {
    expect(targetVerdict(0.5, rows(0.4, 0.45, 0.99, 0.3, 0.42))).toBe("inside the noise floor");
    expect(targetVerdict(0.5, rows(0.4, 0.45, Number.NaN, 0.3, 0.42))).toBe("inside the noise floor");
  });

  it("gives no claimed ratio for a target without a claim", () => {
    expect(targetVerdict(null, rows(0.4, 0.45, 0.5, 0.3, 0.42))).toBe("outside the noise floor, no claimed ratio");
    expect(targetVerdict(null, rows(0.4, 1.0, 0.5, 0.3, 0.42))).toBe("inside the noise floor");
  });

  it("cannot decide with fewer jobs than the policy", () => {
    expect(targetVerdict(0.5, rows(0.4))).toBe("cannot decide (1 job of 5)");
    expect(targetVerdict(0.5, rows(0.4, 0.4, 0.4, 0.4))).toBe("cannot decide (4 jobs of 5)");
  });

  it("gives the weakest verdict of the claimed targets for the claim", () => {
    const t = (claim: number | null) => ({ id: "x", claim, source: "" });
    expect(claimVerdict([{ target: t(0.5), verdict: "holds" }, { target: t(null), verdict: "inside the noise floor" }])).toBe("holds");
    expect(claimVerdict([{ target: t(0.5), verdict: "holds" }, { target: t(0.5), verdict: "smaller" }])).toBe("smaller");
    expect(claimVerdict([{ target: t(0.5), verdict: "smaller" }, { target: t(0.5), verdict: "inside the noise floor" }])).toBe("inside the noise floor");
    expect(claimVerdict([{ target: t(null), verdict: "outside the noise floor, no claimed ratio" }])).toBe("no claimed ratio");
  });
});

describe("joinJobs", () => {
  it("joins the 5 reports, in the order of the jobs, with the CPU model of each job", () => {
    const entries = five({ fast: 0.08, free: 0.6 }).reverse();
    const j = joinJobs(PLAN, entries);
    expect(j.schema).toBe("remeasure/1");
    expect(j.jobs.map((x) => [x.job, x.cpu])).toEqual(jobNames().map((job, i) => [job, `CPU ${i + 1}`]));
    expect(j.jobs[0]!.floor.p10).toBeCloseTo(0.97);
    expect(j.jobs[0]!.floor.p90).toBeCloseTo(1.03);
    const [fast, free] = j.targets;
    expect(fast!.jobs.map((r) => r.ratio)).toEqual(Array(5).fill(0.08));
    expect(fast!.jobs[0]).toMatchObject({ oldMs: 100, inside: false });
    expect(fast!.jobs[0]!.newMs).toBeCloseTo(8);
    expect(fast!.verdict).toBe("holds");
    expect(free!.verdict).toBe("outside the noise floor, no claimed ratio");
    expect(j.verdict).toBe("holds");
  });

  it("gives smaller and inside the noise floor from the ratios of the jobs", () => {
    expect(joinJobs(PLAN, five({ fast: 0.2, free: 1 })).targets.map((t) => t.verdict)).toEqual(["smaller", "inside the noise floor"]);
    const entries = five({ fast: 0.08, free: 0.5 });
    entries[2] = { job: "job3", report: fake("fresh", { fast: 1.01, free: 0.5 }) };
    const j = joinJobs(PLAN, entries);
    expect(j.targets[0]!.verdict).toBe("inside the noise floor");
    expect(j.targets[0]!.worst).toBeCloseTo(1.01);
    expect(j.verdict).toBe("inside the noise floor");
  });

  it("counts the jobs where the workspace is slower", () => {
    const j = joinJobs(PLAN, five({ fast: 1.5, free: 0.5 }));
    expect(j.targets[0]!.slower).toBe(5);
    expect(joinText(j).join("\n")).toContain("the workspace is slower in 5 jobs of 5");
  });

  it("fails closed when a job has no report, or a job has two", () => {
    const four = five({ fast: 0.08, free: 0.5 }).slice(0, 4);
    expect(() => joinJobs(PLAN, four)).toThrow(InputError);
    expect(() => joinJobs(PLAN, four)).toThrow(/expected 5 inputs and got 4\. Missing: job5\./);
    const twice = [...four, { ...four[0]! }];
    expect(() => joinJobs(PLAN, twice)).toThrow(/two reports/);
    expect(() => joinJobs(PLAN, [])).toThrow(InputError);
    const extra = [...five({ fast: 0.08, free: 0.5 }), { job: "job6", report: fake("fresh", { fast: 0.08, free: 0.5 }) }];
    expect(() => joinJobs(PLAN, extra)).toThrow(/Not in the plan: job6/);
  });

  it("fails closed for a report that does not fit the plan", () => {
    const wrongMode = five({ fast: 0.08, free: 0.5 });
    wrongMode[1] = { job: "job2", report: fake("process", { fast: 0.08, free: 0.5 }) };
    expect(() => joinJobs(PLAN, wrongMode)).toThrow(/job2: the report has the mode process/);
    const noTarget = five({ fast: 0.08, free: 0.5 });
    noTarget[4] = { job: "job5", report: fake("fresh", { fast: 0.08 }) };
    expect(() => joinJobs(PLAN, noTarget)).toThrow(/job5: the report has no input of the target free/);
    const noAA = five({ fast: 0.08, free: 0.5 });
    const r = noAA[0]!.report;
    noAA[0] = { job: "job1", report: { ...r, arms: r.arms.filter((a) => a !== aaId(OLD_ARM)), noiseFloor: null } };
    expect(() => joinJobs(PLAN, noAA)).toThrow(/job1: the report has no arm old~aa/);
    const wrongBase = five({ fast: 0.08, free: 0.5 });
    wrongBase[0] = { job: "job1", report: { ...wrongBase[0]!.report, base: NEW_ARM } };
    expect(() => joinJobs(PLAN, wrongBase)).toThrow(/the base of the report is workspace/);
  });

  it("writes a table with one row for each target and the CPU model of each job", () => {
    const text = joinText(joinJobs(PLAN, five({ fast: 0.08, free: 0.6 }))).join("\n");
    expect(text).toContain("The verdict of the claim: **holds**.");
    expect(text).toContain("| `fast` | 0.100 | 0.080 (0.970 to 1.030) |");
    expect(text).toContain("| 100.0 ms | 8.0 ms | holds |");
    expect(text).toContain("- job5: 4 x CPU 5, mode `fresh`.");
  });
});
