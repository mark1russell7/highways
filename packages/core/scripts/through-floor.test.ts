import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { benchRun } from "../src/bench/run.ts";
import { routeMeasures } from "../src/bench/suite.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import { routerNamed } from "./control-wins-rows.ts";
import { FAMILY, floorRows, floorTarget, FRESH, SCHEMA, SEEN, SLICE, type FloorRow } from "./through-floor-rows.ts";

const record = JSON.parse(readFileSync(new URL("./data/through-floor/record.json", import.meta.url), "utf8"));

const rowOf = (rows: readonly FloorRow[], name: string): FloorRow => rows.find((row) => row.router === name) as FloorRow;
const hits = (row: FloorRow): number => row.hitAndApart + row.hitAndTouch;

describe("the record through-floor/1", () => {
  it("keeps the seen seeds and the new seeds apart", () => {
    expect(record.schema).toBe(SCHEMA);
    expect(record.seen.seeds).toEqual(SEEN);
    expect(record.fresh.seeds).toEqual(FRESH);
    expect(SEEN.to).toBe(FRESH.from);
  });

  it("reads the slice again", () => {
    expect(floorRows(SLICE)).toEqual(record.slice);
  }, 120_000);

  it("states the length as the measure R5.length reads it", () => {
    const board = highwaysRegistry().generate(FAMILY, SLICE.from).graph;
    const { row, result } = benchRun(routerNamed("corners"), FAMILY, board, 1);
    expect(rowOf(record.slice, "corners").length).toBeCloseTo(routeMeasures(board, result, row)["R5.length"] as number, 6);
  }, 60_000);

  it("reads 0 for each walker and for seams on each range of seeds", () => {
    for (const part of [record.seen, record.fresh]) {
      for (const name of ["seams", "border-walk", "border-walk-short"]) expect(hits(rowOf(part.rows, name)), name).toBe(0);
    }
  });

  it("counts no route between two touching boxes for a router that routes around boxes", () => {
    for (const part of [record.seen, record.fresh]) {
      for (const row of part.rows as FloorRow[]) expect(row.links, row.router).toBe(row.hitAndApart + row.hitAndTouch + row.clearAndApart + row.clearAndTouch);
    }
    for (const name of ["straight", "corners", "shared", "shared-all"]) expect(rowOf(record.seen.rows, name).hitAndTouch, name).toBe(0);
  });

  it("gives the target from the rows", () => {
    for (const part of [record.seen, record.fresh]) expect(part.target).toEqual(floorTarget(part.rows));
  });
});
