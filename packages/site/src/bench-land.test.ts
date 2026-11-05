import { describe, expect, it } from "vitest";
import { isLaterRecord, metaOfRun, recordFault } from "./bench-land.ts";

const SHA = "a".repeat(40);
const run = (time: string) => metaOfRun({ run: 7, sha: SHA, time, core: "0.14.0", max: 100000 });

describe("metaOfRun", () => {
  it("takes the date from the time of the run", () => {
    expect(run("2026-11-05T03:56:34Z")).toEqual({ run: 7, sha: SHA, date: "2026-11-05", time: "2026-11-05T03:56:34Z", core: "0.14.0", max: 100000 });
  });
});

describe("isLaterRecord", () => {
  const night = run("2026-11-05T03:56:34Z");

  it("takes a later run", () => {
    expect(isLaterRecord(run("2026-11-06T03:56:34Z"), night)).toBe(true);
  });

  it("refuses an older run and the same run, so the page does not go back in time", () => {
    expect(isLaterRecord(run("2026-11-04T03:56:34Z"), night)).toBe(false);
    expect(isLaterRecord(night, night)).toBe(false);
  });

  it("takes a run when the branch is empty, or when the record of the branch has no time", () => {
    expect(isLaterRecord(night, undefined)).toBe(true);
    expect(isLaterRecord(night, { date: "2026-10-28" })).toBe(true);
  });

  it("refuses a record with no valid time", () => {
    expect(isLaterRecord({ date: "2026-11-09" }, night)).toBe(false);
    expect(isLaterRecord({ time: "soon" }, undefined)).toBe(false);
  });
});

describe("recordFault", () => {
  const meta = run("2026-11-05T03:56:34Z");

  it("accepts a record with rows and a full meta", () => {
    expect(recordFault([{}], meta)).toBeUndefined();
  });

  it("refuses a record with no rows", () => {
    expect(recordFault([], meta)).toMatch(/no rows/);
    expect(recordFault({ rows: [] }, meta)).toMatch(/no rows/);
  });

  it("refuses each missing field of the meta", () => {
    expect(recordFault([{}], { ...meta, run: 0 })).toMatch(/no run/);
    expect(recordFault([{}], { ...meta, sha: "abc" })).toMatch(/no full commit/);
    expect(recordFault([{}], { ...meta, time: "soon" })).toMatch(/no time/);
    expect(recordFault([{}], { ...meta, core: "local" })).toMatch(/no version/);
  });
});
