import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aaSpread, armOrder, pooledBand } from "@mark1russell7/rigor-bench";
import { InputError } from "./gates/inputs.ts";
import { aaId, pairedReport, type RawTimes } from "./gates/paired.ts";
import { COMMIT_ARM, PARENT_ARM, spreadOf } from "./gates/pair-confirm.ts";
import { homeVerdict, limitHome } from "./gates/home-verdict.ts";
import { checkLine, checkReads } from "./gates/lines.ts";
import {
  BASE_FILE,
  BASE_SCHEMA,
  FIXED_ARM,
  FIXED_LIMIT,
  GATE_MAX_ROUNDS,
  GATE_ROUNDS,
  GATE_ROUTER,
  GATE_SCHEMA,
  NOISE_CAP,
  PARENT_FLOOR,
  POOL_FILE,
  POOL_MAX_RUNS,
  POOL_SCHEMA,
  RETRY_FACTOR,
  SPREAD_LEVEL,
  attemptRounds,
  buildPool,
  fixedRecord,
  fixedVerdictOf,
  gateEnd,
  gateExit,
  gateOptions,
  gateText,
  gateVerdict,
  homeRecord,
  noReadText,
  parentVerdictOf,
  parseFixedBase,
  parsePool,
  poolEntry,
  poolOptions,
  ratioTimes,
  recordVerdict,
  sealRecord,
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
/** This function gives the A/A factors of a run of 20 rounds: the factors two times. */
const twice = (aa: readonly number[]): number[] => [...aa, ...aa];
/** The ids of the arms of the gate, in the order of the report. */
const IDS = [PARENT_ARM, COMMIT_ARM, FIXED_ARM, aaId(PARENT_ARM)];

/**
 * This function gives a made-up report of the gate on one input. The parent takes 1000 ms in each round, and each arm takes its factor times that.
 * A head of one number has that factor in each round, and a list gives the factor of each round.
 * The count of rounds is the length of `aa`. The report keeps the order of `armOrder` of the home in each round, as the job of the gate does.
 */
function report(head: number | readonly number[], fixed: number, aa: readonly number[] = QUIET, input = GATE_ROUTER) {
  const arms = IDS.map((id) => ({ id }));
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
    orders: Array.from({ length: n }, (_, k) => [...armOrder(IDS, k)]),
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
/** This function gives the limit verdict of the home on the head against the fixed base, in the form of the record. */
const fixedOf = (r: ReturnType<typeof report>) => fixedRecord(limitHome(r, GATE_ROUTER, FIXED_ARM, COMMIT_ARM, FIXED_LIMIT));
/** This function gives the result of the gate on a report, with the two verdicts of the home on the same report. */
const decide = (r: ReturnType<typeof report>, pool: AaPool = FLOOR) => gateVerdict(r, homeOf(r, pool), fixedOf(r));
/** This function gives the A/A spread of a list of ratios with the home: p90 of |log r|. */
const logSpread = (ratios: readonly number[]): number => aaSpread(ratioTimes(ratios, "run"), SPREAD_LEVEL);

const side = (c: string, subject: string) => ({ ref: c, sha: sha(c), subject });

/** This function gives a made-up record of the gate around a report. The rounds are the rounds of the report. */
function record(r: ReturnType<typeof report> | null, skipped: string | null = null, attempt: 1 | 2 = 1): GateRecord {
  return sealRecord({
    schema: GATE_SCHEMA,
    attempt,
    board: side("b", "made-up board"),
    fixture: "large-clustered",
    router: GATE_ROUTER,
    rounds: r === null ? attemptRounds(GATE_ROUNDS, attempt) : r.inputs[0]!.ms[PARENT_ARM]!.length,
    head: { ...side("e", "feat(core): made-up change"), ref: "HEAD" },
    parent: { ...side("a", "made-up parent"), ref: "HEAD^1" },
    fixed: side("f", "made-up fixed base"),
    fixedBase: { schema: BASE_SCHEMA, commit: sha("f"), date: "2026-11-02", reason: "The made-up first base." },
    skipped,
    env: { ...ENV, mode: "fresh", context: "test" },
    report: r,
    home: r === null ? null : homeOf(r),
    fixedCheck: r === null ? null : fixedOf(r),
  });
}

/** A noisy run: the home cannot decide the head against the parent. The fixed base takes 1.05 times the parent, so the head is within the limit of the fixed base. */
const noisy = (rounds: 10 | 20 = 10) => report(1, 1.05, rounds === 10 ? NOISY : twice(NOISY));

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

  it("maps the outcomes of the limit verdict: beyond fails, cannot decide starts the retry, within passes", () => {
    expect(fixedVerdictOf("beyond")).toBe("fail");
    expect(fixedVerdictOf("cannot decide")).toBe("cannot decide");
    expect(fixedVerdictOf("within")).toBe("pass");
  });

  it("ends a run that cannot decide with the retry after the first run, and with a no read after the second run", () => {
    expect(gateEnd("pass", 1)).toBe("pass");
    expect(gateEnd("fail", 2)).toBe("fail");
    expect(gateEnd("cannot decide", 1)).toBe("retry");
    expect(gateEnd("cannot decide", 2)).toBe("no read");
    expect(noReadText(20)).toBe("no read: cannot decide at 20 rounds");
  });

  it("times 2 times the rounds in the second run, at most 20", () => {
    expect(RETRY_FACTOR).toBe(2);
    expect(attemptRounds(GATE_ROUNDS, 1)).toBe(10);
    expect(attemptRounds(GATE_ROUNDS, 2)).toBe(20);
    expect(attemptRounds(15, 2)).toBe(GATE_MAX_ROUNDS);
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
    expect(g.fixedCheck!.outcome).toBe("within");
    expect(g.fixedCheck!.rounds).toBe(10);
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
    // The rounds against the fixed base are as wide, so the limit verdict cannot decide too.
    expect(g.checks[1].verdict).toBe("cannot decide");
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
    // A check against the fixed base that is beyond fails a noisy run too. The noise of these A/A rounds is |log 0.9| = 0.105.
    // So the floor of a head 1.3 times the fixed base is 1.3 x 0.9 = 1.17, above the limit 1.10.
    const beyond = decide(report(1.3, 1, NOISY), POOLED);
    expect(beyond.checks[1].verdict).toBe("fail");
    expect(beyond.outcome).toBe("fail");
  });

  it("fails a slow drift of 15 % against the fixed base, when the step against the parent passes", () => {
    // The head is the same as the parent, and the parent is 1.15 times the fixed base: the fixed base takes 1 / 1.15 of the parent.
    // The noise of the quiet A/A rounds is |log 0.98| = 0.020, so the floor 1.15 x 0.98 = 1.127 is above the limit 1.10.
    const g = decide(report(1, 1 / 1.15));
    expect(g.checks[0].verdict).toBe("pass");
    expect(g.checks[1].ratio).toBeCloseTo(1.15, 10);
    expect(g.fixedCheck!.floor!).toBeGreaterThan(FIXED_LIMIT);
    expect(g.checks[1].verdict).toBe("fail");
    expect(g.pass).toBe(false);
    expect(g.reason).toContain("The home finds the head beyond the limit 1.10 of the fixed base (ratio 1.150");
  });

  it("cannot decide a drift of 8 % or 12 % at 10 rounds, and decides each at 20 rounds", () => {
    // The old rule compared the ratio of the medians with 1.10. It passed 1.08 and failed 1.12 with no interval and no noise.
    // The limit verdict widens the interval of the median by the A/A noise of the same rounds. At 10 rounds, 1.08 and 1.12 are in that zone.
    for (const drift of [1.08, 1.12]) {
      const g = decide(report(1, 1 / drift));
      expect(g.checks[1].ratio).toBeCloseTo(drift, 10);
      expect(g.fixedCheck!.floor!).toBeLessThanOrEqual(FIXED_LIMIT);
      expect(g.fixedCheck!.bound!).toBeGreaterThan(FIXED_LIMIT);
      expect(g.checks[1].verdict).toBe("cannot decide");
      expect(g.outcome).toBe("cannot decide");
    }
    // At 20 rounds, the interval of the A/A median is 0.99 to 1.01, so the noise falls to 0.010.
    const slow = decide(report(1, 1 / 1.08, twice(QUIET)));
    expect(slow.fixedCheck!.rounds).toBe(20);
    expect(slow.fixedCheck!.noise!).toBeCloseTo(Math.log(1 / 0.99), 10);
    expect(slow.checks[1].verdict).toBe("pass");
    expect(decide(report(1, 1 / 1.12, twice(QUIET))).checks[1].verdict).toBe("fail");
  });

  it("refuses the order of a report that does not put each arm of a pair first equally often", () => {
    // The local order of the fresh mode turns the arms by 1 in each round. The commit then runs before the fixed base in 3 of each 4 rounds.
    const { orders, ...old } = report(1, 1);
    expect(orders).toHaveLength(10);
    expect(() => limitHome(old, GATE_ROUTER, FIXED_ARM, COMMIT_ARM, FIXED_LIMIT)).toThrow(RangeError);
  });

  it("gives not measured for a report with no input of the router, and the gate does not pass", () => {
    const g = decide(report(1, 1, QUIET, "sections"));
    expect(g.checks.map((c) => c.verdict)).toEqual(["not measured", "not measured"]);
    expect(g.outcome).toBe("fail");
    expect(gateVerdict(report(1, 1), null, null).outcome).toBe("fail");
    // A run with no limit verdict fails, also when the home passes the head against the parent.
    const r = report(1, 1);
    expect(gateVerdict(r, homeOf(r), null).checks[1].verdict).toBe("not measured");
    expect(gateVerdict(r, homeOf(r), null).outcome).toBe("fail");
  });

  it("refuses a report with no fixed base arm", () => {
    const other = pairedReport("fresh", ENV, "test", [{ id: PARENT_ARM }, { id: COMMIT_ARM }, { id: aaId(PARENT_ARM) }], [{ id: GATE_ROUTER }], {
      ms: new Map([[GATE_ROUTER, new Map([[PARENT_ARM, [1]], [COMMIT_ARM, [1]], [aaId(PARENT_ARM), [1]]])]]),
      peak: new Map([[GATE_ROUTER, new Map()]]),
    });
    expect(() => gateVerdict(other, null, null)).toThrow(RangeError);
  });
});

describe("the record of the gate", () => {
  it("fails a record with no report", () => {
    const g = recordVerdict(record(null, "HEAD: the core does not load"));
    expect(record(null).end).toBe("fail");
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
    expect(r.end).toBe("pass");
    expect(r.noRead).toBeNull();
    // The record keeps the order of each round, so a reader takes the arm that ran first from it.
    expect(r.report!.orders).toHaveLength(10);
    expect(r.report!.orders![1]).toEqual([...armOrder(IDS, 1)]);
    const text = gateText(r).join("\n");
    expect(text).toContain("# The sections time gate, run 1 of 2: pass");
    expect(text).toContain("Each arm has 10 rounds. `armOrder` of the home gives the order of the arms in each round, and the record keeps it.");
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
    expect(text).toContain("| the median of the round ratios | 0.980, over 10 rounds |");
    expect(text).toContain("| the A/A noise of the rounds, on \\|log r\\| | 0.020 |");
    expect(text).toContain("| the outcome | within |");
    expect(text).toContain("The reason of the limit verdict: ");
    expect(text).toContain("The 10 A/A round ratios of this run are 0.980, 1.000");
    expect(text).toContain("The reason of the home: The interval of the candidate median over the A/A median is");
    expect(text).toContain("| fixed base | 1020.0 ms |");
  });

  it("tells the next step of a noisy run: the retry after the first run, a no read that fails after the second run", () => {
    const one = record(noisy());
    expect(one.end).toBe("retry");
    const first = gateText(one).join("\n");
    expect(first).toContain("# The sections time gate, run 1 of 2: retry");
    expect(first).toContain("This run cannot decide at 10 rounds. The home cannot decide the head against the parent. The A/A spread of the run is 0.1148, above the noise cap");
    expect(first).toContain("The job `retry` runs the gate once more on a fresh runner, with 20 rounds.");
    expect(gateExit(one)).toBe(3);
    // The second run times 20 rounds and cannot decide too. That is a no read, and a no read fails: it is not a pass and not a skip.
    const two = record(noisy(20), null, 2);
    expect(two.rounds).toBe(20);
    expect(two.end).toBe("no read");
    expect(two.noRead).toBe("no read: cannot decide at 20 rounds");
    expect(recordVerdict(two).pass).toBe(false);
    const second = gateText(two).join("\n");
    expect(second).toContain("# The sections time gate, run 2 of 2: no read: cannot decide at 20 rounds");
    expect(second).toContain("**The gate fails with a no read: cannot decide at 20 rounds.** The home cannot decide");
    expect(second).toContain("The first run could not decide too. A run that cannot decide does not pass.");
    expect(gateExit(two)).toBe(1);
    // A slower head fails at once, with no retry.
    expect(gateExit(record(report(1.19, 1.12)))).toBe(1);
  });

  it("fails a drift of 12 % in the second run, which the first run cannot decide", () => {
    const first = record(report(1, 1 / 1.12));
    expect(first.end).toBe("retry");
    expect(gateExit(first)).toBe(3);
    const second = record(report(1, 1 / 1.12, twice(QUIET)), null, 2);
    expect(second.end).toBe("fail");
    expect(second.noRead).toBeNull();
    expect(gateExit(second)).toBe(1);
  });
});

describe("checkLine", () => {
  it("gives a read of each check, and a line with the cases, the reason and the CPU model for a run that does not pass (NO-READ-LINE)", () => {
    const read = `${GATE_ROUTER} on large-clustered, 10 rounds of each arm`;
    expect(gateExit(record(report(0.9, 0.9)))).toBe(0);
    expect(checkLine(record(report(0.9, 0.9)))).toBeUndefined();
    expect(checkReads(record(report(0.9, 0.9))).map((c) => c.outcome)).toEqual(["pass", "pass"]);
    const first = checkLine(record(noisy()))!;
    expect(first.level).toBe("warning");
    expect(first.title).toBe("Sections gate, run 1 of 2");
    expect(first.noReads.cases).toEqual([`${read}, against the parent`]);
    expect(first.text).toContain(`no read for 1 of 2 cases: ${read}, against the parent. The home cannot decide`);
    expect(first.text).toContain("The job retry times the gate on a fresh runner, with 2 times the rounds. Jobs on 1 CPU model: Made-up CPU (1 job). A no read is not a pass.");
    const second = checkLine(record(noisy(20), null, 2))!;
    expect(second.level).toBe("error");
    expect(second.title).toBe("Sections gate, run 2 of 2");
    expect(second.noReads.cases).toEqual([`${GATE_ROUTER} on large-clustered, 20 rounds of each arm, against the parent`]);
    expect(second.text).toContain("The gate fails with a no read: cannot decide at 20 rounds. The first run could not decide too.");
    const none = checkLine(record(null, "HEAD: the core does not load"))!;
    expect(none.level).toBe("error");
    expect(none.noReads.count).toBe(2);
    expect(none.text).toContain("The job timed no arm, so the run fails (FAIL-CLOSED). HEAD: the core does not load The gate fails (FAIL-CLOSED).");
    const slow = checkLine(record(report(1.19, 1.12)))!;
    expect(slow.level).toBe("error");
    expect(slow.outcome).toBe("block");
    expect(slow.noReads.count).toBe(0);
    expect(slow.text).toContain("The gate fails.");
  });
});
