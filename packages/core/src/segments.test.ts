import { describe, expect, it } from "vitest";
import { checkProperties } from "./bench/properties.ts";
import { makeFixture, type FixtureKind } from "./fixtures.ts";
import { dist, segmentsCross } from "./geom.ts";
import type { Router } from "./model.ts";
import { sharedRouter } from "./routers/shared.ts";
import { byCollection, trunksRouter } from "./routers/trunks.ts";
import { offsetPolyline, orderLanes, pathPoints, pullApart, segmentsOf } from "./segments.ts";

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
});
