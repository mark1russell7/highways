import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InputError } from "./gates/inputs.ts";
import { aaId, pairedReport, type RawTimes } from "./gates/paired.ts";
import { COMMIT_ARM, PARENT_ARM, spreadOf } from "./gates/pair-confirm.ts";
import {
  BASE_FILE,
  BASE_SCHEMA,
  FIXED_ARM,
  FIXED_LIMIT,
  GATE_ROUTER,
  GATE_SCHEMA,
  MIN_EFFECT,
  NOISE_CAP,
  POOL_FILE,
  POOL_MAX_RUNS,
  POOL_MIN_RUNS,
  POOL_SCHEMA,
  buildPool,
  gateExit,
  gateText,
  gateVerdict,
  parentLimit,
  parseFixedBase,
  parsePool,
  poolBand,
  poolEntry,
  recordVerdict,
  type GateRecord,
  type PoolRun,
} from "./sections-gate-verdict.ts";

// Made-up times only. No test reads a clock or starts a process.
const ENV = { cpu: "Made-up CPU", cores: 4, os: "test", arch: "x64", node: "v0" };
const sha = (c: string): string => c.repeat(40);
/** The A/A factors of 10 rounds. Their spread is p90 of |r - 1|: 0.02. */
const QUIET = [0.98, 1, 1.02, 0.99, 1.01, 1, 0.98, 1.02, 1, 1];
/** Noisy A/A factors. Their spread is 0.12, above the noise cap 0.06. */
const NOISY = [0.88, 1, 1.12, 0.94, 1.06, 1, 0.9, 1.1, 1, 1];
/** A/A factors with the spread 0.055: wider than the minimum effect 0.05, and below the noise cap 0.06. */
const BUSY = [0.945, 1, 1.055, 0.97, 1.03, 1, 0.95, 1.05, 1, 1];

/** This function gives a made-up report of the gate on one input. The parent takes 1000 ms in each round, and each arm takes its factor times that. */
function report(head: number, fixed: number, aa: readonly number[] = QUIET, input = GATE_ROUTER) {
  const arms = [{ id: PARENT_ARM }, { id: COMMIT_ARM }, { id: FIXED_ARM }, { id: aaId(PARENT_ARM) }];
  const n = aa.length;
  const raw: RawTimes = {
    ms: new Map([
      [
        input,
        new Map([
          [PARENT_ARM, Array.from({ length: n }, () => 1000)],
          [COMMIT_ARM, Array.from({ length: n }, () => 1000 * head)],
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
/** The band of a pool with too few runs: the floor 1.05. */
const FLOOR = poolBand({ schema: POOL_SCHEMA, runs: [poolRun(1)] });
/** The band of a pool of 5 runs with the spread 0.055: the limit 1.055. */
const POOLED = poolBand({ schema: POOL_SCHEMA, runs: [1, 2, 3, 4, 5].map((r) => poolRun(r, BUSY)) });

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
    parent: side("a", "made-up parent"),
    fixed: side("f", "made-up fixed base"),
    fixedBase: { schema: BASE_SCHEMA, commit: sha("f"), date: "2026-11-02", reason: "The made-up first base." },
    band: FLOOR,
    skipped,
    env: { ...ENV, mode: "fresh", context: "test" },
    report: r,
    home: r === null ? null : { outcome: "same", reason: "A made-up verdict of the home.", low: 0.99, high: 1.01 },
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

describe("the pool of A/A rounds", () => {
  it("reads the pool of the repository: each run is quiet, with its CPU model and its 10 ratios", () => {
    const pool = parsePool(readFileSync(new URL(`../${POOL_FILE}`, import.meta.url), "utf8"));
    expect(pool.runs.length).toBeGreaterThan(0);
    for (const r of pool.runs) {
      expect(r.spread).toBeLessThanOrEqual(NOISE_CAP);
      expect(r.ratios).toHaveLength(10);
      expect(r.cpu.length).toBeGreaterThan(0);
    }
    const band = poolBand(pool);
    expect(band.limit).toBeGreaterThanOrEqual(1 + MIN_EFFECT);
    if (!band.pooled) expect(band.limit).toBe(1 + MIN_EFFECT);
  });

  it("refuses a pool with a noisy run, a wrong spread, a run two times or another schema", () => {
    const ok = { schema: POOL_SCHEMA, runs: [poolRun(1)] };
    expect(parsePool(JSON.stringify(ok)).runs).toHaveLength(1);
    expect(() => parsePool("{")).toThrow(InputError);
    expect(() => parsePool(JSON.stringify({ ...ok, schema: "other" }))).toThrow(InputError);
    expect(() => parsePool(JSON.stringify({ ...ok, runs: [poolRun(1, NOISY)] }))).toThrow(InputError);
    expect(() => parsePool(JSON.stringify({ ...ok, runs: [{ ...poolRun(1), spread: 0.01 }] }))).toThrow(InputError);
    expect(() => parsePool(JSON.stringify({ ...ok, runs: [poolRun(1), poolRun(1)] }))).toThrow(InputError);
    expect(() => parsePool(JSON.stringify({ ...ok, runs: [{ ...poolRun(1), commit: "abc" }] }))).toThrow(InputError);
    // The job retry of the same run is a second run of the pool.
    expect(parsePool(JSON.stringify({ ...ok, runs: [poolRun(1), poolRun(1, QUIET, "retry")] })).runs).toHaveLength(2);
  });

  it("uses the floor 1.05 until the pool has 5 runs, then 1 + max(0.05, the pooled spread)", () => {
    expect(FLOOR.pooled).toBe(false);
    expect(FLOOR.limit).toBe(1 + MIN_EFFECT);
    const four = poolBand({ schema: POOL_SCHEMA, runs: [1, 2, 3, 4].map((r) => poolRun(r, BUSY)) });
    expect(four.runs).toBe(POOL_MIN_RUNS - 1);
    expect(four.spread).toBeCloseTo(0.055, 10);
    expect(four.limit).toBe(1 + MIN_EFFECT);
    expect(POOLED.pooled).toBe(true);
    expect(POOLED.ratios).toBe(50);
    expect(POOLED.limit).toBeCloseTo(1.055, 10);
    // A quiet pool keeps the floor: 1 + max(0.05, 0.02).
    expect(poolBand({ schema: POOL_SCHEMA, runs: [1, 2, 3, 4, 5].map((r) => poolRun(r)) }).limit).toBeCloseTo(1.05, 10);
    expect(poolBand({ schema: POOL_SCHEMA, runs: [] }).spread).toBeNull();
    expect(parentLimit(0.12)).toBeCloseTo(1.12, 10);
  });

  it("keeps only the quiet records, the newest first, and at most 20 runs", () => {
    const facts = { run: 7, job: "gate" as const, date: "2026-11-02" };
    const quiet = poolEntry(record(report(1, 1)), facts);
    expect(quiet.kept).toBe(true);
    if (quiet.kept) {
      expect(quiet.run.parent).toBe(sha("a"));
      expect(quiet.run.spread).toBeCloseTo(0.02, 10);
      expect(quiet.run.ratios).toHaveLength(10);
    }
    const noisy = poolEntry(record(report(1, 1, NOISY)), facts);
    expect(noisy.kept).toBe(false);
    if (!noisy.kept) expect(noisy.reason).toContain("above the cap 0.06");
    expect(poolEntry(record(null, "no load"), facts).kept).toBe(false);
    expect(poolEntry({ ...record(report(1, 1)), schema: "other/1" }, facts).kept).toBe(false);
    const many = Array.from({ length: 25 }, (_, i) => poolRun(i + 1));
    const pool = buildPool([...many, poolRun(3)]);
    expect(pool.runs).toHaveLength(POOL_MAX_RUNS);
    expect(pool.runs[0]!.run).toBe(25);
    expect(pool.runs.at(-1)!.run).toBe(6);
  });
});

describe("the checks of the gate", () => {
  it("passes a ratio inside the band on the one input of the gate", () => {
    const g = gateVerdict(report(1.03, 1.02), FLOOR);
    expect(g.parent!.aa).toHaveLength(10);
    expect(g.parent!.spread).toBeCloseTo(0.02, 10);
    expect(g.checks[0].ratio).toBeCloseTo(1.03, 10);
    expect(g.checks[0].limit).toBeCloseTo(1.05, 10);
    expect(g.checks[0].verdict).toBe("pass");
    // The ratio head/fixed base is 1.03 / 1.02.
    expect(g.checks[1].ratio).toBeCloseTo(1.03 / 1.02, 10);
    expect(g.checks[1].limit).toBe(FIXED_LIMIT);
    expect(g.checks[1].verdict).toBe("pass");
    expect(g.outcome).toBe("pass");
    expect(g.words).toBe("same");
    expect(g.pass).toBe(true);
    expect(gateVerdict(report(0.9, 0.9), FLOOR).words).toBe("faster");
  });

  it("fails a ratio above 1 + 0.05 against the parent", () => {
    const g = gateVerdict(report(1.06, 1.06), FLOOR);
    expect(g.checks[0].verdict).toBe("fail");
    expect(g.checks[1].verdict).toBe("pass");
    expect(g.words).toBe("slower");
    expect(g.outcome).toBe("fail");
    expect(g.pass).toBe(false);
  });

  it("takes the limit from the pool, not from the spread of the run", () => {
    // The run has the spread 0.055. The limit stays 1.05 while the pool has too few runs.
    expect(gateVerdict(report(1.053, 1, BUSY), FLOOR).checks[0].verdict).toBe("fail");
    expect(gateVerdict(report(1.053, 1, BUSY), POOLED).checks[0].verdict).toBe("pass");
    expect(gateVerdict(report(1.06, 1), POOLED).checks[0].verdict).toBe("fail");
  });

  it("cannot decide on a run with an A/A spread above the cap, at each ratio", () => {
    for (const head of [0.8, 1, 1.09]) {
      const g = gateVerdict(report(head, head, NOISY), POOLED);
      expect(g.parent!.spread).toBeCloseTo(0.12, 10);
      expect(g.noisy).toBe(true);
      expect(g.checks[0].verdict).toBe("cannot decide");
      expect(g.words).toBe("cannot decide");
      expect(g.outcome).toBe("cannot decide");
      expect(g.pass).toBe(false);
    }
    // A failed check against the fixed base fails a noisy run too: the check against the fixed base does not change.
    expect(gateVerdict(report(1.2, 1, NOISY), POOLED).outcome).toBe("fail");
  });

  it("fails a slow drift against the fixed base, when each step against the parent passes", () => {
    // The head is 1.04 times the parent, and the parent is 1.08 times the fixed base: the fixed base takes 1 / 1.08 of the parent.
    const g = gateVerdict(report(1.04, 1 / 1.08), FLOOR);
    expect(g.checks[0].verdict).toBe("pass");
    expect(g.checks[1].ratio).toBeCloseTo(1.04 * 1.08, 10);
    expect(g.checks[1].verdict).toBe("fail");
    expect(g.pass).toBe(false);
  });

  it("gives not measured for a report with no input of the router, and the gate does not pass", () => {
    const g = gateVerdict(report(1, 1, QUIET, "sections"), FLOOR);
    expect(g.checks.map((c) => c.verdict)).toEqual(["not measured", "not measured"]);
    expect(g.outcome).toBe("fail");
    expect(g.pass).toBe(false);
  });

  it("refuses a report with no fixed base arm", () => {
    const other = pairedReport("fresh", ENV, "test", [{ id: PARENT_ARM }, { id: COMMIT_ARM }, { id: aaId(PARENT_ARM) }], [{ id: GATE_ROUTER }], {
      ms: new Map([[GATE_ROUTER, new Map([[PARENT_ARM, [1]], [COMMIT_ARM, [1]], [aaId(PARENT_ARM), [1]]])]]),
      peak: new Map([[GATE_ROUTER, new Map()]]),
    });
    expect(() => gateVerdict(other, FLOOR)).toThrow(RangeError);
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

  it("writes the outcome, the noise, the checks, the verdict of the home and the times", () => {
    const text = gateText(record(report(1.03, 1.02))).join("\n");
    expect(text).toContain("# The sections time gate, run 1 of 2: pass");
    expect(text).toContain("The gate passes. The head is 1.030 times the parent (limit 1.050)");
    expect(text).toContain("| the A/A spread of this run | 0.020 |");
    expect(text).toContain("| the noise cap | 0.06. Above it, the run cannot decide. |");
    expect(text).toContain("| the pooled A/A spread | 0.020, from 10 A/A ratios of 1 quiet runs. The pool has fewer than 5 runs, so the limit uses the floor 0.05 |");
    expect(text).toContain("| the head against the parent | same |");
    expect(text).toContain("| head / parent | 1.030 | 1.050 | pass |");
    expect(text).toContain("| head / fixed base | 1.010 | 1.100 | pass |");
    expect(text).toContain("The 10 A/A round ratios of this run are 0.980, 1.000");
    expect(text).toContain("on the same rounds: **same**. Its interval is 0.990 to 1.010.");
    expect(text).toContain("| fixed base | 1020.0 ms |");
  });

  it("tells the next step of a noisy run: the retry after the first run, a fail after the second run", () => {
    const first = gateText(record(report(1, 1, NOISY))).join("\n");
    expect(first).toContain("# The sections time gate, run 1 of 2: cannot decide");
    expect(first).toContain("This run cannot decide. The A/A spread of the run is 0.120, above the noise cap 0.06, so the run cannot decide.");
    expect(first).toContain("The job `retry` runs the gate once more on a fresh runner.");
    expect(gateExit(record(report(1, 1, NOISY)))).toBe(3);
    const second = gateText(record(report(1, 1, NOISY), null, 2)).join("\n");
    expect(second).toContain("# The sections time gate, run 2 of 2: cannot decide");
    expect(second).toContain("The gate fails. The A/A spread of the run is 0.120");
    expect(second).toContain("The first run was noisy too, and a noisy run does not pass.");
    expect(gateExit(record(report(1, 1, NOISY), null, 2))).toBe(1);
  });
});
