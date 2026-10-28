import { describe, expect, it } from "vitest";
import { WayFinder } from "../../ways.ts";
import { commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { clusters1d, MESH_DEFAULTS, meshPlan, meshWaypoints } from "./index.ts";

describe("the highway strategy mesh (HWY-004)", () => {
  it("gives two clusters to two groups of values, and joins the near centres", () => {
    expect(clusters1d([0, 1, 2, 10, 11, 12], 2, 0)).toEqual([1, 1, 1, 11, 11, 11]);
    expect(new Set(clusters1d([0, 1, 2, 3], 2, 10)).size).toBe(1);
  });

  it("gives the parallel edges common waypoints", () => {
    const points = meshWaypoints({ graph: parallel }, new WayFinder(parallel.nodes), MESH_DEFAULTS);
    expect(points.size).toBe(3);
    const keys = [...points.values()].map((l) => JSON.stringify(l));
    expect(new Set(keys).size).toBe(1);
  });

  it("gives at least one highway on the parallel edges", () => {
    expect(meshPlan({ graph: parallel }, MESH_DEFAULTS).highways.length).toBeGreaterThan(0);
  });

  commonTests("mesh", MESH_DEFAULTS, meshPlan, [flows, parallel]);
});
