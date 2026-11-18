import { describe, expect, it } from "vitest";
import { rng } from "../../fixtures.ts";
import type { Box } from "../../geom.ts";
import type { Graph, Level, Result, Route } from "../../model.ts";
import { falseJoins, laneArea, laneCrossings, laneFidelity, lanesThrough, occupiedArea, openLanes, orthogonality, routeBalance, routeSeparation, runProfile } from "./lanes.ts";
import { linkAgreement } from "./levels.ts";

const route = (edge: string, ...points: [number, number][]): Route => ({ edge, points: points.map(([x, y]) => ({ x, y })) });
/** A graph of edges with their collections. An edge with the value `undefined` has no collection. */
const grouped = (keys: Record<string, string | undefined>): Graph => ({
  nodes: [],
  edges: Object.entries(keys).map(([id, collection]) => ({ id, source: { node: "s" }, target: { node: "t" }, ...(collection === undefined ? {} : { data: { collection } }) })),
});
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

describe("falseJoins (B12)", () => {
  // Two parallel legs of 10 units, 2 units apart.
  const pair = [route("a", [0, 0], [10, 0]), route("b", [0, 2], [10, 2])];
  const AB = grouped({ a: "A", b: "B" });
  // 40 routes of 4 points on a board of 60 units, from a seed. Many legs are near other legs.
  const scatter = (seed: number): Route[] => {
    const R = rng(seed);
    const at = (): [number, number] => [Math.round(R() * 12) * 5, Math.round(R() * 12) * 5];
    return Array.from({ length: 40 }, (_, i) => route(`e${i}`, at(), at(), at(), at()));
  };
  const keysOf = (routes: readonly Route[], key: (i: number) => string | undefined): Graph => grouped(Object.fromEntries(routes.map((r, i) => [r.edge, key(i)])));

  it("gives 0 for no routes and for routes without ink", () => {
    expect(falseJoins(AB, [])).toEqual({ share: 0, length: 0, ink: 0, edges: [] });
    expect(falseJoins(AB, [route("a", [5, 5]), route("b", [5, 5], [5, 5])])).toEqual({ share: 0, length: 0, ink: 0, edges: [{ edge: "a", length: 0, share: 0 }, { edge: "b", length: 0, share: 0 }] });
  });

  it("gives 0 for one group, for each geometry", () => {
    const one = grouped({ a: "A", b: "A" });
    expect(falseJoins(one, pair).share).toBe(0);
    expect(falseJoins(one, [route("a", [0, 0], [10, 0], [10, 10]), route("b", [0, 0], [10, 0], [10, 10])]).share).toBe(0);
    expect(falseJoins(one, [route("a", [0, 0], [10, 0]), route("b", [5, 0], [15, 0])]).share).toBe(0);
    for (const seed of [1, 2, 3]) {
      const routes = scatter(seed);
      const f = falseJoins(keysOf(routes, () => "A"), routes);
      expect(f.ink).toBeGreaterThan(0);
      expect(f.length).toBe(0);
      expect(f.edges.every((e) => e.length === 0 && e.share === 0)).toBe(true);
      // The same routes with a key for each edge have false joins, so the 0 comes from the one group.
      expect(falseJoins(keysOf(routes, (i) => `k${i}`), routes).share).toBeGreaterThan(0);
    }
  });

  it("gives 1 for two edges of two keys on the same polyline", () => {
    const routes = [route("a", [0, 0], [10, 0], [10, 10]), route("b", [0, 0], [10, 0], [10, 10])];
    expect(falseJoins(AB, routes)).toEqual({ share: 1, length: 20, ink: 20, edges: [{ edge: "a", length: 20, share: 1 }, { edge: "b", length: 20, share: 1 }] });
    // R12 does not see one shared leg.
    expect(routeSeparation(routes)).toBe(0);
  });

  it("counts two parallel legs of two keys nearer than `near`, and not farther legs", () => {
    expect(falseJoins(AB, pair)).toEqual({ share: 1, length: 20, ink: 20, edges: [{ edge: "a", length: 10, share: 1 }, { edge: "b", length: 10, share: 1 }] });
    // The projections overlap on 5 units of each leg of 10 units.
    expect(falseJoins(AB, [route("a", [0, 0], [10, 0]), route("b", [5, 2], [15, 2])]).share).toBeCloseTo(0.5);
    // The default of `near` is 4, and a leg at that distance is not nearer.
    expect(falseJoins(AB, [route("a", [0, 0], [10, 0]), route("b", [0, 3.99], [10, 3.99])]).share).toBe(1);
    expect(falseJoins(AB, [route("a", [0, 0], [10, 0]), route("b", [0, 4], [10, 4])]).share).toBe(0);
    const far = [route("a", [0, 0], [10, 0]), route("b", [0, 10], [10, 10])];
    expect(falseJoins(AB, far).share).toBe(0);
    expect(falseJoins(AB, far, { near: 12 }).share).toBe(1);
    // Two legs on one line, one after the other, do not cover each other.
    expect(falseJoins(AB, [route("a", [0, 0], [10, 0]), route("b", [10, 0], [20, 0])]).share).toBe(0);
  });

  it("does not count a crossing at a wide angle", () => {
    // A crossing at a right angle gives 0: no leg is parallel to the other leg.
    expect(falseJoins(AB, [route("a", [0, 5], [10, 5]), route("b", [5, 0], [5, 10])]).share).toBe(0);
    // The legs make an angle of 11.3 degrees. The default of `maxAngle` is 5.
    const slant = [route("a", [0, 0], [10, 0]), route("b", [0, 1], [10, 3])];
    expect(falseJoins(AB, slant).share).toBe(0);
    expect(falseJoins(AB, slant, { maxAngle: 15 }).share).toBeGreaterThan(0.9);
  });

  it("counts two legs at a small angle only where they are near", () => {
    // The leg `b` goes away from the leg `a` at 3.4 degrees. It is 4 units from `a` at x = 50.12.
    const routes = [route("a", [0, 0], [100, 0]), route("b", [0, 1], [100, 7])];
    const f = falseJoins(AB, routes);
    expect(f.edges[0]!.length).toBeCloseTo((4 * Math.sqrt(10036) - 100) / 6, 9);
    expect(f.edges[1]!.length).toBeCloseTo(Math.sqrt(10036) / 2, 9);
    expect(f.share).toBeCloseTo(0.5006, 4);
    // R12 reads the least distance of the two legs, so it counts their full overlap.
    expect(routeSeparation(routes)).toBeGreaterThan(0.99);
  });

  it("makes an edge with no key a group alone", () => {
    expect(falseJoins(grouped({ a: "A", b: undefined }), pair).share).toBe(1);
    expect(falseJoins(grouped({ a: undefined, b: undefined }), pair).share).toBe(1);
    // The graph does not have the edge `x`.
    expect(falseJoins(AB, [route("a", [0, 0], [10, 0]), route("x", [0, 2], [10, 2])]).share).toBe(1);
  });

  it("reads the key from the rule", () => {
    const graph: Graph = { nodes: [], edges: ["a", "b"].map((id) => ({ id, source: { node: "s" }, target: { node: "t" }, data: { collection: id, topic: "T" } })) };
    expect(falseJoins(graph, pair).share).toBe(1);
    expect(falseJoins(graph, pair, { rule: (e) => e.data?.["topic"] as string }).share).toBe(0);
  });

  it("gives values for each edge that agree with the total", () => {
    // The edges `a` and `b` have different keys and share the leg from (10, 0) to (20, 0).
    const f = falseJoins(grouped({ a: "A", b: "B", c: "A" }), [route("a", [0, 0], [10, 0], [20, 0]), route("b", [10, 0], [20, 0], [20, 10]), route("c", [0, 30], [10, 30])]);
    expect(f).toEqual({ share: 0.25, length: 10, ink: 40, edges: [{ edge: "a", length: 10, share: 0.5 }, { edge: "b", length: 10, share: 0.5 }, { edge: "c", length: 0, share: 0 }] });
    // Without a shared leg, the lengths of the edges add up to the total.
    const routes = [route("a", [0, 0], [10, 0], [10, 10]), route("b", [0, 2], [8, 2], [8, 10]), route("c", [0, 40], [10, 40])];
    const g = falseJoins(grouped({ a: "A", b: "B", c: "C" }), routes);
    expect(g.edges.map((e) => e.edge)).toEqual(["a", "b", "c"]);
    expect(g.edges.reduce((sum, e) => sum + e.length, 0)).toBeCloseTo(g.length, 9);
    expect(g.share).toBeCloseTo(g.length / g.ink, 12);
    expect(g.edges[2]).toEqual({ edge: "c", length: 0, share: 0 });
    for (const seed of [4, 5]) {
      const many = scatter(seed);
      const h = falseJoins(keysOf(many, (i) => (i % 5 === 0 ? undefined : `k${i % 3}`)), many);
      expect(h.share).toBeGreaterThan(0);
      expect(h.share).toBeLessThanOrEqual(1);
      expect(h.length).toBeLessThanOrEqual(h.ink);
      // A shared leg is in each of its edges and one time in the total.
      expect(h.edges.reduce((sum, e) => sum + e.length, 0)).toBeGreaterThanOrEqual(h.length - 1e-9);
      for (const e of h.edges) {
        expect(e.share).toBeGreaterThanOrEqual(0);
        expect(e.share).toBeLessThanOrEqual(1);
        expect(e.length).toBeLessThanOrEqual(h.length + 1e-9);
      }
    }
  });

  it("gives the same bytes for the same input", () => {
    const routes = scatter(6);
    const graph = keysOf(routes, (i) => (i % 7 === 0 ? undefined : `k${i % 4}`));
    const first = JSON.stringify(falseJoins(graph, routes));
    expect(JSON.stringify(falseJoins(graph, routes))).toBe(first);
    expect(JSON.stringify(falseJoins(keysOf(scatter(6), (i) => (i % 7 === 0 ? undefined : `k${i % 4}`)), scatter(6)))).toBe(first);
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
