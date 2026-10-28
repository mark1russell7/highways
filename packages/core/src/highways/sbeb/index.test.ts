import { describe, expect, it } from "vitest";
import { WayFinder } from "../../ways.ts";
import { clustered, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { meanLine, nearestOnLine, SBEB_DEFAULTS, sbebLines, sbebPlan, shapeSkeleton } from "./index.ts";

describe("the highway strategy sbeb (HWY-009)", () => {
  it("gives a skeleton on the middle of the shape of two parallel lines", () => {
    const lines = [0, 20].map((y) => [
      { x: 0, y },
      { x: 200, y },
    ]);
    const s = shapeSkeleton(lines, new WayFinder([]), 16, 2);
    let n = 0;
    for (let y = 0; y < s.grid.h; y++)
      for (let x = 0; x < s.grid.w; x++) {
        if (!s.skeleton[y * s.grid.w + x]) continue;
        const cx = s.grid.x0 + (x + 0.5) * s.grid.cell;
        const cy = s.grid.y0 + (y + 0.5) * s.grid.cell;
        if (cx > 40 && cx < 160) {
          n++;
          expect(Math.abs(cy - 10)).toBeLessThanOrEqual(2);
        }
      }
    expect(n).toBeGreaterThan(0);
  });

  it("gives the mean line, and the nearest point of a line", () => {
    const mean = meanLine(
      [0, 4].map((y) => [
        { x: 0, y },
        { x: 10, y },
      ]),
      3,
    );
    expect(mean).toEqual([
      { x: 0, y: 2 },
      { x: 5, y: 2 },
      { x: 10, y: 2 },
    ]);
    expect(nearestOnLine(mean, { x: 4, y: 9 })).toEqual({ x: 4, y: 2 });
  });

  it("pulls the parallel edges together", () => {
    const lines = sbebLines({ graph: parallel }, new WayFinder(parallel.nodes), SBEB_DEFAULTS);
    const mid = [...lines.values()].map((l) => l[Math.floor(l.length / 2)]!.y);
    expect(Math.max(...mid) - Math.min(...mid)).toBeLessThan(16);
  });

  it("gives a correct plan with the target mean and with the groups of the keys", () => {
    for (const o of [{ ...SBEB_DEFAULTS, target: "mean" as const }, { ...SBEB_DEFAULTS, group: "keys" as const }]) {
      expect(checkPlan(clustered, sbebPlan({ graph: clustered }, o))).toEqual([]);
    }
  });

  commonTests("sbeb", SBEB_DEFAULTS, sbebPlan, [flows, parallel]);
});
