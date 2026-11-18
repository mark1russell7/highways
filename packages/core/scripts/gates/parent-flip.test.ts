import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIXED_ARM, GATE_SCHEMA, PARENT_SLOWER_TEXT } from "../sections-gate-verdict.ts";
import { InputError } from "./inputs.ts";
import { COMMIT_ARM } from "./pair-confirm.ts";
import { PARENT_RUN_FILE, PARENT_RUN_SCHEMA, parentFlip, parseParentRun, replayRun, slowedReport } from "./parent-flip.ts";
import { judge, PARENT_WANT } from "./flip.ts";

const TEXT = readFileSync(new URL(`../../${PARENT_RUN_FILE}`, import.meta.url), "utf8");
const RUN = parseParentRun(TEXT);
const REPORT = RUN.record.report!;

describe("the fixture of the flip of the check against the parent", () => {
  it("is a quiet run of the gate that the home finds the same as its parent", () => {
    expect(RUN.record.schema).toBe(GATE_SCHEMA);
    expect(RUN.record.home?.outcome).toBe("same");
    expect(RUN.record.home?.noise?.noisy).toBe(false);
    expect(RUN.record.end).toBe("pass");
  });

  it("replays to the verdicts of its record with the code of this checkout", () => {
    const again = replayRun(RUN.record, REPORT, RUN.pool);
    expect(again.home).toEqual(RUN.record.home);
    expect(again.fixedCheck).toEqual(RUN.record.fixedCheck);
    expect(again.end).toBe(RUN.record.end);
  });

  it("refuses a file of another schema, a record with no report and a bad pool", () => {
    const value = JSON.parse(TEXT) as Record<string, unknown>;
    const record = value["record"] as Record<string, unknown>;
    expect(() => parseParentRun("{")).toThrow(InputError);
    expect(() => parseParentRun(JSON.stringify({ ...value, schema: "other" }))).toThrow(InputError);
    expect(() => parseParentRun(JSON.stringify({ ...value, record: { ...record, report: null } }))).toThrow(InputError);
    expect(() => parseParentRun(JSON.stringify({ ...value, pool: { schema: "other", runs: [] } }))).toThrow(InputError);
    expect(parseParentRun(TEXT).schema).toBe(PARENT_RUN_SCHEMA);
  });
});

describe("slowedReport", () => {
  it("gives the same report for a factor of 1", () => {
    expect(slowedReport(REPORT, RUN.record.router, COMMIT_ARM, 1)).toEqual(REPORT);
  });

  it("multiplies the times, the median and the ratio of one arm, and keeps each other arm and the order of each round", () => {
    const slow = slowedReport(REPORT, RUN.record.router, COMMIT_ARM, 2);
    const [row, before] = [slow.inputs[0]!, REPORT.inputs[0]!];
    expect(row.ms[COMMIT_ARM]).toEqual(before.ms[COMMIT_ARM]!.map((t) => t * 2));
    expect(row.median[COMMIT_ARM]).toBeCloseTo(before.median[COMMIT_ARM]! * 2, 9);
    expect(row.ratio[COMMIT_ARM]).toBeCloseTo(before.ratio[COMMIT_ARM]! * 2, 12);
    expect(row.ms[FIXED_ARM]).toEqual(before.ms[FIXED_ARM]);
    expect(slow.orders).toEqual(REPORT.orders);
  });

  it("refuses a factor that is not a finite number above 0", () => {
    expect(() => slowedReport(REPORT, RUN.record.router, COMMIT_ARM, 0)).toThrow(RangeError);
    expect(() => slowedReport(REPORT, RUN.record.router, COMMIT_ARM, Number.NaN)).toThrow(RangeError);
  });
});

describe("parentFlip", () => {
  const flip = parentFlip(RUN);

  it("gives a clean arm that passes, in the words of the home the same", () => {
    const arm = judge(flip.clean, PARENT_WANT.clean);
    expect(arm.ok).toBe(true);
    expect(flip.clean.text).toContain("pass, in the words of the home same");
  });

  it("gives a slower arm that fails on the check against the parent only", () => {
    const arm = judge(flip.slower, PARENT_WANT.slower);
    expect(arm.ok).toBe(true);
    expect(flip.slower.exit).toBe(1);
    expect(flip.slower.text).toContain(PARENT_SLOWER_TEXT);
    expect(flip.slower.text).toContain("in the words of the home slower");
  });

  it("slows the head by the margin of the check, and moves the interval of the home by exactly that factor", () => {
    const clean = replayRun(RUN.record, REPORT, RUN.pool);
    const slower = replayRun(RUN.record, slowedReport(REPORT, RUN.record.router, COMMIT_ARM, flip.factor), RUN.pool);
    expect(flip.factor).toBeCloseTo(Math.exp(clean.home!.margin!), 12);
    expect(slower.home!.margin).toBe(clean.home!.margin);
    expect(slower.home!.low! / clean.home!.low!).toBeCloseTo(flip.factor, 12);
    expect(slower.home!.high! / clean.home!.high!).toBeCloseTo(flip.factor, 12);
    expect(slower.home!.low!).toBeGreaterThan(1);
    expect(slower.fixedCheck!.outcome).toBe("within");
  });
});
