import { describe, expect, it } from "vitest";
import { WayFinder } from "../../ways.ts";
import { clustered, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { MLSEB_DEFAULTS, mlsebLines, mlsebPlan, mlsPoint } from "./index.ts";

describe("the highway strategy mlseb (HWY-008)", () => {
  it("moves a point to the line of the samples, with the fit line and the fit parabola", () => {
    const near = [0, 10, 20, 30, 40].map((x) => ({ p: { x, y: 5 }, tx: 1, ty: 0 }));
    for (const fit of ["line", "parabola"] as const) {
      const q = mlsPoint({ x: 20, y: 9 }, { tx: 1, ty: 0 }, near, 30, 1, fit);
      expect(q.x).toBeCloseTo(20, 6);
      expect(q.y).toBeCloseTo(5, 6);
    }
    expect(mlsPoint({ x: 1, y: 2 }, { tx: 1, ty: 0 }, [], 10, 1, "line")).toEqual({ x: 1, y: 2 });
  });

  it("pulls the parallel edges together", () => {
    const lines = mlsebLines({ graph: parallel }, new WayFinder(parallel.nodes), MLSEB_DEFAULTS);
    const mid = [...lines.values()].map((l) => l[Math.floor(l.length / 2)]!.y);
    expect(Math.max(...mid) - Math.min(...mid)).toBeLessThan(16);
    expect(mlsebPlan({ graph: parallel }, MLSEB_DEFAULTS).highways.length).toBeGreaterThan(0);
  });

  it("gives a correct plan with the fit parabola and with the first routes", () => {
    for (const o of [{ ...MLSEB_DEFAULTS, fit: "parabola" as const }, { ...MLSEB_DEFAULTS, source: "routes" as const }]) {
      expect(checkPlan(clustered, mlsebPlan({ graph: clustered }, o))).toEqual([]);
    }
  });

  commonTests("mlseb", MLSEB_DEFAULTS, mlsebPlan, [flows, parallel]);
});
