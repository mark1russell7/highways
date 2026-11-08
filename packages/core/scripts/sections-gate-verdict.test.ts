import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aaSpread, pooledBand } from "@mark1russell7/rigor-bench";
import { InputError } from "./gates/inputs.ts";
import { aaId, pairedReport, type RawTimes } from "./gates/paired.ts";
import { COMMIT_ARM, PARENT_ARM, spreadOf } from "./gates/pair-confirm.ts";
import { homeVerdict } from "./gates/home-verdict.ts";
import {
  BASE_FILE,
  checkLine,
  BASE_SCHEMA,
  FIXED_ARM,
  FIXED_LIMIT,
  GATE_ROUTER,
  GATE_SCHEMA,
  NOISE_CAP,
  PARENT_FLOOR,
  POOL_FILE,
  POOL_MAX_RUNS,
  POOL_SCHEMA,
  SPREAD_LEVEL,
  buildPool,
  gateExit,
  gateOptions,
  gateText,
  gateVerdict,
  homeRecord,
  parentVerdictOf,
  parseFixedBase,
  parsePool,
  poolEntry,
  poolOptions,
  ratioTimes,
  recordVerdict,
  type AaPool,
  type GateRecord,
  type PoolRun,
} from "./sections-gate-verdict.ts";

// Made-up times only. No test reads a clock or starts a process.
const ENV = { cpu: "Made-up CPU", cores: 4, os: "test", arch: "x64", node: "v0" };
const sha = (c: string): string => c.repeat(40);
/** The A/A factors of 10 rounds. Their spread is 0.02 on |r - 1| and 0.0202 on |log r|. */
const QUIET = [0.98, 1, 1.02, 0.99, 1.01, 1, 0.98, 1.02, 1, 1];
/** Noisy A/A factors. Their spread on |log r| is 0.115, above the noise cap 0.058. */
const NOISY = [0.88, 1, 1.12, 0.94, 1.06, 1, 0.9, 1.1, 1, 1];
/** A/A factors with the spread 0.055 on |log r|: above the floor 0.049, and below the noise cap 0.058. */
const BUSY = [0.945, 1, 1.055, 0.97, 1.03, 1, 0.95, 1.05, 1, 1];
/** The made-up factors of a head with a wide spread. Their median is 1.0625, but the rounds go from 0.92 to 1.16. */
const WIDE = [0.92, 1.15, 0.95, 1.14, 1.06, 1.07, 0.96, 1.16, 1.065, 0.99];

/**
 * This function gives a made-up report of the gate on one input. The parent takes 1000 ms in each round, and each arm takes its factor times that.
 * A head of one number has that factor in each round, and a list gives the factor of each round.
 */
function report(head: number | readonly number[], fixed: number, aa: readonly number[] = QUIET, input = GATE_ROUTER) {
  const arms = [{ id: PARENT_ARM }, { id: COMMIT_ARM }, { id: FIXED_ARM }, { id: aaId(PARENT_ARM) }];
  const n = aa.length;
  const heads = typeof head === "number" ? Array.from({ length: n }, () => head) : head;
  const raw: RawTimes = {
    ms: new Map([
      [
        input,
        new Map([
          [PARENT_ARM, Array.from({ length: n }, () => 1000)],
          [COMMIT_ARM, heads.map((f) => 1000 * f)],
          [FIXED_ARM, Array.from({ length: n }, () => 1000 * fixed)],
          [aaId(PARENT_ARM), aa.map((f) => 1000 * f)],
        ]),
      ],
    ]),
    peak: new Map([[input, new Map()]]),
  };
  return pairedReport("fresh", ENV, "test", arms, [{ id: input, group: input }], raw);
}

/** This function gives a made-up quiet run of the pool, with the A/A ratios `ratios`. */
function poolRun(run: number, ratios: readonly number[] = QUIET, job: PoolRun["job"] = "gate"): PoolRun {
  return { run, job, commit: sha("c"), parent: sha("a"), cpu: "Made-up CPU", date: "2026-11-02", spread: spreadOf(ratios), ratios };
}
/** A pool of one quiet run: its spread is below the floor, so the floor gives the margin. */
const FLOOR: AaPool = { schema: POOL_SCHEMA, runs: [poolRun(1)] };
/** A pool of 5 runs with the spread 0.055 on |log r|: the pooled spread gives the margin. */
const POOLED: AaPool = { schema: POOL_SCHEMA, runs: [1, 2, 3, 4, 5].map((r) => poolRun(r, BUSY)) };

/** This function gives the verdict of the home on a report with the options of the gate, in the form of the record. */
const homeOf = (r: ReturnType<typeof report>, pool: AaPool = FLOOR) => homeRecord(homeVerdict(r, GATE_ROUTER, COMMIT_ARM, gateOptions(pool)));
/** This function gives the result of the gate on a report, with the verdict of the home on the same report. */
const decide = (r: ReturnType<typeof report>, pool: AaPool = FLOOR) => gateVerdict(r, homeOf(r, pool));
/** This function gives the A/A spread of a list of ratios with the home: p90 of |log r|. */
const logSpread = (ratios: readonly number[]): number => aaSpread(ratioTimes(ratios, "run"), SPREAD_LEVEL);

const side = (c: string, subject: string) => ({ ref: c, sha: sha(c), subject });

/** This function gives a made-up record of the gate around a report. */
function record(r: ReturnType<typeof report> | null, skipped: string | null = null, attempt: 1 | 2 = 1): GateRecord {
  return {
    schema: GATE_SCHEMA,
    attempt,
    board: side("b", "made-up board"),
    fixture: "large-clustered",
    router: GATE_ROUTER,
    rounds: 10,
    head: { ...side("e", "feat(core): made-up change"), ref: "HEAD" },
    parent: { ...side("a", "made-up parent"), ref: "HEAD^1" },
    fixed: side("f", "made-up fixed base"),
    fixedBase: { schema: BASE_SCHEMA, commit: sha("f"), date: "2026-11-02", reason: "The made-up first base." },
    skipped,
    env: { ...ENV, mode: "fresh", context: "test" },
    report: r,
    home: r === null ? null : homeOf(r),
  };
}

describe("the file of the fixed base", () => {
  it("reads the file of the repository: a full hash, a date and a reason", () => {
    const base = parseFixedBase(readFileSync(new URL(`../${BASE_FILE}`, import.meta.url), "utf8"));
    expect(base.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(base.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(base.reason.length).toBeGreaterThan(0);
  });

  it("refuses a file with no full hash, no date, no reason or another schema", () => {
    const ok = { schema: BASE_SCHEMA, commit: sha("a"), date: "2026-11-02", reason: "A reason." };
    expect(parseFixedBase(JSON.stringify(ok))).toEqual(ok);
    expect(() => parseFixedBase("{")).toThrow(InputError);
    expect(() => parseFixedBase(JSON.stringify({ ...ok, schema: "other" }))).toThrow(InputError);
    expect(() => parseFixedBase(JSON.stringify({ ...ok, commit: "abc1234" }))).toThrow(InputError);
    expect(() => parseFixedBase(JSON.stringify({ ...ok, date: "11/02/2026" }))).toThrow(InputError);
    expect(() => parseFixedBase(JSON.stringify({ ...ok, reason: " " }))).toThrow(InputError);
  });
});

describe("the scale of the home", () => {
  it("keeps the rules of slice 2 on the log scale: the cap log(1.06) and the floor log(1.05)", () => {
    // Slice 2 had the cap 0.06 on |r - 1|. The ratio 1.06 has |log r| = 0.058.
    expect(NOISE_CAP).toBeCloseTo(0.0583, 4);
    expect(Math.exp(NOISE_CAP)).toBeCloseTo(1.06, 12);
    expect(PARENT_FLOOR).toBeCloseTo(0.0488, 4);
    expect(Math.exp(PARENT_FLOOR)).toBeCloseTo(1.05, 12);
    expect(gateOptions(FLOOR)).toMatchObject({ rule: "difference", margin: PARENT_FLOOR, noiseCap: NOISE_CAP, spreadLevel: 0.9, pool: { floor: PARENT_FLOOR } });
  });

  it("maps the outcomes of the home: slower fails, cannot decide starts the retry, same and faster pass", () => {
    expect(parentVerdictOf("slower")).toBe("fail");
    expect(parentVerdictOf("cannot decide")).toBe("cannot decide");
    expect(parentVerdictOf("same")).toBe("pass");
    expect(parentVerdictOf("faster")).toBe("pass");
  });
});

describe("the pool of A/A rounds", () => {
  it("reads the pool of the repository: each run is quiet on |log r|, with its CPU model and its 10 ratios", () => {
    const pool = parsePool(readFileSync(new URL(`../${POOL_FILE}`, import.meta.url), "utf8"));
    expect(pool.runs.length).toBeGreaterThan(0);
    for (const r of pool.runs) {
      expect(logSpread(r.ratios)).toBeLessThanOrEqual(NOISE_CAP);
      expect(r.ratios).toHaveLength(10);
      expect(r.cpu.length).toBeGreaterThan(0);
    }
    // Each ratio is one case of the home, and the run id and the job name the run of each case.
    const options = poolOptions(pool);
    expect(options.records).toHaveLength(pool.runs.length * 10);
    expect(new Set(options.records.map(options.run!)).size).toBe(pool.runs.length);
    expect(pooledBand(options, SPREAD_LEVEL).noise).toBeGreaterThanOrEqual(PARENT_FLOOR);
  });

  it("refuses a pool with a wrong spread, a run two times or another schema", () => {
    const ok = { schema: POOL_SCHEMA, runs: [poolRun(1)] };
    expect(parsePool(JSON.stringify(ok)).runs).toHaveLength(1);
    expect(() => parsePool("{")).toThrow(InputError);
    expect(() => parsePool(JSON.stringify({ ...ok, schema: "other" }))).toThrow(InputError);
    expect(() => parsePool(JSON.stringify({ ...ok, runs: [{ ...poolRun(1), spread: 0.01 }] }))).toThrow(InputError);
    expect(() => parsePool(JSON.stringify({ ...ok, runs: [poolRun(1), poolRun(1)] }))).toThrow(InputError);
    expect(() => parsePool(JSON.stringify({ ...ok, runs: [{ ...poolRun(1), commit: "abc" }] }))).toThrow(InputError);
    // The job retry of the same run is a second run of the pool.
    expect(parsePool(JSON.stringify({ ...ok, runs: [poolRun(1), poolRun(1, QUIET, "retry")] })).runs).toHaveLength(2);
  });

  it("gives the margin of the floor for a quiet pool, and the pooled spread for a pool that is noisier", () => {
    const quiet = homeOf(report(1, 1), FLOOR);
    expect(quiet.pool).toEqual({ cases: 10, runs: 1, spread: expect.closeTo(0.0202, 4), floor: PARENT_FLOOR, pooled: false });
    expect(quiet.margin).toBe(PARENT_FLOOR);
    const busy = homeOf(report(1, 1), POOLED);
    expect(busy.pool!.runs).toBe(5);
    expect(busy.pool!.cases).toBe(50);
    expect(busy.pool!.pooled).toBe(true);
    expect(busy.margin).toBeCloseTo(logSpread(BUSY), 12);
    expect(busy.margin!).toBeGreaterThan(PARENT_FLOOR);
    // The cases of a retry are a second run of the pool.
    const retry = homeOf(report(1, 1), { schema: POOL_SCHEMA, runs: [poolRun(1), poolRun(1, QUIET, "retry")] });
    expect(retry.pool!.runs).toBe(2);
  });

  it("keeps only the quiet records, the newest first, and at most 20 runs", () => {
    const facts = { run: 7, job: "gate" as const, date: "2026-11-02" };
    const quiet = poolEntry(record(report(1, 1)), facts, logSpread);
    expect(quiet.kept).toBe(true);
    if (quiet.kept) {
      expect(quiet.run.parent).toBe(sha("a"));
      // The file keeps the spread of slice 2, p90 of |r - 1|.
      expect(quiet.run.spread).toBeCloseTo(0.02, 10);
      expect(quiet.run.ratios).toHaveLength(10);
    }
    const noisy = poolEntry(record(report(1, 1, NOISY)), facts, logSpread);
    expect(noisy.kept).toBe(false);
    if (!noisy.kept) expect(noisy.reason).toContain("above the cap 0.058");
    expect(poolEntry(record(null, "no load"), facts, logSpread).kept).toBe(false);
    expect(poolEntry({ ...record(report(1, 1)), schema: "other/1" }, facts, logSpread).kept).toBe(false);
    const many = Array.from({ length: 25 }, (_, i) => poolRun(i + 1));
    const pool = buildPool([...many, poolRun(3)]);
    expect(pool.runs).toHaveLength(POOL_MAX_RUNS);
    expect(pool.runs[0]!.run).toBe(25);
    expect(pool.runs.at(-1)!.run).toBe(6);
  });
});

describe("the checks of the gate", () => {
  it("passes a head that the home calls same or faster", () => {
    const g = decide(report(1, 1.02));
    expect(g.parent!.aa).toHaveLength(10);
    expect(g.checks[0].ratio).toBeCloseTo(1, 10);
    expect(g.checks[0].limit).toBeCloseTo(1.05, 10);
    expect(g.checks[0].verdict).toBe("pass");
    expect(g.checks[1].ratio).toBeCloseTo(1 / 1.02, 10);
    expect(g.checks[1].limit).toBe(FIXED_LIMIT);
    expect(g.checks[1].verdict).toBe("pass");
    expect(g.words).toBe("same");
    expect(g.outcome).toBe("pass");
    expect(g.pass).toBe(true);
    const fast = decide(report(0.9, 0.9));
    expect(fast.words).toBe("faster");
    expect(fast.outcome).toBe("pass");
  });

  it("fails a head 19 % slower than the parent, with a quiet A/A arm", () => {
    // The fixed base takes 1.12 times the parent, so the head is 1.0625 times the fixed base and that check passes.
    const g = decide(report(1.19, 1.12));
    expect(g.home!.noise!.noisy).toBe(false);
    expect(g.home!.low!).toBeGreaterThan(1);
    expect(g.words).toBe("slower");
    expect(g.checks[0].verdict).toBe("fail");
    expect(g.checks[1].verdict).toBe("pass");
    expect(g.outcome).toBe("fail");
    expect(g.pass).toBe(false);
    expect(g.reason).toContain("The home finds the head slower than the parent (ratio 1.190).");
  });

  it("passes a sure step of 3 %: the step is in the margin log(1.05), so the home calls it same", () => {
    // The interval of the home is wholly above 1, but it is in the band of the margin. Since rigor-bench 0.2.0, same comes before slower.
    const g = decide(report(1.03, 1.03));
    expect(g.checks[0].ratio!).toBeLessThan(1 + 0.05);
    expect(g.home!.low!).toBeGreaterThan(1);
    expect(g.words).toBe("same");
    expect(g.outcome).toBe("pass");
  });

  it("the home and the old rule disagree on a wide head: the home cannot decide, and the home wins", () => {
    // The median ratio is 1.0625, so the old rule failed it. The interval of the home holds 1, so the run starts the retry.
    const g = decide(report(WIDE, 1));
    expect(g.checks[0].ratio).toBeCloseTo(1.0625, 10);
    expect(g.checks[0].ratio!).toBeGreaterThan(1 + 0.05);
    expect(g.home!.noise!.noisy).toBe(false);
    expect(g.home!.low!).toBeLessThan(1);
    expect(g.checks[0].verdict).toBe("cannot decide");
    expect(g.outcome).toBe("cannot decide");
  });

  it("takes the margin from the pool, not from the spread of the run", () => {
    // The run has the spread 0.055. The quiet pool keeps the margin at the floor, and the noisier pool widens it.
    expect(homeOf(report(1, 1, BUSY), FLOOR).margin).toBe(PARENT_FLOOR);
    expect(homeOf(report(1, 1, BUSY), POOLED).margin!).toBeCloseTo(logSpread(BUSY), 12);
  });

  it("cannot decide on a run with an A/A spread above the cap, at each ratio", () => {
    for (const head of [0.8, 1, 1.09]) {
      const g = decide(report(head, head, NOISY), POOLED);
      expect(g.home!.noise!.spread!).toBeCloseTo(0.1148, 4);
      expect(g.noisy).toBe(true);
      expect(g.checks[0].verdict).toBe("cannot decide");
      expect(g.words).toBe("cannot decide");
      expect(g.outcome).toBe("cannot decide");
      expect(g.pass).toBe(false);
    }
    // A failed check against the fixed base fails a noisy run too: the check against the fixed base does not change.
    expect(decide(report(1.2, 1, NOISY), POOLED).outcome).toBe("fail");
  });

  it("fails a slow drift against the fixed base, when the step against the parent passes", () => {
    // The head is the same as the parent, and the parent is 1.12 times the fixed base: the fixed base takes 1 / 1.12 of the parent.
    const g = decide(report(1, 1 / 1.12));
    expect(g.checks[0].verdict).toBe("pass");
    expect(g.checks[1].ratio).toBeCloseTo(1.12, 10);
    expect(g.checks[1].verdict).toBe("fail");
    expect(g.pass).toBe(false);
  });

  it("gives not measured for a report with no input of the router, and the gate does not pass", () => {
    const g = decide(report(1, 1, QUIET, "sections"));
    expect(g.checks.map((c) => c.verdict)).toEqual(["not measured", "not measured"]);
    expect(g.outcome).toBe("fail");
    expect(gateVerdict(report(1, 1), null).outcome).toBe("fail");
  });

  it("refuses a report with no fixed base arm", () => {
    const other = pairedReport("fresh", ENV, "test", [{ id: PARENT_ARM }, { id: COMMIT_ARM }, { id: aaId(PARENT_ARM) }], [{ id: GATE_ROUTER }], {
      ms: new Map([[GATE_ROUTER, new Map([[PARENT_ARM, [1]], [COMMIT_ARM, [1]], [aaId(PARENT_ARM), [1]]])]]),
      peak: new Map([[GATE_ROUTER, new Map()]]),
    });
    expect(() => gateVerdict(other, null)).toThrow(RangeError);
  });
});

describe("the record of the gate", () => {
  it("fails a record with no report", () => {
    const g = recordVerdict(record(null, "HEAD: the core does not load"));
    expect(g.pass).toBe(false);
    expect(g.checks.map((c) => c.verdict)).toEqual(["not measured", "not measured"]);
    expect(gateExit(record(null, "HEAD: the core does not load"))).toBe(1);
    const text = gateText(record(null, "HEAD: the core does not load")).join("\n");
    expect(text).toContain("# The sections time gate, run 1 of 2: fail");
    expect(text).toContain("**The job timed no arm:** HEAD: the core does not load");
  });

  it("writes the outcome, the noise, the pool with its runs and cases, the checks and the times", () => {
    const r = record(report(1, 1.02));
    expect(r.home!.pool).toMatchObject({ cases: 10, runs: 1 });
    const text = gateText(r).join("\n");
    expect(text).toContain("# The sections time gate, run 1 of 2: pass");
    // The summary gives the input text and the full hash of the head and of the parent (GATE-CONFIRM-SHA).
    expect(text).toContain(`- The head: \`HEAD\` = \`${sha("e")}\` feat(core): made-up change`);
    expect(text).toContain(`- The parent: \`HEAD^1\` = \`${sha("a")}\` made-up parent`);
    expect(text).toContain("The gate passes. The home finds the head same against the parent (ratio 1.000)");
    expect(text).toContain("| the A/A spread of this run, on \\|log r\\| | 0.020 |");
    expect(text).toContain("| the noise cap | 0.058 = log(1.06). Above it, the run cannot decide. |");
    expect(text).toContain("| the pooled A/A spread, on \\|log r\\| | 0.020, from 10 A/A cases of 1 quiet runs. The floor is 0.049 = log(1.05). |");
    expect(text).toContain("| the margin of the rule `difference` | 0.049, so the band `same` is 0.952 to 1.050 |");
    expect(text).toContain("| the head against the parent | same |");
    expect(text).toContain("| head / parent | 1.000 | 1.050 | pass |");
    expect(text).toContain("| head / fixed base | 0.980 | 1.100 | pass |");
    expect(text).toContain("The 10 A/A round ratios of this run are 0.980, 1.000");
    expect(text).toContain("The reason of the home: The interval of the candidate median over the A/A median is");
    expect(text).toContain("| fixed base | 1020.0 ms |");
  });

  it("tells the next step of a noisy run: the retry after the first run, a fail after the second run", () => {
    const first = gateText(record(report(1, 1, NOISY))).join("\n");
    expect(first).toContain("# The sections time gate, run 1 of 2: cannot decide");
    expect(first).toContain("This run cannot decide. The home cannot decide the head against the parent. The A/A spread of the run is 0.1148, above the noise cap");
    expect(first).toContain("The job `retry` runs the gate once more on a fresh runner.");
    expect(gateExit(record(report(1, 1, NOISY)))).toBe(3);
    const second = gateText(record(report(1, 1, NOISY), null, 2)).join("\n");
    expect(second).toContain("# The sections time gate, run 2 of 2: cannot decide");
    expect(second).toContain("The gate fails. The home cannot decide");
    expect(second).toContain("The first run could not decide too, and such a run does not pass.");
    expect(gateExit(record(report(1, 1, NOISY), null, 2))).toBe(1);
    // A slower head fails at once, with no retry.
    expect(gateExit(record(report(1.19, 1.12)))).toBe(1);
  });
});

describe("checkLine", () => {
  it("writes a no read with the case, the rounds and the CPU model, and no line for a pass (NO-READ-LINE)", () => {
    expect(gateExit(record(report(0.9, 0.9)))).toBe(0);
    expect(checkLine(record(report(0.9, 0.9)))).toBeUndefined();
    const first = checkLine(record(report(1, 1, NOISY)))!;
    expect(first.level).toBe("warning");
    expect(first.line).toMatch(/^::warning title=Sections gate::run 1 of 2: No read of 1 case: The home cannot decide/);
    expect(first.line).toContain(`${GATE_ROUTER} on large-clustered, 10 rounds of each arm`);
    expect(first.line).toContain("The CPU model: Made-up CPU, 4 cores.");
    expect(first.line).toContain("The job retry times the gate on a fresh runner.");
    const second = checkLine(record(report(1, 1, NOISY), null, 2))!;
    expect(second.level).toBe("error");
    expect(second.line).toContain("run 2 of 2: No read of 1 case");
    const none = checkLine(record(null, "HEAD: the core does not load"))!;
    expect(none.level).toBe("error");
    expect(none.line).toContain("No read of 1 case: The job timed no arm");
    expect(none.line).toContain("HEAD: the core does not load");
    const slow = checkLine(record(report(1.19, 1.12)))!;
    expect(slow.level).toBe("error");
    expect(slow.line).toContain("run 1 of 2: The gate fails.");
    expect(slow.line).not.toContain("No read");
  });
});
