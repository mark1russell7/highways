import { describe, expect, it } from "vitest";
import type { Graph } from "../../model.ts";
import { box, clustered, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { CROSSBAR_DEFAULTS, crossbarPlan, greedyCrossbars, routeCrossings } from "./index.ts";

/** This function gives a route from `(x0, y0)` to `(x1, y1)`. */
const route = (edge: string, x0: number, y0: number, x1: number, y1: number) => ({
  edge,
  points: [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
  ],
});

/** Two horizontal routes and two vertical routes that cross near one place. */
const grid = [route("h0", 0, 95, 200, 95), route("h1", 0, 105, 200, 105), route("v0", 95, 0, 95, 200), route("v1", 105, 0, 105, 200)];

/** Two edges from the left to the right and two edges from the top to the bottom. */
const cross: Graph = {
  nodes: [0, 1].flatMap((i) => [
    { id: `l${i}`, box: box(0, 300 + 200 * i) },
    { id: `r${i}`, box: box(800, 300 + 200 * i) },
    { id: `u${i}`, box: box(300 + 200 * i, 0) },
    { id: `d${i}`, box: box(300 + 200 * i, 800) },
  ]),
  edges: [0, 1].flatMap((i) => [
    { id: `h${i}`, source: { node: `l${i}` }, target: { node: `r${i}` } },
    { id: `v${i}`, source: { node: `u${i}` }, target: { node: `d${i}` } },
  ]),
};

describe("the highway strategy crossbars (HWY-022)", () => {
  it("finds the four crossings of the grid, and one crossbar of two by two", () => {
    const crossings = routeCrossings(grid);
    expect(crossings.length).toBe(4);
    const bars = greedyCrossbars(crossings, 30, 15, 2);
    expect(bars.length).toBe(1);
    expect([...bars[0]!.p].sort()).toEqual(["h0", "h1"]);
    expect([...bars[0]!.q].sort()).toEqual(["v0", "v1"]);
    expect(bars[0]!.at.x).toBeCloseTo(100, 9);
    expect(greedyCrossbars(crossings, 30, 15, 3)).toEqual([]);
  });

  it("gives a correct plan on the crossing edges from no plan", () => {
    expect(checkPlan(cross, crossbarPlan({ graph: cross }, { ...CROSSBAR_DEFAULTS, from: "none", reach: 12 }))).toEqual([]);
  });

  it("gives a correct plan from the plan corridors", () => {
    expect(checkPlan(clustered, crossbarPlan({ graph: clustered }, { ...CROSSBAR_DEFAULTS, from: "corridors" }))).toEqual([]);
  });

  commonTests("crossbars", CROSSBAR_DEFAULTS, crossbarPlan, [flows, cross]);
});
