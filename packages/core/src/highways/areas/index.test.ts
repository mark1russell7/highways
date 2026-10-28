import { describe, expect, it } from "vitest";
import { dist } from "../../geom.ts";
import { WayFinder } from "../../ways.ts";
import { clustered, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { shapeSkeleton } from "../sbeb/index.ts";
import { AREA_DEFAULTS, areaPlan, skeletonPath } from "./index.ts";

describe("the highway strategy areas (HWY-010)", () => {
  it("gives the longest path of the skeleton of a straight band, along the band", () => {
    const lines = [0, 20].map((y) => [
      { x: 0, y },
      { x: 200, y },
    ]);
    const path = skeletonPath(shapeSkeleton(lines, new WayFinder([]), 16, 2));
    expect(path.length).toBeGreaterThan(2);
    expect(dist(path[0]!, path[path.length - 1]!)).toBeGreaterThan(150);
  });

  it("gives one area on the parallel edges", () => {
    expect(areaPlan({ graph: parallel }, AREA_DEFAULTS).highways.length).toBeGreaterThan(0);
  });

  it("gives a correct plan with the width count and with the groups of the keys", () => {
    for (const o of [{ ...AREA_DEFAULTS, width: "count" as const }, { ...AREA_DEFAULTS, group: "keys" as const }]) {
      expect(checkPlan(clustered, areaPlan({ graph: clustered }, o))).toEqual([]);
    }
  });

  commonTests("areas", AREA_DEFAULTS, areaPlan, [flows, parallel]);
});
