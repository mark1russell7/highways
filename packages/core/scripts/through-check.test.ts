import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { HIGHWAYS_FAMILIES } from "../src/families/index.ts";
import { REGENERATE, SCORED, throughRecord, type Row } from "./through-check-rows.ts";

/** The record on disk. */
const record = JSON.parse(readFileSync(new URL("./data/through-check/record.json", import.meta.url), "utf8")) as ReturnType<typeof throughRecord>;
const STALE = `The record through-check/5 is stale. Write it again with: ${REGENERATE}`;
/** The classes of the flagged routes of the site settings, at the time of LANE-ROOM. A change of a count fails until this list changes too. */
const SITE_ROUTES = { wall: 41, corner: 1, "plug-seam": 53 };
const SITE_LANES = { wall: 40, band: 2, corner: 1, "plug-seam": 53 };
/**
 * The painted crossings of the lanes of each router, at the time of LANE-ROOM: crossing points and pairs of the whole board, pairs added, pairs lost, and the two counts of the bundles.
 * The counts include the families of FAMILIES-WEEKLY.
 * A change of a count fails until this list changes too. The item LANE-WIDTH-CHAIN takes these counts down, or states why it cannot.
 */
const PAINTED: Record<string, readonly number[]> = {
  "corners": [33604, 31411, 0, 0, 0, 0],
  "trunks": [34385, 31960, 0, 0, 0, 1],
  "shared": [36252, 32712, 274, 42, 1, 531],
  "sections": [54447, 40633, 816, 501, 144, 2067],
  "sections-site": [84479, 47472, 121, 68, 441, 2368],
  "sections-site-no-ladder": [82405, 46720, 128, 120, 435, 2448],
  "shared-all": [43756, 36355, 1434, 459, 0, 12065],
};
const keyOf = (r: Row): string => `${r.router} | ${r.family} | ${r.view}`;

/** This function gives the keys of the rows that differ. A row in only one list differs. */
function changed(fresh: readonly Row[], saved: readonly Row[]): string[] {
  const text = (rows: readonly Row[]): Map<string, string> => new Map(rows.map((r) => [keyOf(r), JSON.stringify(r)]));
  const [a, b] = [text(fresh), text(saved)];
  return [...new Set([...a.keys(), ...b.keys()])].filter((key) => a.get(key) !== b.get(key));
}

describe("the gate through-check/5", () => {
  let fresh: ReturnType<typeof throughRecord>;
  const families = HIGHWAYS_FAMILIES.map((f) => f.name);

  // One pass makes every row, so the tests below share it.
  beforeAll(() => {
    fresh = throughRecord(record.seeds);
  }, 180_000);

  /** This function gives the rows of the routes of a router, over the families of the registry. */
  const scored = (router: string): readonly Row[] => fresh.rows.filter((r) => r.router === router && r.view === "routes" && families.includes(r.family));

  it("has a record with the counts of the code of today", () => {
    expect(changed(fresh.rows, record.rows), STALE).toEqual([]);
    expect(changed(fresh.unmarkedRows, record.unmarkedRows), STALE).toEqual([]);
    const { rows: _rows, unmarkedRows: _unmarked, ...settings } = fresh;
    const { rows: _savedRows, unmarkedRows: _savedUnmarked, ...saved } = record;
    expect(JSON.parse(JSON.stringify(settings)), STALE).toEqual(saved);
  });

  it.each(SCORED)("holds each family of the registry for %s", (router) => {
    expect(scored(router).map((r) => r.family)).toEqual(families);
    for (const row of scored(router)) expect([row.family, row.routes > 0]).toEqual([row.family, true]);
  });

  it.each(SCORED)("lets %s touch a box with no through only by the plug seams of packed-grid", (router) => {
    const touching = scored(router).filter((r) => r.flagged > 0 || Object.keys(r.classes).length > 0);
    const table = Object.fromEntries(touching.map((r) => [r.family, { flagged: r.flagged, classes: Object.fromEntries(Object.entries(r.classes).map(([id, c]) => [id, c.routes])) }]));
    expect(table).toEqual({ "packed-grid": { flagged: 53, classes: { "plug-seam": 53 } } });
  });

  it.each(SCORED)("gives %s no name in through that the route does not meet", (router) => {
    const named = scored(router).filter((r) => r.falseThrough > 0 || r.partFalse > 0);
    expect(named.map(keyOf)).toEqual([]);
  });

  it("names no box of an inner route that the route does not meet, and each box that it goes through", () => {
    const inner = fresh.rows.filter((r) => r.inner > 0);
    expect(inner.map((r) => [r.router, r.family])).toEqual([
      ["corners", "nested"],
      ["corners", "frame-rows+inner"],
      ["corners", "frame-rows+inner12"],
    ]);
    for (const r of inner) expect([r.family, r.innerFalse, r.innerUnnamed]).toEqual([r.family, 0, 0]);
  });

  it("has no inner route with the shape spike (INNER-SPIKE)", () => {
    const rows = [...fresh.rows, ...fresh.unmarkedRows].filter((r) => r.inner > 0);
    expect(rows.reduce((sum, r) => sum + r.inner, 0)).toBe(1355);
    expect(rows.filter((r) => r.innerSpikes > 0).map(keyOf)).toEqual([]);
  });

  it("has no inner route with a contact", () => {
    expect(fresh.rows.filter((r) => r.innerFlagged > 0).map(keyOf)).toEqual([]);
  });

  it("leaves no lane in a box with no mark (LANE-ROOM)", () => {
    const lanes = fresh.rows.filter((r) => r.view === "lanes");
    expect(lanes.length).toBeGreaterThan(0);
    expect(lanes.filter((r) => r.silentLanes > 0 || r.deepUnmarked > 0).map(keyOf)).toEqual([]);
  });

  it("keeps the lanes of the default routers to the marked lanes and the seams of the closed routes", () => {
    for (const router of SCORED) {
      const rows = fresh.rows.filter((r) => r.router === router && r.view === "lanes");
      const added = rows.reduce((n, r) => n + r.flagged, 0) - scored(router).reduce((n, r) => n + r.flagged, 0);
      expect([router, added <= rows.reduce((n, r) => n + r.outOfRoom, 0)]).toEqual([router, true]);
    }
  });

  it("shows the painted crossings of the lanes, with their pairs, by family and seed", () => {
    const lanes = fresh.rows.filter((r) => r.view === "lanes");
    const sums: Record<string, number[]> = {};
    for (const row of lanes) {
      expect(row.bySeed.map((s) => s.seed)).toEqual([0, 1, 2]);
      expect(row.bySeed.reduce((n, s) => n + s.laneCrossings, 0)).toBe(row.laneCrossings);
      for (const s of row.bySeed) {
        expect(s.painted.pairs - s.painted.beforePairs).toBe(s.painted.added - s.painted.lost);
        expect(s.polyline.pairs - s.polyline.beforePairs).toBe(s.polyline.added - s.polyline.lost);
        const sum = (sums[row.router] ??= [0, 0, 0, 0, 0, 0]);
        [s.painted.points, s.painted.pairs, s.painted.added, s.painted.lost, s.bundleBody, s.bundleEnds].forEach((n, i) => (sum[i] = sum[i]! + n));
      }
    }
    expect(sums).toEqual(PAINTED);
  });

  // This test compares the rows of the site settings and makes no claim on them. Any change shows here (MARGIN-MEANING).
  it("shows the counts of the site settings", () => {
    const sum = (view: Row["view"]) => {
      const classes: Record<string, number> = {};
      for (const r of fresh.rows.filter((row) => row.router === fresh.site && row.view === view)) {
        for (const [id, c] of Object.entries(r.classes)) classes[id] = (classes[id] ?? 0) + c.routes;
      }
      return classes;
    };
    expect(sum("routes")).toEqual(SITE_ROUTES);
    expect(sum("lanes")).toEqual(SITE_LANES);
  });

  it("keeps the routers that do not mark through on their own rows", () => {
    expect(record.unmarked).toEqual(["straight", "plugs"]);
    expect(record.rows.filter((r) => record.unmarked.includes(r.router))).toEqual([]);
    for (const name of record.unmarked) {
      const rows = record.unmarkedRows.filter((r) => r.router === name);
      expect(rows.map((r) => r.family)).toEqual(expect.arrayContaining(families));
      for (const r of rows) expect([r.family, r.routes > 0, r.marked]).toEqual([r.family, true, 0]);
    }
  });
});
