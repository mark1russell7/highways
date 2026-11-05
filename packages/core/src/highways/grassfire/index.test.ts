import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { dist, type Point } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { WayFinder } from "../../ways.ts";
import { box, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { follow } from "../follow.ts";
import { checkPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";
import { axisPoints, burn, clearanceAt, GRASSFIRE_DEFAULTS, grassfirePlan } from "./index.ts";

/** Three edges from the left to the right, and a wall with a gap 80 wide. Each way goes through the gap or past the wall. */
const gate: Graph = {
  nodes: [
    ...[0, 1, 2].flatMap((i) => [
      { id: `l${i}`, box: box(0, 30 * i - 120) },
      { id: `r${i}`, box: box(600, 30 * i - 120) },
    ]),
    { id: "up", box: box(280, -300, 40, 300) },
    { id: "down", box: box(280, 80, 40, 300) },
    { id: "low", box: box(170, 100, 20, 20) },
  ],
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `l${i}` }, target: { node: `r${i}` } })),
};

/** This function gives the distance from a point to the nearest box of the graph. */
function roomAt(graph: Graph, p: Point): number {
  let best = Infinity;
  for (const { box: b } of graph.nodes) {
    const dx = Math.max(b.x - p.x, 0, p.x - b.x - b.w);
    const dy = Math.max(b.y - p.y, 0, p.y - b.y - b.h);
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

describe("the highway strategy grassfire (NAT-034)", () => {
  it("burns the free cells, and each cell keeps the distance to its nearest box", () => {
    const boxes = [box(0, 0, 20, 100), box(100, 0, 20, 100)];
    const fire = burn(boxes, 2, 10);
    expect(clearanceAt(fire, { x: 10, y: 50 })).toBe(0);
    expect(clearanceAt(fire, { x: 60, y: 50 })).toBeCloseTo(40, -1);
    expect(clearanceAt(fire, { x: 30, y: 50 })).toBeLessThan(clearanceAt(fire, { x: 60, y: 50 }));
  });

  it("puts the axis where the two fronts meet, in the middle of the gap", () => {
    const fire = burn([box(0, 0, 20, 100), box(100, 0, 20, 100)], 2, 10);
    const inGap = axisPoints(fire, 8).filter((p) => p.y > 10 && p.y < 90);
    expect(inGap.length).toBeGreaterThanOrEqual(5);
    for (const p of inGap) expect(Math.abs(p.x - 60)).toBeLessThanOrEqual(3);
    for (let i = 1; i < inGap.length; i++) expect(dist(inGap[i - 1]!, inGap[i]!)).toBeGreaterThanOrEqual(8);
  });

  it("runs a highway down the middle of the gap, with more room than the ways through the corners", () => {
    // The tall walls make the unit large, so the defaults give one axis point in the gap. This test uses a finer grid.
    const plan = grassfirePlan({ graph: gate }, { ...GRASSFIRE_DEFAULTS, cell: 0.1, spacing: 0.4, spur: 8 });
    expect(plan.highways.length).toBeGreaterThan(0);
    expect(checkPlan(gate, plan)).toEqual([]);
    expect(checkProperties(gate, follow(gate, plan), 1_000_000)).toEqual([]);
    const inGap = plan.highways.flatMap((h) => h.spine).filter((p) => p.x >= 280 && p.x <= 320);
    expect(inGap.length).toBeGreaterThan(0);
    const room = Math.min(...inGap.map((p) => roomAt(gate, p)));
    const finder = new WayFinder(gate.nodes);
    const { ps, pt } = edgePlugs(gate)[0]!;
    const hug = finder.corners.path(finder.out(ps!), finder.out(pt!))!.filter((p) => p.x >= 275 && p.x <= 325);
    expect(room).toBeGreaterThan(Math.min(...hug.map((p) => roomAt(gate, p))));
    expect(room).toBeGreaterThanOrEqual(30);
  });

  it("keeps a way off the axis when its spur is too long", () => {
    const plan = grassfirePlan({ graph: gate }, { ...GRASSFIRE_DEFAULTS, spur: 0.1 });
    expect(plan.highways).toEqual([]);
  });

  it("gives no highway on a board with clear lines", () => {
    expect(grassfirePlan({ graph: parallel }, GRASSFIRE_DEFAULTS).highways).toEqual([]);
  });

  it("declares its options", () => {
    expect(checkOptions(highwayStrategies.grassfire, GRASSFIRE_DEFAULTS)).toEqual([]);
  });

  commonTests("grassfire", GRASSFIRE_DEFAULTS, grassfirePlan, [flows, parallel, gate]);
});
