import { describe, expect, it } from "vitest";
import { checkProperties } from "./bench/properties.ts";
import { CASES } from "./cases.ts";
import { makeFixture, type FixtureKind } from "./fixtures.ts";
import { dist, segmentsCross } from "./geom.ts";
import type { Graph, Router } from "./model.ts";
import { sharedRouter } from "./routers/shared.ts";
import { sectionsRouter } from "./routers/sections.ts";
import { byCollection, trunksRouter } from "./routers/trunks.ts";
import { laneRoutes, offsetPolyline, orderLanes, pathPoints, pullApart, runKey, segmentsOf, type SegmentGraph } from "./segments.ts";

const routers: Router[] = [
  sharedRouter({ name: "shared-all" }),
  sharedRouter({ name: "shared", rule: byCollection }),
  trunksRouter({ name: "trunks", rule: byCollection }),
];
const kinds: FixtureKind[] = ["uniform", "clustered", "hubs", "collections"];

describe("offsetPolyline", () => {
  it("moves a line to the left, with the y axis down", () => {
    expect(offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2)).toEqual([{ x: 0, y: -2 }, { x: 10, y: -2 }]);
  });

  it("moves an inner point along the bisector", () => {
    const [, mid] = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 1);
    expect(mid!.x).toBeCloseTo(11);
    expect(mid!.y).toBeCloseTo(-1);
  });
});

describe("segmentsOf", () => {
  it("gives the routes again, and counts the edges of each shared segment (property)", () => {
    for (const router of routers) {
      for (const kind of kinds) {
        const g = makeFixture({ name: "t", kind, nodes: 80, edgesPerNode: 3, seed: 2 });
        const result = router.route(g);
        const sg = segmentsOf(result);
        const byEdge = new Map(result.routes.map((r) => [r.edge, r.points]));
        expect(sg.paths).toHaveLength(result.routes.length);
        for (const path of sg.paths) expect(pathPoints(sg, path), `${router.name} ${kind} ${path.edge}`).toEqual(byEdge.get(path.edge));
        const shared = sg.segments.filter((s) => s.count > 1);
        expect(shared.length, `${router.name} ${kind}`).toBeGreaterThan(0);
        for (const s of sg.segments) expect(s.count).toBe(s.edges.length);
        // Each edge of a shared segment has a step on it, in its lane.
        for (const s of shared) {
          for (const [lane, edge] of s.edges.entries()) {
            const path = sg.paths.find((p) => p.edge === edge)!;
            expect(path.segments.some((r) => r.segment === s.id && r.lane === lane), `${s.id} ${edge}`).toBe(true);
          }
        }
      }
    }
  });
});

describe("pullApart", () => {
  it("keeps the hard rules, and the lanes of a segment do not cross (property)", () => {
    for (const router of routers) {
      for (const kind of kinds) {
        const g = makeFixture({ name: "t", kind, nodes: 80, edgesPerNode: 3, seed: 3 });
        const sg = segmentsOf(router.route(g));
        const routes = pullApart(sg, { spacing: 1.5, maxWidth: 2 });
        expect(checkProperties(g, { routes }), `${router.name} ${kind}`).toEqual([]);
        for (const s of sg.segments.filter((x) => x.count > 1)) {
          const lanes = s.edges.map((_, lane) => offsetPolyline(s.points, ((s.count - 1) / 2 - lane) * Math.min(1.5, 2 / (s.count - 1))));
          for (let a = 0; a < lanes.length; a++) {
            for (let b = a + 1; b < lanes.length; b++) {
              for (let i = 1; i < s.points.length; i++) {
                const p = lanes[a]!;
                const q = lanes[b]!;
                expect(segmentsCross(p[i - 1]!, p[i]!, q[i - 1]!, q[i]!), `${s.id} lanes ${a} ${b}`).toBe(false);
              }
            }
          }
        }
      }
    }
  });

  it("puts the lanes of a run side by side at the spacing", () => {
    const g = makeFixture({ name: "t", kind: "collections", nodes: 80, edgesPerNode: 3, seed: 3 });
    const sg = segmentsOf(sharedRouter({ name: "shared-all" }).route(g));
    const two = sg.segments.find((s) => s.count === 2 && s.points.length === 2)!;
    const routes = pullApart(sg, { spacing: 1.5, maxWidth: 2 });
    const lanes = two.edges.map((_, lane) => offsetPolyline(two.points, (0.5 - lane) * 1.5));
    expect(dist(lanes[0]![0]!, lanes[1]![0]!)).toBeCloseTo(1.5);
    for (const [lane, edge] of two.edges.entries()) {
      const route = routes.find((r) => r.edge === edge)!.points;
      for (const q of lanes[lane]!) expect(route.some((p) => dist(p, q) < 1e-9), `${edge} lane ${lane}`).toBe(true);
    }
  });
});

describe("orderLanes", () => {
  const run = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  const via = (edge: string, ...rest: [number, number][]) => ({ edge, points: [...run, ...rest.map(([x, y]) => ({ x, y }))] });

  it("puts the route that turns more to the left after the run on the left lane", () => {
    // The y axis points down, so a route that goes up after the run turns left.
    const d = { edge: "d", points: [...via("d", [200, 50]).points].reverse() };
    const lost = { edge: "lost", points: [{ x: 500, y: 500 }, { x: 600, y: 500 }] };
    const order = orderLanes(run, [via("c", [200, 100]), lost, via("b", [200, 0]), d, via("a", [200, -100])]);
    expect(order).toEqual(["a", "b", "d", "c", "lost"]);
  });

  it("uses the way before the run when the routes go on together after it", () => {
    const p = { edge: "p", points: [{ x: -100, y: -100 }, ...run] };
    const q = { edge: "q", points: [{ x: -100, y: 100 }, ...run] };
    expect(orderLanes(run, [q, p])).toEqual(["p", "q"]);
  });

  // Two runs of one stretch in opposite directions. The edge p comes from above and goes down. The edge q does the reverse.
  const east = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  const west = [
    { x: 200, y: 0 },
    { x: 100, y: 0 },
  ];
  const stretch = (edge: string, from: number, to: number) => ({
    edge,
    points: [{ x: -100, y: from }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 300, y: to }],
  });
  const p = stretch("p", -100, 100);
  const q = stretch("q", 100, -100);

  it("with the order `run`, can give two runs of one stretch opposite orders", () => {
    // Each run looks first at its own last point. The edge p goes to the right of q in both directions, so it changes sides.
    expect(orderLanes(east, [p, q], "run")).toEqual(["q", "p"]);
    expect(orderLanes(west, [p, q], "run")).toEqual(["q", "p"]);
  });

  it("with the order `bundle`, gives two runs of one stretch the same order, and the routes cross where they part", () => {
    // The end at x = 0 tells the side: p comes from above, so it stays above on both runs.
    expect(orderLanes(east, [p, q], "bundle")).toEqual(["p", "q"]);
    expect(orderLanes(west, [q, p], "bundle")).toEqual(["q", "p"]);
    // Without a conflict, the two orders agree.
    const r = stretch("r", -100, -100);
    const t = stretch("t", 100, 100);
    expect(orderLanes(east, [t, r], "bundle")).toEqual(orderLanes(east, [t, r], "run"));
    expect(orderLanes(west, [t, r], "bundle")).toEqual(orderLanes(west, [t, r], "run"));
  });
});

/** This function counts the pairs of edges that change sides from one shared segment to the next shared segment of both paths. */
function swaps(graph: SegmentGraph): number {
  const at = new Map<string, { index: number; reverse: boolean }>();
  for (const path of graph.paths) path.segments.forEach((ref, index) => at.set(`${path.edge}|${ref.segment}`, { index, reverse: ref.reverse }));
  // For each pair, the side of the first edge on each shared segment, in the direction of its own route: 1 left, -1 right.
  const sides = new Map<string, { a: number; b: number; side: number }[]>();
  for (const s of graph.segments) {
    if (s.count < 2) continue;
    for (let i = 0; i < s.edges.length; i++)
      for (let j = i + 1; j < s.edges.length; j++) {
        const [a, b, side] = s.edges[i]! < s.edges[j]! ? [s.edges[i]!, s.edges[j]!, 1] : [s.edges[j]!, s.edges[i]!, -1];
        const A = at.get(`${a}|${s.id}`)!;
        const list = sides.get(`${a}|${b}`) ?? [];
        list.push({ a: A.index, b: at.get(`${b}|${s.id}`)!.index, side: A.reverse ? -side : side });
        sides.set(`${a}|${b}`, list);
      }
  }
  let count = 0;
  for (const list of sides.values()) {
    list.sort((x, y) => x.a - y.a);
    for (let k = 1; k < list.length; k++) if (list[k]!.a === list[k - 1]!.a + 1 && Math.abs(list[k]!.b - list[k - 1]!.b) === 1 && list[k]!.side !== list[k - 1]!.side) count++;
  }
  return count;
}

describe("the lane order of the routers", () => {
  it("keeps two edges on one side through their stretch with the order `bundle` (HWC-B)", () => {
    const graph = CASES.find((c) => c.name === "case-many-groups")!.make();
    const bundle = segmentsOf(sharedRouter({ name: "shared-all" }).route(graph));
    const run = segmentsOf(sharedRouter({ name: "shared-all", laneOrder: "run" }).route(graph));
    expect(swaps(run)).toBeGreaterThan(0);
    // Before LANE-ORDER, the sort of the engine gave 0 swaps on node 24 and node 26. The order of Kahn breaks 12 cycles in 4 runs of this graph,
    // and each break can flip a pair on one run and not on the next run. The order of Kahn does not depend on the engine.
    expect(swaps(bundle)).toBe(9);
  });

  it("changes only the lane order, not the routes", () => {
    const graph = CASES.find((c) => c.name === "case-dense-groups")!.make();
    for (const [a, b] of [
      [sharedRouter({ name: "shared" }), sharedRouter({ name: "shared", laneOrder: "run" })],
      [trunksRouter({ name: "trunks", rule: () => "all" }), trunksRouter({ name: "trunks", rule: () => "all", laneOrder: "run" })],
      [sectionsRouter({ name: "sections", laneOrder: "bundle" }), sectionsRouter({ name: "sections" })],
    ] as const) {
      const x = a.route(graph);
      const y = b.route(graph);
      expect(x.routes).toEqual(y.routes);
      const shared = (r: typeof x) => [...(r.runs ?? []).map((u) => u.edges), ...(r.bundles ?? []).map((u) => u.edges)];
      expect(shared(x).map((e) => runKey(e))).toEqual(shared(y).map((e) => runKey(e)));
    }
  });
});

describe("runKey", () => {
  it("sorts the edge ids and joins them with commas", () => {
    expect(runKey(["e2", "e10", "e1"])).toBe("e1,e10,e2");
    expect(runKey([])).toBe("");
  });
});

describe("laneRoutes", () => {
  const box = (x: number, y: number) => ({ x, y, w: 40, h: 20 });
  // Two far groups. Each node of the left group has an edge to each node of the right group, on one shared way.
  const groups: Graph = {
    nodes: [
      { id: "a0", box: box(0, 0) },
      { id: "a1", box: box(0, 60) },
      { id: "b0", box: box(1000, 0) },
      { id: "b1", box: box(1000, 60) },
      { id: "c", box: box(500, 400) },
    ],
    edges: [
      { id: "e00", source: { node: "a0" }, target: { node: "b0" } },
      { id: "e01", source: { node: "a0" }, target: { node: "b1" } },
      { id: "e10", source: { node: "a1" }, target: { node: "b0" } },
      { id: "e11", source: { node: "a1" }, target: { node: "b1" } },
      { id: "ec", source: { node: "c" }, target: { node: "a0" } },
    ],
  };
  const result = sectionsRouter({ name: "sections", cap: 2 }).route(groups);
  const sg = segmentsOf(result);
  const widest = [...sg.segments].sort((p, q) => q.count - p.count)[0]!;
  const pointsOf = (routes: readonly { edge: string; points: readonly { x: number; y: number }[] }[]) =>
    new Map(routes.map((r) => [r.edge, r.points]));

  it("gives the routes again when no run is open", () => {
    const routes = pointsOf(laneRoutes(result, new Set(), 4));
    for (const r of result.routes) expect(routes.get(r.edge)).toEqual(r.points);
  });

  it("takes a result or its segments, and gives the same routes", () => {
    const open = new Set([runKey(widest.edges)]);
    expect(laneRoutes(sg, open, 4)).toEqual(laneRoutes(result, open, 4));
  });

  it("moves only the edges of an open run, into lanes at the lane width", () => {
    expect(widest.count).toBeGreaterThanOrEqual(2);
    const open = new Set([runKey(widest.edges)]);
    const routes = pointsOf(laneRoutes(result, open, 4));
    const before = pointsOf(result.routes);
    for (const [edge, points] of routes) {
      if (widest.edges.includes(edge)) continue;
      // An edge that shares no open run keeps its route.
      if (!sg.paths.find((p) => p.edge === edge)!.segments.some((r) => r.segment === widest.id)) expect(points).toEqual(before.get(edge));
    }
    const lanes = widest.edges.map((_, lane) => offsetPolyline(widest.points, ((widest.count - 1) / 2 - lane) * 4));
    for (const [lane, edge] of widest.edges.entries()) {
      const route = routes.get(edge)!;
      for (const q of lanes[lane]!) expect(route.some((p) => dist(p, q) < 1e-9), `${edge} lane ${lane}`).toBe(true);
      // The ends stay at the plugs.
      expect(route[0]).toEqual(before.get(edge)![0]);
      expect(route[route.length - 1]).toEqual(before.get(edge)![before.get(edge)!.length - 1]);
    }
    expect(dist(lanes[0]![0]!, lanes[1]![0]!)).toBeCloseTo(4);
  });

  it("puts lane 0 on the left of the run, with the y axis down", () => {
    const a = widest.points[0]!;
    const b = widest.points[1]!;
    const routes = pointsOf(laneRoutes(result, new Set([runKey(widest.edges)]), 4));
    // The left normal of the direction a → b is (dy, -dx) when the y axis points down.
    const l = dist(a, b);
    const k = ((widest.count - 1) / 2) * 4;
    const left = { x: a.x + ((b.y - a.y) / l) * k, y: a.y - ((b.x - a.x) / l) * k };
    const right = { x: 2 * a.x - left.x, y: 2 * a.y - left.y };
    expect(routes.get(widest.edges[0]!)!.some((p) => dist(p, left) < 1e-6)).toBe(true);
    expect(routes.get(widest.edges[widest.count - 1]!)!.some((p) => dist(p, right) < 1e-6)).toBe(true);
  });

  it("keeps an open run in the largest width", () => {
    const open = new Set([runKey(widest.edges)]);
    const routes = pointsOf(laneRoutes(result, open, 10, 6));
    const first = offsetPolyline(widest.points, ((widest.count - 1) / 2) * (6 / (widest.count - 1)));
    for (const q of first) expect(routes.get(widest.edges[0]!)!.some((p) => dist(p, q) < 1e-9)).toBe(true);
  });

  it("gives the routes of pullApart when each run is open", () => {
    const all = new Set(sg.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
    expect(laneRoutes(sg, all, 2, 5)).toEqual(pullApart(sg, { spacing: 2, maxWidth: 5 }));
  });
});
