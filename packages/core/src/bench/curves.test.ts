import { describe, expect, it } from "vitest";
import { CURVE_TYPES } from "../curves/index.ts";
import { CASES } from "../cases.ts";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import { ROUTERS } from "../routers/index.ts";
import { sharedRouter } from "../routers/shared.ts";
import { benchCurves, benchHighways, formatCurves, formatHighways, SPACING_LIMIT } from "./curves.ts";

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

describe("benchHighways", () => {
  it("measures the lanes of each bundle when each lane bends alone and when the bundle bends as one", () => {
    const graph = CASES.find((c) => c.name === "case-dense-groups")!.make();
    const rows = benchHighways(ROUTERS.find((r) => r.name === "shared")!, "case-dense-groups", graph);
    expect(rows.map((r) => r.curve)).toEqual(["rounded", "highway"]);
    const [alone, together] = rows as [(typeof rows)[0], (typeof rows)[0]];
    expect(together.bundles).toBeGreaterThan(0);
    expect(together.lanes).toBe(alone.lanes);
    expect(alone.worstSpacing).toBeGreaterThan(SPACING_LIMIT);
    expect(together.worstSpacing).toBeLessThanOrEqual(SPACING_LIMIT);
    expect(together.breaks).toBe(0);
    expect(together.through).toBe(0);
    expect(formatHighways(rows).split("\n")).toHaveLength(4);
  });

  it("counts fewer crossings in a bundle when two edges keep one lane order through it (HWC-B)", () => {
    const graph = CASES.find((c) => c.name === "case-many-groups")!.make();
    const [, run] = benchHighways(sharedRouter({ name: "shared-all", laneOrder: "run" }), "case-many-groups", graph);
    const [, bundle] = benchHighways(sharedRouter({ name: "shared-all" }), "case-many-groups", graph);
    expect(run!.crossings).toBeGreaterThan(0);
    expect(bundle!.crossings).toBe(0);
    expect(bundle!.endCrossings).toBeLessThan(run!.endCrossings / 2);
  });
});
