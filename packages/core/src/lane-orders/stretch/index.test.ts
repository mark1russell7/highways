import { describe, expect, it } from "vitest";
import { laneCrossings } from "../../bench/measures/lanes.ts";
import { makeFixture } from "../../fixtures.ts";
import type { Point } from "../../geom.ts";
import type { Result, Route } from "../../model.ts";
import { sharedRouter } from "../../routers/shared.ts";
import { byCollection } from "../../routers/trunks.ts";
import { orderLanes, segmentsOf } from "../../segments.ts";
import { asRouter } from "../../strategies/model.ts";
import { LANE_STRETCH_ORDERS, laneStretches, stretchLaneOrders, type LaneRun, type LaneStretchOrder } from "./index.ts";
import { sharedStretchStrategy } from "./router.ts";

const P = (x: number, y: number): Point => ({ x, y });

// Two neighbour runs, R1 from (0, 0) to (10, 0) and R2 from (10, 0) to (20, 0). The edges a, b and c go through both runs, and d joins at (10, 0).
// The edge a starts at (0, 0), so the pairs (a, b) and (a, c) take the side past (20, 0): c, a, b from the top. The pair (b, c) takes the side before (0, 0): b above c.
// Thus the relation has the cycle a < b < c < a on both runs. The merge sort of R1 gives a, b, c, and the merge sort of R2 gives c, a, b, d.
const routes: Route[] = [
  { edge: "a", points: [P(0, 0), P(10, 0), P(20, 0), P(30, 0)] },
  { edge: "b", points: [P(-10, -10), P(0, 0), P(10, 0), P(20, 0), P(30, 10)] },
  { edge: "c", points: [P(-10, 10), P(0, 0), P(10, 0), P(20, 0), P(30, -10)] },
  { edge: "d", points: [P(10, 10), P(10, 0), P(20, 0), P(30, 20)] },
];
const R1: LaneRun = { points: [P(0, 0), P(10, 0)], routes: routes.slice(0, 3) };
const R2: LaneRun = { points: [P(10, 0), P(20, 0)], routes };

/** This function gives the result of the routes with the lane order of each run. */
function resultOf(runs: readonly LaneRun[], orders: readonly (readonly string[])[], all: readonly Route[]): Result {
  return { routes: all, runs: runs.map((r, i) => ({ id: `r${i}`, key: "k", points: r.points, edges: orders[i]! })) };
}

/** This function gives the permutation `k` of a list: a fixed shuffle with the seed `k`. */
function shuffle<T>(list: readonly T[], k: number): T[] {
  const out = [...list];
  let s = k * 2654435761 + 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** This function gives the runs of a result of the router `shared`, with the routes on each run, as the router gives them to the lane order. */
function runsOf(result: Result): LaneRun[] {
  const byEdge = new Map(result.routes.map((r) => [r.edge, r] as const));
  return (result.runs ?? []).map((run) => ({ points: run.points, routes: run.edges.map((e) => byEdge.get(e)!) }));
}

const METHODS = LANE_STRETCH_ORDERS.filter((m): m is Exclude<LaneStretchOrder, "none"> => m !== "none");

describe("stretchLaneOrders (LANE-STRETCH)", () => {
  it("gives the order bundle of orderLanes with the method none", () => {
    expect(stretchLaneOrders([R1, R2], { method: "none" })).toEqual([orderLanes(R1.points, R1.routes, "bundle"), orderLanes(R2.points, R2.routes, "bundle")]);
    expect(orderLanes(R1.points, R1.routes, "bundle")).toEqual(["a", "b", "c"]);
    expect(orderLanes(R2.points, R2.routes, "bundle")).toEqual(["c", "a", "b", "d"]);
  });

  it("joins the two runs in one stretch", () => {
    const s = laneStretches([R1, R2]);
    expect(s).toHaveLength(1);
    expect(s[0]!.runs).toEqual([1, 0]);
    expect(s[0]!.turns).toEqual([1, 1]);
  });

  it.each(METHODS)("gives fewer lane crossings than the default on a cycle across two runs (%s)", (method) => {
    const base = laneCrossings(segmentsOf(resultOf([R1, R2], stretchLaneOrders([R1, R2], { method: "none" }), routes)));
    const next = laneCrossings(segmentsOf(resultOf([R1, R2], stretchLaneOrders([R1, R2], { method }), routes)));
    expect(base).toBe(2);
    expect(next).toBe(0);
  });

  it.each(METHODS)("gives the same orders for each permutation of the runs and of the routes (%s)", (method) => {
    const want = stretchLaneOrders([R1, R2], { method });
    for (let k = 0; k < 12; k++) {
      const runs = [R1, R2].map((r) => ({ points: r.points, routes: shuffle(r.routes, k) }));
      const flip = k % 2 === 1;
      const got = stretchLaneOrders(flip ? [runs[1]!, runs[0]!] : runs, { method });
      expect(flip ? [got[1], got[0]] : got).toEqual(want);
    }
  });

  it("gives the same order when a route goes through the runs in reverse", () => {
    const back = routes.map((r) => ({ edge: r.edge, points: [...r.points].reverse() }));
    const runs: LaneRun[] = [
      { points: R1.points, routes: back.slice(0, 3) },
      { points: R2.points, routes: back },
    ];
    expect(stretchLaneOrders(runs, { method: "consensus" })).toEqual(stretchLaneOrders([R1, R2], { method: "consensus" }));
  });

  it("puts a route that does not hold its run last", () => {
    const lost: Route = { edge: "0", points: [P(100, 100), P(200, 100)] };
    const orders = stretchLaneOrders([R1, { points: R2.points, routes: [...routes, lost] }], { method: "consensus" });
    expect(orders[1]![orders[1]!.length - 1]).toBe("0");
  });

  // The runs of the router `shared` on generated boards: each stretch order is a total order, and the order of each run is its part of that order.
  const boards = [3, 9, 14].map((seed) => makeFixture({ name: "t", kind: "collections", nodes: 120, edgesPerNode: 2, seed }));
  const results = boards.map((g) => sharedRouter({ name: "shared", rule: byCollection, maxNodes: 10_000 }).route(g));

  it.each(METHODS)("gives a total order to each stretch of the router shared (%s)", (method) => {
    let joined = 0;
    for (const result of results) {
      const runs = runsOf(result);
      const orders = stretchLaneOrders(runs, { method });
      for (const s of laneStretches(runs, { method })) {
        expect(new Set(s.order).size).toBe(s.order.length);
        const rank = new Map(s.order.map((e, i) => [e, i] as const));
        s.runs.forEach((i, r) => {
          const own = orders[i]!.filter((e) => rank.has(e));
          const ranks = own.map((e) => rank.get(e)!);
          const sorted = [...ranks].sort((x, y) => (s.turns[r] === 1 ? x - y : y - x));
          expect(ranks).toEqual(sorted);
          expect(new Set(own)).toEqual(new Set(runs[i]!.routes.map((q) => q.edge).filter((e) => rank.has(e))));
        });
        if (s.runs.length > 1) joined++;
      }
    }
    expect(joined).toBeGreaterThan(0);
  });

  it.each(METHODS)("gives the same orders for each permutation of the runs of the router shared (%s)", (method) => {
    for (const result of results) {
      const runs = runsOf(result);
      const want = stretchLaneOrders(runs, { method });
      for (let k = 1; k <= 3; k++) {
        const order = shuffle(
          runs.map((_, i) => i),
          k,
        );
        const got = stretchLaneOrders(
          order.map((i) => ({ points: runs[i]!.points, routes: shuffle(runs[i]!.routes, k + i) })),
          { method },
        );
        order.forEach((i, j) => expect(got[j]).toEqual(want[i]));
      }
    }
  });

  it("keeps the routes of the router shared, and changes only the lane orders", () => {
    const stretch = asRouter(sharedStretchStrategy);
    boards.forEach((g, b) => {
      const r = stretch.route(g);
      expect(r.routes).toEqual(results[b]!.routes);
      expect(r.runs!.map((x) => [...x.edges].sort())).toEqual(results[b]!.runs!.map((x) => [...x.edges].sort()));
    });
  });
});
