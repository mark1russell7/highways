import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { claimRows, claimsRecord } from "./route-pairs-claims.ts";
import { median } from "@mark1russell7/rigor-statistics";
import { boardRows, CONTROL_MOVE, pairsRecord, REGENERATE, relationFaults, relationSlack, type BoardRow } from "./route-pairs-rows.ts";

/** The record on disk. */
const record = JSON.parse(readFileSync(new URL("./data/route-pairs/record.json", import.meta.url), "utf8")) as ReturnType<typeof pairsRecord>;
const STALE = `The record route-pairs/2 is stale. Write it again with: ${REGENERATE}`;
const keyOf = (r: BoardRow): string => `${r.family}/${r.seed}/${r.router}`;

describe("the record route-pairs/2", () => {
  it("holds 25 families at 3 seeds for 5 routers", () => {
    expect(record.rows).toHaveLength(25 * 3 * 5);
  });

  it("equals fresh rows on small families", () => {
    const fresh = boardRows(["tiny-uniform", "fan-out", "two-hubs"], 1);
    expect(fresh.length).toBeGreaterThan(0);
    const saved = new Map(record.rows.map((r) => [keyOf(r), r]));
    for (const row of fresh) expect(saved.get(keyOf(row)), STALE).toEqual(row);
  }, 120_000);

  it("adds proper and contact crossings up to each count, with no sample", () => {
    for (const r of record.rows) {
      expect(r.pairs).toBe(r.proper + r.contact);
      expect(r.pairsEstimated).toBe(false);
    }
  });

  it("holds the relation of the two counts on each row, so a row outside the two cases is a finding", () => {
    expect(relationFaults(record.rows)).toEqual([]);
  });

  it("turns the check of the relation red on an injected fault, and a copy with no fault stays green", () => {
    const row = record.rows.find((r) => relationSlack(r) === 54)!;
    const lowered = (by: number): BoardRow[] => record.rows.map((r) => (r === row ? { ...r, pairs: r.pairs - by } : r));
    expect(relationFaults(lowered(55))).toEqual([keyOf(row)]);
    expect(relationFaults(lowered(54))).toEqual([]);
    expect(relationFaults(record.rows.map((r) => ({ ...r })))).toEqual([]);
  });

  it("needs each class: a row reads outside the relation without the class that its table line names", () => {
    const without = (field: "self" | "touch"): string[] => relationFaults(record.rows.map((r) => ({ ...r, [field]: 0 }))).sort();
    expect(without("self")).toEqual(["local-mesh/0/sections-site", "local-mesh/1/sections-site"]);
    expect(without("touch")).toEqual(["packed-grid/1/corners", "packed-grid/1/shared", "packed-grid/1/shared-all"]);
  });

  it("states the room of the relation, so that a fault under the room of a row reads no fault", () => {
    const slack = record.rows.map(relationSlack);
    expect(median(slack)).toBe(54);
    expect(slack.filter((s) => s === 0)).toHaveLength(43);
  });

  it("explains each row with fewer pairs than painted crossings by one class", () => {
    const under = record.rows.filter((r) => r.pairs < r.crossings);
    expect(under.map((r) => [keyOf(r), r.self > 0 ? "self" : r.touch > 0 ? "touch" : "none"]).sort()).toEqual([
      ["local-mesh/0/sections-site", "self"],
      ["local-mesh/1/sections-site", "self"],
      ["packed-grid/1/corners", "touch"],
      ["packed-grid/1/shared", "touch"],
      ["packed-grid/1/shared-all", "touch"],
    ]);
  });

  it("does not move the pair count at any shift of the test", () => {
    // The pin reads each size of `MOVES`. Each vertex moves by its own vector in the arm `each`.
    for (const r of record.rows) {
      for (const shift of r.shifts.filter((x) => x.move !== CONTROL_MOVE)) {
        expect([...shift.one, ...shift.each].filter((d) => d !== 0), keyOf(r)).toEqual([]);
      }
    }
  });

  it("moves the pair count at the control shift, so the test above can fail", () => {
    const moved = record.rows.filter((r) => r.shifts.find((x) => x.move === CONTROL_MOVE)!.each.some((d) => d !== 0));
    expect(moved.length).toBeGreaterThan(record.rows.length / 3);
  });
});

describe("the record route-pairs-claims/1", () => {
  it("names each verdict that reads route.crossings", () => {
    const saved = JSON.parse(readFileSync(new URL("./data/route-pairs/claims.json", import.meta.url), "utf8")) as ReturnType<typeof claimsRecord>;
    expect(saved, `The record is stale. Write it again with: ${saved.regenerate}`).toEqual(claimsRecord(claimRows()));
  });
});
