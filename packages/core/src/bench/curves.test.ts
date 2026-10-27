import { describe, expect, it } from "vitest";
import { CURVE_TYPES } from "../curves/index.ts";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import { ROUTERS } from "../routers/index.ts";
import { benchCurves, formatCurves } from "./curves.ts";

describe("benchCurves", () => {
  it("gives one row for each type, and a clamped curve goes through no box that its route avoids", () => {
    const graph = makeFixture(FIXTURES.find((f) => f.name === "tiny-uniform")!);
    for (const router of ROUTERS.filter((r) => ["corners", "shared", "sections"].includes(r.name))) {
      const rows = benchCurves(router, "tiny-uniform", graph);
      expect(rows.map((r) => r.type)).toEqual(CURVE_TYPES);
      for (const r of rows) expect(r.clamped).toBeLessThanOrEqual(r.through);
      expect(rows[0]!.length).toBeCloseTo(1, 9);
      expect(formatCurves(rows).split("\n")).toHaveLength(2 + CURVE_TYPES.length);
    }
  });
});
