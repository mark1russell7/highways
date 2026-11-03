import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import type { Graph } from "../../model.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { WayFinder } from "../../ways.ts";
import { box, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { follow } from "../follow.ts";
import { checkPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";
import { corridorLinks, CURRENT_CORRIDOR_DEFAULTS, currentCorridorPlan, linkCurrents } from "./index.ts";

/** Three edges from the left to the right, and a tall wall between them. Each way goes past one end of the wall. */
const blocked: Graph = {
  nodes: [
    ...[0, 1, 2].flatMap((i) => [
      { id: `l${i}`, box: box(0, 30 * i) },
      { id: `r${i}`, box: box(600, 30 * i) },
    ]),
    { id: "wall", box: box(280, -80, 40, 240) },
  ],
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `l${i}` }, target: { node: `r${i}` } })),
};

/** This function gives the points out of the plugs of each edge, and the way finder of the graph. */
function pairsOf(graph: Graph): { finder: WayFinder; pairs: (readonly [{ x: number; y: number }, { x: number; y: number }])[] } {
  const finder = new WayFinder(graph.nodes);
  return { finder, pairs: edgePlugs(graph).map(({ ps, pt }) => [finder.out(ps), finder.out(pt)] as const) };
}

describe("the highway strategy current-corridors (NAT-037)", () => {
  it("adds the absolute current of each edge on each link, and the links near the ways of the edges have the most", () => {
    const { finder, pairs } = pairsOf(blocked);
    const currents = linkCurrents(finder.corners, pairs, { sketch: 16, seed: 1 });
    expect(currents.size).toBeGreaterThan(0);
    const M = finder.corners.points.length;
    const [top] = [...currents].sort((p, q) => q[1] - p[1] || p[0] - q[0]);
    const a = finder.corners.points[Math.floor(top![0] / M)]!;
    const b = finder.corners.points[top![0] % M]!;
    // The strongest link runs on the board, and it carries more current than the mean link.
    expect(Math.max(a.x, b.x)).toBeLessThanOrEqual(800);
    const mean = [...currents.values()].reduce((s, v) => s + v, 0) / currents.size;
    expect(top![1]).toBeGreaterThan(2 * mean);
  });

  it("keeps the links at the quantile or more", () => {
    const map = new Map([1, 2, 3, 4, 5].map((v) => [v, v]));
    expect([...corridorLinks(map, 0.8)]).toEqual([5]);
    expect([...corridorLinks(new Map(), 0.8)]).toEqual([]);
  });

  it("gives the same currents for a same seed, and other currents for another seed", () => {
    const { finder, pairs } = pairsOf(blocked);
    const a = linkCurrents(finder.corners, pairs, { sketch: 2, seed: 1 });
    expect(linkCurrents(finder.corners, pairs, { sketch: 2, seed: 1 })).toEqual(a);
    expect(a.size).toBeGreaterThan(0);
    expect(linkCurrents(finder.corners, pairs, { sketch: 2, seed: 5 })).not.toEqual(a);
  });

  it("makes highways on the corridors of a blocked board", () => {
    const plan = currentCorridorPlan({ graph: blocked }, CURRENT_CORRIDOR_DEFAULTS);
    expect(plan.highways.length).toBeGreaterThan(0);
    expect(plan.highways.some((h) => h.members.length >= 2)).toBe(true);
    expect(checkPlan(blocked, plan)).toEqual([]);
    expect(checkProperties(blocked, follow(blocked, plan), 1_000_000)).toEqual([]);
  });

  it("gives no highway on a board with clear lines", () => {
    expect(currentCorridorPlan({ graph: parallel }, CURRENT_CORRIDOR_DEFAULTS).highways).toEqual([]);
  });

  it("declares its options", () => {
    expect(checkOptions(highwayStrategies["current-corridors"], CURRENT_CORRIDOR_DEFAULTS)).toEqual([]);
  });

  commonTests("current-corridors", CURRENT_CORRIDOR_DEFAULTS, currentCorridorPlan, [flows, parallel, blocked]);
});
