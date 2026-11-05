import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { dist, segmentsCross, type Point } from "../../geom.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import type { Graph, Result } from "../../model.ts";
import { checkOptions } from "../../strategies/options.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";
import { ANGLE_CROSS_DEFAULTS, angleCrossRouter, angleCrossStrategy, crossingPrice } from "./index.ts";

const node = (id: string, x: number, y: number, w = 40, h = 20): Graph["nodes"][number] => ({ id, box: { x, y, w, h } });

/** A flat edge, a shallow edge that crosses it, and two small boxes next to the crossing. Their corners give the shallow edge a steep way across. */
const board: Graph = {
  nodes: [
    node("a", 0, 0),
    node("b", 400, 0),
    node("c", 0, -60),
    node("d", 400, 60),
    node("up", 195, -40, 10, 10),
    node("down", 195, 40, 10, 10),
  ],
  edges: [
    { id: "flat", source: { node: "a" }, target: { node: "b" }, data: { collection: "p" } },
    { id: "shallow", source: { node: "c" }, target: { node: "d" }, data: { collection: "q" } },
  ],
};

/** This function gives the sine of the sharpest crossing of the two routes, or `undefined` for no crossing. */
function crossingSine(result: Result, first: string, second: string): number | undefined {
  const line = (id: string): readonly Point[] => result.routes.find((r) => r.edge === id)!.points;
  const p = line(first);
  const q = line(second);
  let low: number | undefined;
  for (let i = 1; i < p.length; i++)
    for (let j = 1; j < q.length; j++) {
      const [a, b, c, d] = [p[i - 1]!, p[i]!, q[j - 1]!, q[j]!];
      if (!segmentsCross(a, b, c, d)) continue;
      const sine = Math.abs((b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x)) / (dist(a, b) * dist(c, d));
      low = low === undefined ? sine : Math.min(low, sine);
    }
  return low;
}

describe("the router angle-cross (WILD-025)", () => {
  it("prices a crossing by its angle: a right angle costs only the base price", () => {
    const o = { alpha0: 10, alpha: 40, p: 2 };
    expect(crossingPrice({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 }, o)).toBeCloseTo(10, 9);
    const shallow = crossingPrice({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: -2 }, { x: 100, y: 2 }, o);
    expect(shallow).toBeGreaterThan(40);
    expect(shallow).toBeLessThan(50);
    expect(crossingPrice({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: -2 }, { x: 100, y: 2 }, { ...o, p: 4 })).toBeLessThan(shallow);
  });

  it("moves a shallow crossing to a steeper place through a near corner", () => {
    const plain = sharedRouter({ name: "shared", rule: byCollection }).route(board);
    const moved = angleCrossRouter({ name: "angle-cross", rule: byCollection, alpha: 100 }).route(board);
    const before = crossingSine(plain, "flat", "shallow")!;
    const after = crossingSine(moved, "flat", "shallow")!;
    expect(before).toBeLessThan(0.5);
    expect(after).toBeGreaterThan(before + 0.2);
    expect(checkProperties(board, moved, 1_000_000)).toEqual([]);
  });

  it("gives the routes of the router shared when each price is too low to move a way", () => {
    const plain = sharedRouter({ name: "x", rule: byCollection }).route(board);
    const still = angleCrossRouter({ name: "x", rule: byCollection, alpha0: 0, alpha: 0 }).route(board);
    expect(still.routes).toEqual(plain.routes);
  });

  it("gives routes with no break of a hard rule on larger boards, the same each time", () => {
    for (const graph of [hub, clustered]) {
      const a = angleCrossStrategy.run(graph, ANGLE_CROSS_DEFAULTS);
      expect(checkProperties(graph, a, 1_000_000)).toEqual([]);
      expect(angleCrossStrategy.run(graph, ANGLE_CROSS_DEFAULTS).routes).toEqual(a.routes);
    }
  });

  it("moves ways of a larger board with the default prices", () => {
    const plain = sharedRouter({ name: "angle-cross", rule: byCollection, maxNodes: 10_000 }).route(clustered);
    expect(angleCrossStrategy.run(clustered, ANGLE_CROSS_DEFAULTS).routes).not.toEqual(plain.routes);
  });

  it("declares its options", () => {
    expect(checkOptions(angleCrossStrategy, ANGLE_CROSS_DEFAULTS)).toEqual([]);
  });
});
