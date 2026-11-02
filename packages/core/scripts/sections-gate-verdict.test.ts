import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InputError } from "./gates/inputs.ts";
import { aaId, pairedReport, type RawTimes } from "./gates/paired.ts";
import { COMMIT_ARM, PARENT_ARM } from "./gates/pair-confirm.ts";
import {
  BASE_FILE,
  BASE_SCHEMA,
  FIXED_ARM,
  FIXED_LIMIT,
  GATE_ROUTER,
  GATE_SCHEMA,
  MIN_EFFECT,
  gateText,
  gateVerdict,
  parentLimit,
  parseFixedBase,
  recordVerdict,
  type GateRecord,
} from "./sections-gate-verdict.ts";

// Made-up times only. No test reads a clock or starts a process.
const ENV = { cpu: "Made-up CPU", cores: 4, os: "test", arch: "x64", node: "v0" };
const sha = (c: string): string => c.repeat(40);
/** The A/A factors of 10 rounds. Their spread is p90 of |r - 1|: 0.02. */
const QUIET = [0.98, 1, 1.02, 0.99, 1.01, 1, 0.98, 1.02, 1, 1];
/** Noisy A/A factors. Their spread is 0.12, wider than the minimum effect 0.05. */
const NOISY = [0.88, 1, 1.12, 0.94, 1.06, 1, 0.9, 1.1, 1, 1];

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

const side = (c: string, subject: string) => ({ ref: c, sha: sha(c), subject });

/** This function gives a made-up record of the gate around a report. */
function record(r: ReturnType<typeof report> | null, skipped: string | null = null): GateRecord {
  return {
    schema: GATE_SCHEMA,
    board: side("b", "made-up board"),
    fixture: "large-clustered",
    router: GATE_ROUTER,
    rounds: 10,
    head: { ...side("e", "feat(core): made-up change"), ref: "HEAD" },
    parent: side("a", "made-up parent"),
    fixed: side("f", "made-up fixed base"),
    fixedBase: { schema: BASE_SCHEMA, commit: sha("f"), date: "2026-11-02", reason: "The made-up first base." },
    skipped,
    env: { ...ENV, mode: "fresh", context: "test" },
    report: r,
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

describe("the checks of the gate", () => {
  it("gives the limit 1 + max(0.05, spread) against the parent", () => {
    expect(parentLimit(0.02)).toBeCloseTo(1 + MIN_EFFECT, 10);
    expect(parentLimit(0.12)).toBeCloseTo(1.12, 10);
    expect(parentLimit(Number.NaN)).toBeNull();
  });

  it("passes a ratio inside the band on the one input of the gate", () => {
    const g = gateVerdict(report(1.03, 1.02));
    expect(g.parent!.aa).toHaveLength(10);
    expect(g.parent!.spread).toBeCloseTo(0.02, 10);
    expect(g.checks[0].ratio).toBeCloseTo(1.03, 10);
    expect(g.checks[0].limit).toBeCloseTo(1.05, 10);
    expect(g.checks[0].verdict).toBe("pass");
    // The ratio head/fixed base is 1.03 / 1.02.
    expect(g.checks[1].ratio).toBeCloseTo(1.03 / 1.02, 10);
    expect(g.checks[1].limit).toBe(FIXED_LIMIT);
    expect(g.checks[1].verdict).toBe("pass");
    expect(g.pass).toBe(true);
  });

  it("fails a ratio above 1 + 0.05 against the parent", () => {
    const g = gateVerdict(report(1.06, 1.06));
    expect(g.checks[0].verdict).toBe("fail");
    expect(g.checks[1].verdict).toBe("pass");
    expect(g.pass).toBe(false);
  });

  it("takes the A/A spread when it is wider than the minimum effect", () => {
    const g = gateVerdict(report(1.08, 1, NOISY));
    expect(g.parent!.spread).toBeCloseTo(0.12, 10);
    expect(g.checks[0].limit).toBeCloseTo(1.12, 10);
    expect(g.checks[0].verdict).toBe("pass");
    expect(gateVerdict(report(1.13, 1.13, NOISY)).checks[0].verdict).toBe("fail");
  });

  it("fails a slow drift against the fixed base, when each step against the parent passes", () => {
    // The head is 1.04 times the parent, and the parent is 1.08 times the fixed base: the fixed base takes 1 / 1.08 of the parent.
    const g = gateVerdict(report(1.04, 1 / 1.08));
    expect(g.checks[0].verdict).toBe("pass");
    expect(g.checks[1].ratio).toBeCloseTo(1.04 * 1.08, 10);
    expect(g.checks[1].verdict).toBe("fail");
    expect(g.pass).toBe(false);
  });

  it("gives not measured for a report with no input of the router, and the gate does not pass", () => {
    const g = gateVerdict(report(1, 1, QUIET, "sections"));
    expect(g.checks.map((c) => c.verdict)).toEqual(["not measured", "not measured"]);
    expect(g.pass).toBe(false);
  });

  it("refuses a report with no fixed base arm", () => {
    const other = pairedReport("fresh", ENV, "test", [{ id: PARENT_ARM }, { id: COMMIT_ARM }, { id: aaId(PARENT_ARM) }], [{ id: GATE_ROUTER }], {
      ms: new Map([[GATE_ROUTER, new Map([[PARENT_ARM, [1]], [COMMIT_ARM, [1]], [aaId(PARENT_ARM), [1]]])]]),
      peak: new Map([[GATE_ROUTER, new Map()]]),
    });
    expect(() => gateVerdict(other)).toThrow(RangeError);
  });
});

describe("the record of the gate", () => {
  it("fails a record with no report", () => {
    const g = recordVerdict(record(null, "HEAD: the core does not load"));
    expect(g.pass).toBe(false);
    expect(g.checks.map((c) => c.verdict)).toEqual(["not measured", "not measured"]);
    const text = gateText(record(null, "HEAD: the core does not load")).join("\n");
    expect(text).toContain("# The sections time gate: fail");
    expect(text).toContain("**The job timed no arm:** HEAD: the core does not load");
  });

  it("writes the checks, the A/A ratios and the times", () => {
    const text = gateText(record(report(1.03, 1.02))).join("\n");
    expect(text).toContain("# The sections time gate: pass");
    expect(text).toContain("| head / parent | 1.030 | 1.050 | pass |");
    expect(text).toContain("| head / fixed base | 1.010 | 1.100 | pass |");
    expect(text).toContain("over its 10 A/A round ratios: 0.020.");
    expect(text).toContain("| fixed base | 1020.0 ms |");
    expect(text).not.toContain("is not below 0.10");
    expect(gateText(record(report(1, 1, NOISY.map((f) => (f === 1 ? 1 : 1 + (f - 1) * 1.5)))))).toContain(
      "The A/A spread 0.180 is not below 0.10, so the noise of this job is as large as the step that the check against the fixed base finds.",
    );
  });
});
