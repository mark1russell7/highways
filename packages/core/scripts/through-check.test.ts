import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { HIGHWAYS_FAMILIES } from "../src/families/index.ts";
import { REGENERATE, SCORED, throughRecord, type Row } from "./through-check-rows.ts";

/** The record on disk. */
const record = JSON.parse(readFileSync(new URL("./data/through-check/record.json", import.meta.url), "utf8")) as ReturnType<typeof throughRecord>;
const STALE = `The record through-check/2 is stale. Write it again with: ${REGENERATE}`;
const keyOf = (r: Row): string => `${r.router} | ${r.family} | ${r.view}`;

/** This function gives the keys of the rows that differ. A row in only one list differs. */
function changed(fresh: readonly Row[], saved: readonly Row[]): string[] {
  const text = (rows: readonly Row[]): Map<string, string> => new Map(rows.map((r) => [keyOf(r), JSON.stringify(r)]));
  const [a, b] = [text(fresh), text(saved)];
  return [...new Set([...a.keys(), ...b.keys()])].filter((key) => a.get(key) !== b.get(key));
}

describe("the gate through-check/2", () => {
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
