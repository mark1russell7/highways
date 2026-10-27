import { describe, expect, it } from "vitest";
import { CASES, denseGroupsBoard, hubChainBoard, manyGroupsBoard } from "../cases.ts";
import type { Box, Point } from "../geom.ts";
import type { Graph } from "../model.ts";
import { sectionsRouter } from "../routers/sections.ts";
import { backtrackOf, countOverlaps, goesOutAndBack, measureLevelFaults, measureLinks, measureRouteFaults, sumFaults } from "./links.ts";

const pts = (...xy: number[]): Point[] => xy.flatMap((_, i) => (i % 2 === 0 ? [{ x: xy[i]!, y: xy[i + 1]! }] : []));

describe("the link measures", () => {
  const boxes = new Map<string, Box>([
    ["a", { x: 0, y: 0, w: 20, h: 20 }],
    ["b", { x: 100, y: 0, w: 20, h: 20 }],
    ["wall", { x: 50, y: -40, w: 10, h: 100 }],
  ]);

  it("counts a link through a box that is not one of its ends, and not a link along the edge of a box", () => {
    const f = measureLinks(boxes, [
      { source: "a", target: "b", points: pts(20, 10, 100, 10) },
      { source: "a", target: "b", points: pts(20, 10, 30, 10, 30, -40, 90, -40, 90, 10, 100, 10) },
    ]);
    expect(f.links).toBe(2);
    expect(f.through).toBe(1);
  });

  it("counts a link that goes farther than the slack outside the bounding box of the boxes", () => {
    const out = { source: "a", target: "b", points: pts(20, 10, 30, 10, 30, 100, 90, 100, 90, 10, 100, 10) };
    expect(measureLinks(boxes, [out]).outside).toBe(1);
    expect(measureLinks(boxes, [out], { slack: 50 }).outside).toBe(0);
  });

  it("gives the growth of the distance to the target after the nearest approach", () => {
    expect(backtrackOf(pts(0, 0, 100, 0))).toBe(0);
    // The link goes 100 units away from the target at x = 200, and comes back.
    expect(backtrackOf(pts(0, 0, -100, 0, 200, 0))).toBeCloseTo(100);
    expect(goesOutAndBack(pts(0, 0, -100, 0, 200, 0))).toBe(true);
    // A short step back near the plug is not out and back.
    expect(goesOutAndBack(pts(0, 0, -10, 0, 200, 0))).toBe(false);
  });

  it("gives the worst detour and sums the faults of several levels", () => {
    const f = measureLinks(boxes, [{ source: "a", target: "b", points: pts(20, 10, 20, 70, 100, 70, 100, 10) }]);
    expect(f.worstDetour).toBeCloseTo(200 / 80);
    expect(sumFaults([f, f])).toEqual({ links: 2, through: 0, backtrack: 0, worstDetour: f.worstDetour, outside: 0 });
  });

  it("counts the pairs of boxes that overlap", () => {
    expect(countOverlaps([...boxes.values()])).toBe(0);
    expect(countOverlaps([{ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 }])).toBe(1);
  });
});

// The router of the benchmark. These numbers are the values before the fixes of the defects, except for a fixed defect. A fix lowers them.
const router = sectionsRouter({ name: "sections" });
const level = (g: Graph) => sumFaults(measureLevelFaults(router.route(g)));

describe("the case boards", () => {
  it("are made-up boards of a few hundred nodes at most, and the same each time", () => {
    for (const c of CASES) {
      const g = c.make();
      expect(g.nodes.length).toBeLessThanOrEqual(300);
      expect(c.make()).toEqual(g);
    }
  });

  it("dense groups: the groups overlap, but no level link goes through another group (ER3a)", () => {
    const g = denseGroupsBoard();
    const levels = measureLevelFaults(router.route(g));
    expect(levels.reduce((s, l) => s + l.overlaps, 0)).toBe(30);
    // Before ER3a, 26 level links went through other groups.
    expect(sumFaults(levels).through).toBe(0);
  });

  it("hub chain: no route goes away from its target and comes back (ER3b)", () => {
    const g = hubChainBoard();
    const f = measureRouteFaults(g, router.route(g));
    expect(f.through).toBe(0);
    // Before ER3b, this value was 6, and 25 without the limit of the stretch.
    expect(f.backtrack).toBe(0);
    expect(measureRouteFaults(g, sectionsRouter({ name: "tree", stretch: Infinity }).route(g)).backtrack).toBe(0);
  });

  it("many groups: no level link goes around the outer edge of the board (ER3c)", () => {
    const f = level(manyGroupsBoard());
    expect(f.through).toBe(0);
    expect(f.backtrack).toBe(3);
    // Before ER3c, 4 level links went around the outer edge of the board.
    expect(f.outside).toBe(0);
  });
});
