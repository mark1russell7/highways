import { describe, expect, it } from "vitest";
import { compareLive, firstDeploy, liveVerdict, weekDates, type AtlasWeeksFile, type WeekSource } from "./atlas-weeks.ts";

describe("weekDates", () => {
  it("gives no week when the build is before the next date", () => {
    expect(weekDates("2026-11-07", "2026-11-07")).toEqual([]);
    expect(weekDates("2026-11-07", "2026-11-13")).toEqual([]);
    expect(weekDates("2026-11-07", "2026-11-01")).toEqual([]);
  });

  it("includes the build date when the build is on a Saturday", () => {
    expect(weekDates("2026-11-07", "2026-11-14")).toEqual(["2026-11-14"]);
  });

  it("steps 7 days, across the end of a month and of a year", () => {
    expect(weekDates("2026-11-07", "2026-11-30")).toEqual(["2026-11-14", "2026-11-21", "2026-11-28"]);
    expect(weekDates("2026-12-19", "2027-01-09")).toEqual(["2026-12-26", "2027-01-02", "2027-01-09"]);
  });

  it("gives no week with no committed record", () => {
    expect(weekDates("", "2026-11-14")).toEqual([]);
  });
});

/** This function makes a made-up week of the file. */
const week = (date: string, sha256: string, final = true, source: WeekSource["source"] = "derived"): WeekSource => ({ date, source, commit: source === "derived" ? "abc" : "", final, sha256 });

/** This function makes a made-up file of the weeks. */
const file = (weeks: readonly WeekSource[], skipped: AtlasWeeksFile["skipped"] = []): AtlasWeeksFile => ({ format: "atlas-weeks/1", built: "2026-11-21", head: "abc", weeks, skipped });

const local = file([week("2026-11-07", "a", true, "committed"), week("2026-11-14", "b"), week("2026-11-21", "c", false)]);
const ok200 = (f: AtlasWeeksFile) => ({ status: 200, body: JSON.stringify(f) });

describe("compareLive", () => {
  it("passes when each final week of the live file has the same hash", () => {
    expect(compareLive(local, JSON.stringify(file([week("2026-11-07", "a", true, "committed"), week("2026-11-14", "b")]))).ok).toBe(true);
  });

  it("fails when a final week has a different hash", () => {
    const v = compareLive(local, JSON.stringify(file([week("2026-11-14", "x")])));
    expect(v.ok).toBe(false);
    expect(v.line).toMatch(/2026-11-14/);
  });

  it("does not count a week that is not final on the live site", () => {
    expect(compareLive(local, JSON.stringify(file([week("2026-11-21", "old", false)]))).ok).toBe(true);
  });

  it("fails when a final week of the live file is open in this build", () => {
    expect(compareLive(local, JSON.stringify(file([week("2026-11-21", "c")]))).line).toMatch(/older history/);
  });

  it("fails when a final week of the live file is missing in this build, with the reason of the gap", () => {
    const here = file([week("2026-11-07", "a", true, "committed")], [{ date: "2026-11-14", reason: "The checkout is shallow." }]);
    const v = compareLive(here, JSON.stringify(file([week("2026-11-14", "b")])));
    expect(v.ok).toBe(false);
    expect(v.line).toMatch(/shallow/);
  });

  it("fails on a live file that is not JSON or has no format", () => {
    expect(compareLive(local, "<html>").ok).toBe(false);
    expect(compareLive(local, "{}").ok).toBe(false);
  });

  it("does not count a committed week that replaces a derived week with the same hash", () => {
    expect(compareLive(file([week("2026-11-14", "b", true, "committed")]), JSON.stringify(file([week("2026-11-14", "b")]))).ok).toBe(true);
  });
});

describe("firstDeploy", () => {
  it("passes when the live atlas page answers 200 and has no link to the file", () => {
    const v = firstDeploy({ status: 200, body: '<a href="results.html">results</a>' });
    expect(v).toMatchObject({ ok: true });
    expect(v.line).toMatch(/first deploy/);
  });

  it("fails when the live atlas page links the file, because the 404 is then an outage", () => {
    expect(firstDeploy({ status: 200, body: '<p><a href="atlas-weeks.json">The weekly records as JSON</a></p>' })).toMatchObject({ ok: false });
    expect(firstDeploy({ status: 200, body: '<a href="/highways/atlas-weeks.json">x</a>' }).line).toMatch(/outage/);
  });

  it("fails when the live atlas page is not 200", () => {
    expect(firstDeploy({ status: 404, body: "" }).ok).toBe(false);
    expect(firstDeploy({ status: 503, body: "" }).ok).toBe(false);
  });

  it("fails on an error of the network", () => {
    expect(firstDeploy({ error: "ENOTFOUND" }).ok).toBe(false);
  });
});

describe("liveVerdict", () => {
  const page = { status: 200, body: "<main></main>" };

  it("compares the weeks on 200", () => {
    expect(liveVerdict(local, ok200(local)).ok).toBe(true);
    expect(liveVerdict(local, ok200(file([week("2026-11-07", "z")]))).ok).toBe(false);
  });

  it("reads the live atlas page on 404", () => {
    expect(liveVerdict(local, { status: 404, body: "" }, page).ok).toBe(true);
    expect(liveVerdict(local, { status: 404, body: "" }, { status: 200, body: '<a href="atlas-weeks.json">' }).ok).toBe(false);
    expect(liveVerdict(local, { status: 404, body: "" }).ok).toBe(false);
  });

  it("fails on each other status and on an error of the network", () => {
    expect(liveVerdict(local, { status: 500, body: "" }, page).ok).toBe(false);
    expect(liveVerdict(local, { status: 403, body: "" }, page).ok).toBe(false);
    expect(liveVerdict(local, { error: "timeout" }, page).line).toMatch(/cannot fetch/);
  });
});
