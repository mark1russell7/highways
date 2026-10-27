import { describe, expect, it } from "vitest";
import { checkProperties } from "../bench/properties.ts";
import { measureQuality } from "../bench/quality.ts";
import { makeFixture, type FixtureKind } from "../fixtures.ts";
import type { Box } from "../geom.ts";
import type { Graph } from "../model.ts";
import { cornersRouter } from "./corners.ts";
import { sharedRouter, type SharedOptions } from "./shared.ts";
import { byCollection } from "./trunks.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });

// One source below two walls. Its edges go through the gap between the walls to three targets on the right.
const gap: Graph = {
  nodes: [
    { id: "s", box: box(0, 250) },
    { id: "top", box: box(150, -300, 20, 290) },
    { id: "bottom", box: box(150, 30, 20, 290) },
    { id: "t0", box: box(400, -120) },
    { id: "t1", box: box(400, 0) },
    { id: "t2", box: box(400, 120) },
  ],
  edges: [
    { id: "a", source: { node: "s" }, target: { node: "t0" } },
    { id: "b", source: { node: "s" }, target: { node: "t1" } },
    { id: "c", source: { node: "s" }, target: { node: "t2" } },
  ],
};

describe("sharedRouter", () => {
  it("gives one run through the gap, with the lanes in the order of the targets", () => {
    const result = sharedRouter({ name: "shared" }).route(gap);
    expect(checkProperties(gap, result)).toEqual([]);
    expect(result.runs).toHaveLength(1);
    const run = result.runs![0]!;
    // The run goes from the gap down to the source. On that way, the edge to t1 is on the left.
    expect(run.points[0]).toEqual({ x: 145, y: 25 });
    expect(run.edges).toEqual(["b", "a"]);
  });

  it("keeps the hard rules on generated graphs (property, 5 kinds × 3 seeds)", () => {
    const kinds: FixtureKind[] = ["uniform", "clustered", "grid", "hubs", "collections"];
    for (const rule of [undefined, byCollection]) {
      const router = sharedRouter(rule ? { name: "shared", rule } : { name: "shared" });
      for (const kind of kinds) {
        for (let seed = 1; seed <= 3; seed++) {
          const g = makeFixture({ name: "t", kind, nodes: 80, edgesPerNode: 3, seed, fixedPorts: 0.2 });
          const result = router.route(g);
          expect(checkProperties(g, result), `${kind} ${seed}`).toEqual([]);
          expect((result.runs ?? []).length, `${kind} ${seed}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("shares a run only between edges with one key", () => {
    const g = makeFixture({ name: "t", kind: "collections", nodes: 150, edgesPerNode: 2, seed: 9 });
    const collection = new Map(g.edges.map((e) => [e.id, e.data?.["collection"]]));
    for (const run of sharedRouter({ name: "shared", rule: byCollection }).route(g).runs ?? []) {
      expect(new Set(run.edges.map((id) => collection.get(id))).size, run.id).toBe(1);
      expect(collection.get(run.edges[0]!)).toBe(run.key);
    }
  });

  it("uses less ink than the corner router", () => {
    const g = makeFixture({ name: "t", kind: "collections", nodes: 150, edgesPerNode: 2, seed: 9 });
    const corners = measureQuality(g, cornersRouter({ name: "corners" }).route(g)).ink;
    const shared = measureQuality(g, sharedRouter({ name: "shared", rule: byCollection }).route(g)).ink;
    const all = measureQuality(g, sharedRouter({ name: "shared-all" }).route(g)).ink;
    expect(shared).toBeLessThan(corners);
    expect(all).toBeLessThan(shared);
  });

  it("gives the same result for the same input", () => {
    const g = makeFixture({ name: "t", kind: "hubs", nodes: 100, edgesPerNode: 3, seed: 4 });
    const router = sharedRouter({ name: "shared" });
    expect(JSON.stringify(router.route(g))).toBe(JSON.stringify(router.route(g)));
  });

  it("keeps the hard rules with each new option, and the defaults keep the routes (BUILD-W1C)", () => {
    const g = makeFixture({ name: "t", kind: "collections", nodes: 80, edgesPerNode: 3, seed: 2, fixedPorts: 0.2 });
    const base = JSON.stringify(sharedRouter({ name: "shared", rule: byCollection }).route(g));
    const same = sharedRouter({ name: "shared", rule: byCollection, cost: "fixed", alpha: 0.6, passes: 1, order: "span", merge: "corner" }).route(g);
    expect(JSON.stringify(same)).toBe(base);
    const settings: Omit<SharedOptions, "name">[] = [
      { cost: "flow", alpha: 0.5 },
      { cost: "flow", alpha: 0.8, passes: 3 },
      { passes: 2 },
      { order: "input" },
      { order: "load" },
      { order: "shortest" },
      { merge: "snell" },
      { cost: "flow", alpha: 0.6, merge: "snell" },
    ];
    for (const rule of [undefined, byCollection])
      for (const o of settings) {
        const result = sharedRouter({ ...o, name: "x", ...(rule ? { rule } : {}) }).route(g);
        expect(checkProperties(g, result), JSON.stringify(o)).toEqual([]);
        expect((result.runs ?? []).length, JSON.stringify(o)).toBeGreaterThan(0);
      }
  });

  it("with the Snell merges, keeps the hard rules and a route for each edge on the gap board", () => {
    const corner = sharedRouter({ name: "shared" }).route(gap);
    const snell = sharedRouter({ name: "shared", merge: "snell" }).route(gap);
    expect(checkProperties(gap, snell)).toEqual([]);
    expect(snell.routes.map((r) => r.edge)).toEqual(corner.routes.map((r) => r.edge));
  });
});
