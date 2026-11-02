import { describe, expect, it } from "vitest";
import type { Box } from "../../geom.ts";
import type { Graph, Level, Result, Route } from "../../model.ts";
import { laneArea, laneCrossings, laneFidelity, lanesThrough, occupiedArea, openLanes, orthogonality, routeBalance, routeSeparation, runProfile } from "./lanes.ts";
import { linkAgreement } from "./levels.ts";

const route = (edge: string, ...points: [number, number][]): Route => ({ edge, points: points.map(([x, y]) => ({ x, y })) });
const run = (id: string, edges: string[], ...points: [number, number][]) => ({ id, key: id, edges, points: points.map(([x, y]) => ({ x, y })) });
const B = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

describe("routeSeparation (R12)", () => {
  it("gives the share of the ink near a parallel leg of another edge", () => {
    // Two legs 2 units apart: each one is near the other along its full length.
    expect(routeSeparation([route("a", [0, 0], [10, 0]), route("b", [0, 2], [10, 2])])).toBeCloseTo(1);
    // The projections overlap on 5 units of each leg of 10 units.
    expect(routeSeparation([route("a", [0, 0], [10, 0]), route("b", [5, 2], [15, 2])])).toBeCloseTo(0.5);
  });

  it("does not count far legs, legs at an angle, legs of one edge or one shared segment", () => {
    expect(routeSeparation([route("a", [0, 0], [10, 0]), route("b", [0, 10], [10, 10])])).toBe(0);
    expect(routeSeparation([route("a", [0, 0], [10, 0]), route("b", [0, 1], [10, 3])])).toBe(0);
    expect(routeSeparation([route("a", [0, 0], [10, 0], [10, 2], [0, 2])])).toBe(0);
    expect(routeSeparation([route("a", [0, 0], [10, 0]), route("b", [0, 0], [10, 0])])).toBe(0);
    expect(routeSeparation([])).toBe(0);
  });
});

describe("orthogonality (R14)", () => {
  it("gives the share of the length on legs parallel to an axis", () => {
    expect(orthogonality([route("a", [0, 0], [10, 0], [10, 10])])).toBe(1);
    expect(orthogonality([route("a", [0, 0], [10, 0], [20, 10])])).toBeCloseTo(10 / (10 + Math.SQRT2 * 10));
    expect(orthogonality([route("a", [0, 0], [100, 1])])).toBe(1);
    expect(orthogonality([])).toBe(1);
  });
});

describe("laneCrossings (B5)", () => {
  // The routes of a and b hold two runs. The lane order of the second run is the same or the reverse of the first.
  const routes = [route("a", [0, 0], [10, 0], [20, 0], [30, 0]), route("b", [0, 0], [10, 0], [20, 0], [30, 0]), route("c", [0, 0], [10, 0])];
  it("counts the pairs of edges whose lane order flips from one shared segment to the next", () => {
    const flip: Result = { routes, runs: [run("r1", ["a", "b"], [0, 0], [10, 0]), run("r2", ["b", "a"], [20, 0], [30, 0])] };
    expect(laneCrossings(openLanes(flip).graph)).toBe(1);
    const kept: Result = { routes, runs: [run("r1", ["a", "b"], [0, 0], [10, 0]), run("r2", ["a", "b"], [20, 0], [30, 0])] };
    expect(laneCrossings(openLanes(kept).graph)).toBe(0);
  });

  it("reads the lane order in the way of each route", () => {
    // The second run goes from right to left, so the reverse lane order keeps a on the same side of b.
    const back: Result = { routes, runs: [run("r1", ["a", "b"], [0, 0], [10, 0]), run("r2", ["b", "a"], [30, 0], [20, 0])] };
    expect(laneCrossings(openLanes(back).graph)).toBe(0);
    expect(laneCrossings(openLanes({ routes }).graph)).toBe(0);
  });
});

describe("occupiedArea (B7)", () => {
  it("divides the cells that the routes touch by the cells that the straight lines touch", () => {
    expect(occupiedArea([route("a", [5, 5], [25, 5])], 10)).toBe(1);
    // The detour touches 7 cells of side 10. The straight line touches 3.
    expect(occupiedArea([route("a", [5, 5], [5, 25], [25, 25], [25, 5])], 10)).toBeCloseTo(7 / 3);
    // A diagonal through the corners of the cells touches only the cells on the diagonal.
    expect(occupiedArea([route("a", [5, 5], [5, 35], [35, 35])], 10)).toBeCloseTo(7 / 4);
    expect(occupiedArea([], 10)).toBe(1);
  });
});

describe("runProfile (B8)", () => {
  it("gives the shared segments, and the median and the most edges of each", () => {
    const result: Result = {
      routes: [],
      runs: [run("r1", ["a", "b"], [0, 0], [10, 0]), run("r2", ["a", "b", "c"], [0, 10], [10, 10])],
      bundles: [{ id: "t", key: "t", node: "n", edges: ["d", "e"], trunk: [{ x: 0, y: 20 }, { x: 10, y: 20 }] }],
    };
    expect(runProfile(openLanes(result).graph)).toEqual({ runs: 3, median: 2, max: 3 });
    expect(runProfile(openLanes({ routes: [route("a", [0, 0], [1, 0])] }).graph)).toEqual({ runs: 0, median: 0, max: 0 });
  });
});

// Two edges from s to t share the run from (0, 0) to (10, 0). The node x is a box above the run, from y = -5 to y = -3.
const board: Graph = {
  nodes: [
    { id: "s", box: B(-20, -5, 10, 10) },
    { id: "x", box: B(2, -5, 6, 2) },
    { id: "t", box: B(20, -5, 10, 10) },
  ],
  edges: [
    { id: "a", source: { node: "s" }, target: { node: "t" } },
    { id: "b", source: { node: "s" }, target: { node: "t" } },
  ],
};
const shared: Result = {
  routes: [route("a", [-10, 0], [0, 0], [10, 0], [20, 0]), route("b", [-10, 0], [0, 0], [10, 0], [20, 0])],
  runs: [run("r", ["a", "b"], [0, 0], [10, 0])],
};

describe("laneFidelity (B9)", () => {
  it("divides the Fréchet distance of the lane and the route by half the width of the run", () => {
    // Each lane is 2 units from the route, and half the width of the run is 4 × 2 / 2 = 4 units.
    expect(laneFidelity(shared.routes, openLanes(shared, 4))).toEqual({ median: 0.5, max: 0.5, edges: 2 });
    expect(laneFidelity(shared.routes, openLanes({ routes: shared.routes }, 4))).toBeUndefined();
  });
});

describe("lanesThrough (M4) and laneArea (M1)", () => {
  it("counts the lane routes through a box", () => {
    // At the width 4, the lane of a is at y = -2, below the box x. At the width 8, it is at y = -4, in the box.
    expect(lanesThrough(board, openLanes(shared, 4))).toBe(0);
    expect(lanesThrough(board, openLanes(shared, 8))).toBe(1);
  });

  it("gives the growth of the board that the open lanes need", () => {
    // The boxes span 50 × 10 units. The lanes at y = -8 and y = 8 make the box of the drawing 50 × 16 units.
    expect(laneArea(board, openLanes(shared, 4))).toBe(1);
    expect(laneArea(board, openLanes(shared, 16))).toBeCloseTo(1.6);
  });
});

describe("linkAgreement (Z9)", () => {
  const graph: Graph = {
    nodes: [
      { id: "a1", box: B(0, 0, 4, 4) },
      { id: "a2", box: B(6, 6, 4, 4) },
      { id: "b1", box: B(40, 0, 10, 10) },
    ],
    edges: [{ id: "e", source: { node: "a1" }, target: { node: "b1" } }],
  };
  const items = [
    { id: "A", box: B(0, 0, 10, 10), nodes: ["a1", "a2"] },
    { id: "B", box: B(40, 0, 10, 10), nodes: ["b1"] },
  ];
  const level = (y: number): Level => ({ depth: 0, items, links: [{ source: "A", target: "B", count: 1, points: [{ x: 10, y }, { x: 40, y }] }] });
  const routes = [route("e", [4, 2], [10, 5], [40, 5])];

  it("gives the mean Hausdorff distance of each link to the routes of its edges outside the two items, in units of the board", () => {
    expect(linkAgreement(graph, [level(5)], routes, 10)).toBeCloseTo(0);
    expect(linkAgreement(graph, [level(7)], routes, 10)).toBeCloseTo(0.2);
  });

  it("gives undefined without a level with groups", () => {
    expect(linkAgreement(graph, [], routes, 10)).toBeUndefined();
    const single: Level = { depth: 0, items: [{ id: "a1", box: B(0, 0, 4, 4), nodes: ["a1"] }, { id: "b1", box: B(40, 0, 10, 10), nodes: ["b1"] }], links: [] };
    expect(linkAgreement(graph, [single], routes, 10)).toBeUndefined();
  });
});

describe("routeBalance (R16)", () => {
  it("gives 0 for even gaps and for routes without parallel neighbors", () => {
    // Three parallel routes, each 10 units from its neighbor: two pairs with the same gap.
    const even = routeBalance([route("a", [0, 0], [100, 0]), route("b", [0, 10], [100, 10]), route("c", [0, 20], [100, 20])]);
    expect(even.pairs).toBe(2);
    expect(even.cv).toBeCloseTo(0);
    expect(even.low).toBe(0);
    expect(routeBalance([route("a", [0, 0], [100, 0]), route("b", [0, 0], [0, 100])])).toEqual({ cv: 0, low: 0, pairs: 0 });
  });

  it("gives a spread for uneven gaps, and counts only the nearest neighbor at each side", () => {
    // The gaps are 4 and 16. The route "a" is not a neighbor of "c", because "b" is between them.
    const uneven = routeBalance([route("a", [0, 0], [100, 0]), route("b", [0, 4], [100, 4]), route("c", [0, 20], [100, 20])]);
    expect(uneven.pairs).toBe(2);
    // The mean gap is 10, and the standard deviation is 6.
    expect(uneven.cv).toBeCloseTo(0.6);
    // The weighted median is 4, so no gap is less than 2.
    expect(uneven.low).toBe(0);
  });

  it("weights each gap by the overlap, and does not count legs beyond the reach", () => {
    // The pair a-b overlaps on 100 units with a gap of 2. The pair b-c overlaps on 10 units with a gap of 12.
    const b = routeBalance([route("a", [0, 0], [100, 0]), route("b", [0, 2], [100, 2]), route("c", [90, 14], [200, 14])]);
    expect(b.pairs).toBe(2);
    expect(b.low).toBe(0);
    expect(routeBalance([route("a", [0, 0], [100, 0]), route("b", [0, 50], [100, 50])]).pairs).toBe(0);
  });
});
