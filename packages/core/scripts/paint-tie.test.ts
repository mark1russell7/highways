import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAINT_COUNTER } from "../src/bench/measures/crossing-pairs.ts";
import { FLOOR_MOVE, FLOOR_UNIT, floorRows, kindRows, MOVES, paintRecord, REGENERATE, shiftOf, SLICE, VECTORS } from "./paint-tie-rows.ts";

/** The record on disk. */
const record = JSON.parse(readFileSync(new URL("./data/paint-tie/record.json", import.meta.url), "utf8")) as ReturnType<typeof paintRecord>;
const through = JSON.parse(readFileSync(new URL("./data/through-check/record.json", import.meta.url), "utf8")) as {
  readonly lanes?: readonly { readonly router: string; readonly bySeed: readonly { readonly painted: { readonly points: number } }[] }[];
  readonly rows?: readonly { readonly router: string; readonly view?: string; readonly bySeed?: readonly { readonly painted: { readonly points: number } }[] }[];
};
const STALE = `The record paint-tie/1 is stale. Write it again with: ${REGENERATE}`;

describe("the record paint-tie/1", () => {
  it("equals fresh rows on a part of the families", () => {
    expect(kindRows(SLICE.families, SLICE.seeds), STALE).toEqual(record.slice);
  }, 180_000);

  it("holds the floors of its own rows, one for each router, kind and vector", () => {
    expect(record.floorMove).toBe(FLOOR_MOVE);
    expect(record.floors).toEqual(floorRows(record.rows));
    expect(record.floorUnit).toBe(FLOOR_UNIT);
    expect(record.floors).toHaveLength(record.rows.length * VECTORS.length);
    for (const floor of record.floors) {
      expect(floor.moved).toBeGreaterThan(0);
      expect(floor.share).toBeLessThan(0.05);
    }
  });

  it("states the version of the counter", () => {
    expect(record.paintCounter).toBe(PAINT_COUNTER);
  });

  it("draws five different shifts at each size", () => {
    for (const move of MOVES) {
      const shifts = VECTORS.map((name) => shiftOf(name, move));
      expect(new Set(shifts.map((s) => `${s.dx},${s.dy}`)).size).toBe(VECTORS.length);
      for (const s of shifts) {
        expect(Math.abs(s.dx)).toBeLessThanOrEqual(move);
        expect(Math.abs(s.dx)).toBeGreaterThanOrEqual(move / 2);
      }
    }
  });

  it("does not move the count at the shift of 1e-12, and the float control does move", () => {
    const shifts = record.rows.flatMap((r) => r.shifts.filter((s) => s.move === 1e-12));
    expect(shifts.length).toBe(record.rows.length * 2 * VECTORS.length);
    expect(shifts.filter((s) => s.snapMoved !== 0)).toEqual([]);
    expect(shifts.some((s) => s.floatMoved > 0)).toBe(true);
  });

  it("reads the painted points that the record through-check reads", () => {
    const rows = (through.rows ?? through.lanes ?? []).filter((r) => r.bySeed && r.view === "lanes");
    for (const row of record.rows.filter((r) => r.kind === "painted")) {
      const sum = rows.filter((r) => r.router === row.router).reduce((n, r) => n + r.bySeed!.reduce((m, s) => m + s.painted.points, 0), 0);
      expect(sum, row.router).toBe(row.snapPoints);
    }
  });

  it("loses no crossing with a touch at the grid or over it", () => {
    for (const row of record.rows) expect(row.lost.overGrid, `${row.router} ${row.kind}`).toBe(0);
  });

  it("loses no far crossing with a real angle", () => {
    for (const row of record.rows) expect(row.lost.farWithAngle, `${row.router} ${row.kind}`).toBe(0);
  });

  it("reads each router on one frame at the shift of the corner line", () => {
    for (const row of record.rows) {
      for (const shift of row.shifts.filter((s) => s.form === "corner")) expect(shift.framedMoved, `${row.router} ${row.kind}`).toBe(0);
    }
  });

  it("holds the direct read of two routers on each board", () => {
    expect(record.pairsOnBoard.length).toBe(6);
    for (const row of record.pairsOnBoard) expect(row.boards).toBe(record.boards);
  });
});
