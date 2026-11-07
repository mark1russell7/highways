import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { addDays, atlasData, NO_BOUND, parseWeek, regionKey, SOLVED_DAYS, weekLeaders, weekText, type AtlasWeek, type WeekRegion } from "./atlas-data.ts";
import { atlasWeeks, verdictSnapshots, weekPath } from "./atlas-files.ts";
import type { Snapshot, SnapshotRow } from "./results-data.ts";

/** A made-up family mark: the family, its mean and its sign. */
type Mark = readonly [family: string, mean: number, sign: -1 | 0 | 1];

/** This function makes a made-up row of a snapshot. */
function row(strategy: string, guard: string, marks: readonly Mark[]): SnapshotRow {
  return {
    strategy,
    guard,
    measure: `m.${guard}`,
    label: "no verdict",
    old: "no verdict",
    stratified: 0,
    pooled: 0,
    p: 1,
    families: marks.map(([family, mean, sign]) => ({ family, n: 4, mean, sign })),
    breadth: { against: 0, of: marks.length, ties: 0 },
  };
}

/** This function makes a made-up snapshot of the set `toy` and the step `router`, with the base `alpha`. */
function snapshot(rows: readonly SnapshotRow[], extra: Partial<Snapshot> = {}): Snapshot {
  return { set: "toy", step: "router", base: "alpha", level: 0.05, run: 7, commit: "c0ffee", date: "2026-11-01", core: "0.1.0", rows, ...extra };
}

/** This function gives the region of a week by its guard and family. */
const region = (week: AtlasWeek, guard: string, family: string): WeekRegion => {
  const r = week.regions.find((x) => x.guard === guard && x.family === family);
  if (r === undefined) throw new Error(`No region ${guard} ${family}.`);
  return r;
};

/** This function makes a made-up week where each region of `leaders` has the leader of its key. */
function week(date: string, leaders: Readonly<Record<string, string>>): AtlasWeek {
  const regions = Object.entries(leaders).map(([family, leader]): WeekRegion => ({
    set: "toy",
    step: "router",
    base: "alpha",
    guard: "R1",
    measure: "m.R1",
    family,
    leader: { strategy: leader, mean: 1, n: 4 },
    runnerUp: null,
    run: 7,
    core: "0.1.0",
  }));
  return { format: "atlas-week/1", date, regions };
}

describe("weekLeaders", () => {
  it("takes the greatest mean among the rows with the sign 1", () => {
    const w = weekLeaders([snapshot([row("beta", "R1", [["f", 2, 1]]), row("gamma", "R1", [["f", 5, 1]]), row("delta", "R1", [["f", 9, 0]])])], "2026-11-07");
    const r = region(w, "R1", "f");
    expect(r.leader).toEqual({ strategy: "gamma", mean: 5, n: 4 });
    expect(r.runnerUp).toEqual({ strategy: "beta", mean: 2, n: 4 });
  });

  it("breaks an equal mean by the name in text order", () => {
    const w = weekLeaders([snapshot([row("zeta", "R1", [["f", 3, 1]]), row("eta", "R1", [["f", 3, 1]])])], "2026-11-07");
    expect(region(w, "R1", "f").leader.strategy).toBe("eta");
    expect(region(w, "R1", "f").runnerUp?.strategy).toBe("zeta");
  });

  it("gives the base as the leader when no row has the sign 1, and the closest strategy as the runner-up", () => {
    const w = weekLeaders([snapshot([row("beta", "R1", [["f", -1, -1]]), row("gamma", "R1", [["f", 0.001, 0]])])], "2026-11-07");
    const r = region(w, "R1", "f");
    expect(r.leader).toEqual({ strategy: "alpha", mean: 0, n: 4 });
    expect(r.runnerUp).toEqual({ strategy: "gamma", mean: 0.001, n: 4 });
  });

  it("gives the base as the runner-up of a single win", () => {
    const w = weekLeaders([snapshot([row("beta", "R1", [["f", 2, 1]]), row("gamma", "R1", [["f", -2, -1]])])], "2026-11-07");
    expect(region(w, "R1", "f").runnerUp).toEqual({ strategy: "alpha", mean: 0, n: 4 });
  });

  it("takes the core of the stamp when the snapshot has one", () => {
    const s = snapshot([row("beta", "R1", [["f", 2, 1]])], { verified: { core: "0.2.0", run: 9, commit: "beef", date: "2026-11-05" } });
    expect(region(weekLeaders([s], "2026-11-07"), "R1", "f")).toMatchObject({ core: "0.2.0", run: 7 });
  });

  it("gives the regions in a stable order, with no effect of the order of the input", () => {
    const a = snapshot([row("beta", "R4", [["g", 1, 1], ["f", 1, 1]]), row("beta", "R1", [["g", 1, 1], ["f", 1, 1]])]);
    const b = snapshot([row("beta", "R1", [["f", 1, 1]])], { set: "aaa", step: "plugs" });
    const one = weekLeaders([a, b], "2026-11-07");
    const two = weekLeaders([b, { ...a, rows: [...a.rows].reverse() }], "2026-11-07");
    expect(one.regions.map(regionKey)).toEqual(["aaa|plugs|R1|m.R1|f", "toy|router|R1|m.R1|f", "toy|router|R1|m.R1|g", "toy|router|R4|m.R4|f", "toy|router|R4|m.R4|g"]);
    expect(weekText(two)).toBe(weekText(one));
    expect(parseWeek(weekText(one))).toEqual(one);
  });
});

describe("atlasData", () => {
  const today = "2026-12-20";

  it("holds a region for 27 days, and solves it at 28 days", () => {
    const at27 = atlasData([week("2026-11-07", { f: "beta" }), week(addDays("2026-11-07", 27), { f: "beta" })], today).regions[0]!;
    expect(at27).toMatchObject({ since: "2026-11-07", days: 27, state: "held", bound: NO_BOUND });
    const at28 = atlasData([week("2026-11-07", { f: "beta" }), week(addDays("2026-11-07", 28), { f: "beta" })], today);
    expect(at28.regions[0]).toMatchObject({ since: "2026-11-07", days: SOLVED_DAYS, state: "solved" });
    expect(at28.summary).toMatchObject({ regions: 1, solved: 1, earliest: "" });
  });

  it("restarts the run after a change of the leader", () => {
    const weeks = [week("2026-11-07", { f: "beta" }), week("2026-11-14", { f: "gamma" }), week("2026-11-21", { f: "gamma" })];
    expect(atlasData(weeks, today).regions[0]).toMatchObject({ since: "2026-11-14", days: 7, state: "held" });
  });

  it("restarts the run of a region that is missing from a week before", () => {
    const weeks = [week("2026-11-07", { f: "beta", g: "beta" }), week("2026-11-14", { g: "beta" }), week("2026-12-05", { f: "beta", g: "beta" })];
    const view = atlasData(weeks, today);
    expect(view.regions.find((r) => r.family === "f")).toMatchObject({ since: "2026-12-05", days: 0, state: "held" });
    expect(view.regions.find((r) => r.family === "g")).toMatchObject({ since: "2026-11-07", days: 28, state: "solved" });
  });

  it("reads the weeks in date order, in any order of the input", () => {
    const weeks = [week("2026-11-21", { f: "beta" }), week("2026-11-07", { f: "gamma" }), week("2026-11-14", { f: "beta" })];
    expect(atlasData(weeks, today).regions[0]).toMatchObject({ leader: { strategy: "beta" }, since: "2026-11-14" });
  });

  it("gives the counts, the age and the earliest date of a solve", () => {
    const view = atlasData([week("2026-11-07", { f: "beta", g: "gamma" })], "2026-11-09");
    expect(view.summary).toEqual({ regions: 2, solved: 0, weeks: 1, latest: "2026-11-07", age: 2, earliest: "2026-12-05" });
  });

  it("gives an empty view with no record", () => {
    expect(atlasData([], today)).toEqual({ summary: { regions: 0, solved: 0, weeks: 0, latest: "", age: 0, earliest: "" }, regions: [] });
  });
});

describe("the committed records", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const weeks = atlasWeeks(root);

  it("has the first record, and its date names its file", () => {
    expect(weeks.map((w) => w.date)).toContain("2026-11-07");
  });

  it("keeps each record in the text of `weekText`, so each record has the stable order", () => {
    for (const w of weeks) expect(readFileSync(weekPath(root, w.date), "utf8"), w.date).toBe(weekText(w));
  });

  // A later snapshot has a new run or a new stamp. So the check reads only the snapshots with the run and the core of the record.
  it("equals the leaders of each committed snapshot that the latest record read", () => {
    const latest = weeks.at(-1)!;
    const read = verdictSnapshots(root).filter((s) => {
      const of = latest.regions.filter((r) => r.set === s.set && r.step === s.step);
      return of.length > 0 && of.every((r) => r.run === s.run && r.core === (s.verified?.core ?? s.core));
    });
    for (const s of read) {
      const want = weekLeaders([s], latest.date).regions;
      expect(latest.regions.filter((r) => r.set === s.set && r.step === s.step), `${s.set} ${s.step}`).toEqual(want);
    }
  });

  it("gives 0 solved regions until 4 weeks of records exist", () => {
    const view = atlasData(weeks, "2026-11-07");
    expect(view.summary.regions).toBe(weeks.at(-1)!.regions.length);
    if (weeks.length === 1) expect(view.summary).toMatchObject({ solved: 0, earliest: "2026-12-05" });
  });
});
