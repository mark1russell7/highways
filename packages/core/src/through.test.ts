import { describe, expect, it } from "vitest";
import { checkProperties } from "./bench/properties.ts";
import { highwaysRegistry } from "./families/index.ts";
import { edgePlugs } from "./highways/stretches.ts";
import { follow } from "./highways/follow.ts";
import type { Graph, Result } from "./model.ts";
import { byCollection, cornersRouter, sectionsRouter, sharedRouter, trunksRouter } from "./routers/index.ts";
import { laneRoutes } from "./segments.ts";
import { WayFinder } from "./ways.ts";

const reg = highwaysRegistry();
const WALLED = 181679;

const breaks = (graph: Graph, result: Result): string[] =>
  checkProperties(graph, result, 1_000_000)
    .filter((v) => v.rule === "no-pass-through")
    .map((v) => v.edge!)
    .sort();
const marked = (result: Result): string[] =>
  result.routes
    .filter((r) => r.through !== undefined)
    .map((r) => r.edge)
    .sort();

/** This function gives the maze of the seed, with one box outside the walls and an edge from that box to the inside. No way exists for that edge. */
function walledOff(): Graph {
  const { graph } = reg.generate("maze", WALLED);
  const x = Math.min(...graph.nodes.map((n) => n.box.x));
  const y = Math.min(...graph.nodes.map((n) => n.box.y));
  return {
    ...graph,
    nodes: [...graph.nodes, { id: "outside", box: { x: x - 120, y, w: 60, h: 40 } }],
    edges: [...graph.edges, { id: "out", source: { node: "outside" }, target: { node: graph.edges[0]!.source.node } }],
  };
}

describe("the field through of a route (CORNER-REACH)", () => {
  it("is on each route with no way of the maze seed, and it names only boxes of the board", () => {
    const { graph } = reg.generate("maze", WALLED);
    const ways = new WayFinder(graph.nodes, { joinWork: 0 });
    const noWay = edgePlugs(graph).filter(({ ps, pt }) => !ways.corners.path(ways.out(ps!), ways.out(pt!)));
    expect(noWay.length).toBe(11);
    const result = cornersRouter({ name: "corners", joinWork: 0 }).route(graph);
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const { edge } of noWay) {
      const route = result.routes.find((r) => r.edge === edge.id)!;
      expect(route.through, edge.id).toBeDefined();
      expect(route.through!.length, edge.id).toBeGreaterThan(0);
      expect(route.through!.every((id) => ids.has(id)), edge.id).toBe(true);
    }
  });

  it("marks the same routes as the rule no-pass-through, on each router that uses the way finder", () => {
    const graph = walledOff();
    const shared = sharedRouter({ name: "shared" }).route(graph);
    expect(breaks(graph, shared).length).toBeGreaterThan(0);
    for (const router of [cornersRouter({ name: "corners" }), sharedRouter({ name: "shared" }), trunksRouter({ name: "trunks", rule: byCollection }), sectionsRouter({ name: "sections" })]) {
      const result = router.route(graph);
      expect(marked(result), router.name).toEqual(breaks(graph, result));
    }
  });

  it("is on the route with no way after the join, on the maze seed with a box outside the walls", () => {
    const graph = walledOff();
    const ways = new WayFinder(graph.nodes);
    const edge = edgePlugs(graph).find((p) => p.edge.id === "out")!;
    expect(ways.corners.path(ways.out(edge.ps!), ways.out(edge.pt!))).toBeUndefined();
    const route = sharedRouter({ name: "shared" }).route(graph).routes.find((r) => r.edge === "out")!;
    expect(route.through?.length).toBeGreaterThan(0);
  });

  it("is absent on each route of a clean board, so a clean route keeps its bytes", () => {
    const { graph } = reg.generate("maze", 59);
    const result = sharedRouter({ name: "shared" }).route(graph);
    expect(breaks(graph, result)).toEqual([]);
    expect(result.routes.some((r) => "through" in r)).toBe(false);
  });

  it("does not name the boxes at the ends of the edge", () => {
    const graph = walledOff();
    const result = cornersRouter({ name: "corners" }).route(graph);
    expect(marked(result).length).toBeGreaterThan(0);
    for (const r of result.routes) {
      const e = graph.edges.find((x) => x.id === r.edge)!;
      expect(r.through?.includes(e.source.node) ?? false, r.edge).toBe(false);
      expect(r.through?.includes(e.target.node) ?? false, r.edge).toBe(false);
    }
  });

  it("gives one order for one input, and sorts the ids", () => {
    const graph = walledOff();
    const a = cornersRouter({ name: "corners" }).route(graph);
    expect(JSON.stringify(a)).toBe(JSON.stringify(cornersRouter({ name: "corners" }).route(graph)));
    for (const r of a.routes) if (r.through) expect([...r.through]).toEqual([...r.through].sort());
  });

  it("stays on the route after laneRoutes", () => {
    const graph = walledOff();
    const result = sharedRouter({ name: "shared" }).route(graph);
    expect(marked({ routes: laneRoutes(result, new Set(), 2) })).toEqual(marked(result));
  });

  it("stays on the routes of a plan that `follow` gives", () => {
    const graph = walledOff();
    const result = follow(graph, { highways: [] });
    expect(marked(result)).toEqual(breaks(graph, result));
  });
});
