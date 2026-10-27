import { describe, expect, it } from "vitest";
import { checkProperties } from "../bench/properties.ts";
import { makeFixture } from "../fixtures.ts";
import { center, type Point } from "../geom.ts";
import type { Graph, Node } from "../model.ts";
import { placePlug } from "../plugs.ts";
import { cornersRouter } from "../routers/corners.ts";
import { WayFinder } from "../ways.ts";
import { sidePlugs } from "./side.ts";

// The box b is to the right of a, behind a wall. The way goes around the top of the wall.
const wall: Graph = {
  nodes: [
    { id: "a", box: { x: 0, y: 0, w: 40, h: 80 } },
    { id: "w", box: { x: 100, y: 0, w: 20, h: 200 } },
    { id: "b", box: { x: 200, y: 20, w: 40, h: 40 } },
  ],
  edges: [{ id: "ab", source: { node: "a" }, target: { node: "b" } }],
};

const len = (p: readonly Point[]): number => p.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - p[i]!.x, q.y - p[i]!.y), 0);

describe("sidePlugs (WILD-001)", () => {
  it("keeps the plugs on their sides, with the normals of the facing plugs", () => {
    const ways = new WayFinder(wall.nodes);
    const a = wall.nodes[0]!;
    const b = wall.nodes[2]!;
    const [ps, pt] = sidePlugs(ways, a, { node: "a" }, b, { node: "b" });
    expect(ps.normal).toEqual(placePlug(a, { node: "a" }, center(b.box)).normal);
    expect(pt.normal).toEqual(placePlug(b, { node: "b" }, center(a.box)).normal);
    expect(ps.point.x).toBe(40);
    expect(ps.point.y).toBeGreaterThanOrEqual(6);
    expect(ps.point.y).toBeLessThanOrEqual(74);
  });

  it("keeps a fixed plug in its place", () => {
    const nodes: Node[] = wall.nodes.map((n) => (n.id === "a" ? { ...n, ports: [{ id: "p", at: { x: 40, y: 70 } }] } : n));
    const ways = new WayFinder(nodes);
    const [ps] = sidePlugs(ways, nodes[0]!, { node: "a", port: "p" }, nodes[2]!, { node: "b" });
    expect(ps.point).toEqual({ x: 40, y: 70 });
  });

  it("gives a way that is not longer than the way of the facing plugs", () => {
    const facing = cornersRouter({ name: "c" }).route(wall).routes[0]!.points;
    const side = cornersRouter({ name: "c", plugs: "side" }).route(wall).routes[0]!.points;
    expect(len(side)).toBeLessThanOrEqual(len(facing) + 1e-6);
  });
});

describe("cornersRouter with the plug options", () => {
  it("keeps the hard rules on generated graphs, with each plug option", () => {
    for (const kind of ["uniform", "clustered", "grid"] as const) {
      for (let seed = 1; seed <= 2; seed++) {
        const g = makeFixture({ name: "t", kind, nodes: 60, edgesPerNode: 2, seed, fixedPorts: 0.2 });
        for (const options of [{ plugs: "side" as const }, { plugGap: 8 }, { plugs: "side" as const, plugGap: 6 }]) {
          expect(checkProperties(g, cornersRouter({ name: "c", ...options }).route(g)), `${kind} ${seed} ${JSON.stringify(options)}`).toEqual([]);
        }
      }
    }
  });

  it("with plugGap, the free plugs of one side are at least the gap apart where the side has room", () => {
    // Four edges from a to the boxes on its right. Their facing plugs are near each other on the east side of a.
    const g: Graph = {
      nodes: [{ id: "a", box: { x: 0, y: 0, w: 40, h: 120 } }, ...[0, 1, 2, 3].map((i) => ({ id: `b${i}`, box: { x: 400, y: 40 + i * 12, w: 10, h: 10 } }))],
      edges: [0, 1, 2, 3].map((i) => ({ id: `e${i}`, source: { node: "a" }, target: { node: `b${i}` } })),
    };
    const ys = cornersRouter({ name: "c", plugGap: 10 })
      .route(g)
      .routes.map((r) => r.points[0]!.y)
      .sort((p, q) => p - q);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(10 - 1e-9);
    const plain = cornersRouter({ name: "c" }).route(g).routes.map((r) => r.points[0]!.y);
    expect(Math.min(...plain.slice(1).map((y, i) => Math.abs(y - plain[i]!)))).toBeLessThan(10);
  });

  it("the defaults give the routes of the router without the options", () => {
    const g = makeFixture({ name: "t", kind: "clustered", nodes: 80, edgesPerNode: 2, seed: 4, fixedPorts: 0.2 });
    const base = JSON.stringify(cornersRouter({ name: "c" }).route(g));
    expect(JSON.stringify(cornersRouter({ name: "c", plugs: "facing", plugGap: 0 }).route(g))).toBe(base);
  });
});
