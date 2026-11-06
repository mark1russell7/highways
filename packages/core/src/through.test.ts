import { describe, expect, it } from "vitest";
import { checkProperties } from "./bench/properties.ts";
import { highwaysRegistry } from "./families/index.ts";
import { edgePlugs } from "./highways/stretches.ts";
import { follow } from "./highways/follow.ts";
import { segmentBoxDistance } from "./geom.ts";
import { NEAR_WIDTH, type Graph, type Node, type Result, type Route } from "./model.ts";
import { byCollection, cornersRouter, sectionsRouter, sharedRouter, trunksRouter } from "./routers/index.ts";
import { seamsRouter } from "./routers/seams/index.ts";
import { laneRoutes } from "./segments.ts";
import { markRoute } from "./through.ts";
import { Obstacles } from "./visibility.ts";
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
    for (const router of [cornersRouter({ name: "corners" }), sharedRouter({ name: "shared" }), trunksRouter({ name: "trunks", rule: byCollection }), sectionsRouter({ name: "sections" }), seamsRouter({ name: "seams" })]) {
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

  it("is on the straight line of the router seams, when an edge has no way in both graphs (SEAMS-THROUGH)", () => {
    const graph: Graph = {
      nodes: [
        { id: "shell", box: { x: 0, y: 0, w: 300, h: 300 } },
        { id: "inner", box: { x: 130, y: 130, w: 40, h: 40 } },
        { id: "far", box: { x: 500, y: 130, w: 40, h: 40 } },
      ],
      edges: [{ id: "e", source: { node: "inner" }, target: { node: "far" } }],
    };
    const [route] = seamsRouter({ name: "seams" }).route(graph).routes;
    expect(route!.points).toHaveLength(2);
    expect(route!.through).toEqual(["shell"]);
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

describe("the field near of a route (THIN-GAP)", () => {
  const box = (id: string, x: number, y: number): Node => ({ id, box: { x, y, w: 40, h: 20 } });
  // A made-up board: the ends S and T, and the box A above the line from S to T.
  const nodes = [box("S", 0, 0), box("T", 200, 0), box("A", 100, -40)];
  const obstacles = new Obstacles(nodes, 100);
  const ends = (id: string): boolean => id === "S" || id === "T";
  const at = (y: number): Route => ({ edge: "e", points: [{ x: 40, y }, { x: 200, y }] });

  it("names a box that the route passes nearer than NEAR_WIDTH to, and keeps a route with room the same object", () => {
    expect(markRoute(at(-20 + 0.6), obstacles, ends).near).toEqual(["A"]);
    const room = at(-20 + NEAR_WIDTH + 0.01);
    expect(markRoute(room, obstacles, ends)).toBe(room);
  });

  it("names a box that the route touches or goes into by less than the band of through", () => {
    for (const y of [-20, -20.3]) {
      const route = markRoute(at(y), obstacles, ends);
      expect(route.through, String(y)).toBeUndefined();
      expect(route.near, String(y)).toEqual(["A"]);
    }
  });

  it("gives through and not near to a route that goes through a box", () => {
    const route = markRoute(at(-30), obstacles, ends);
    expect(route.through).toEqual(["A"]);
    expect(route.near).toBeUndefined();
  });

  it("does not name the boxes at the ends of the edge", () => {
    const route: Route = { edge: "e", points: [{ x: 40, y: 10 }, { x: 200, y: 10 }] };
    expect(markRoute(route, obstacles, ends)).toBe(route);
  });

  it("names on each route of corners on escape only the boxes nearer than NEAR_WIDTH, and each other route has room", () => {
    const { graph } = reg.generate("escape", 0, { gap: 40, nets: 100 } as never);
    const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
    const routes = cornersRouter({ name: "corners" }).route(graph).routes;
    expect(routes.filter((r) => r.near !== undefined).length).toBeGreaterThan(0);
    for (const r of routes) {
      if (r.through !== undefined) continue;
      const e = graph.edges.find((x) => x.id === r.edge)!;
      const least = new Map<string, number>();
      for (const n of graph.nodes) {
        if (n.id === e.source.node || n.id === e.target.node) continue;
        for (let i = 1; i < r.points.length; i++) least.set(n.id, Math.min(least.get(n.id) ?? Infinity, segmentBoxDistance(r.points[i - 1]!, r.points[i]!, n.box)));
      }
      const near = [...least].filter(([, d]) => d < NEAR_WIDTH).map(([id]) => id).sort();
      expect(r.near ?? [], r.edge).toEqual(near);
      for (const id of r.near ?? []) expect(byId.has(id)).toBe(true);
    }
  });

  it("stays on the route after laneRoutes", () => {
    const { graph } = reg.generate("escape", 0, { gap: 40, nets: 100 } as never);
    const result = cornersRouter({ name: "corners" }).route(graph);
    const near = (routes: readonly Route[]): string[] => routes.filter((r) => r.near !== undefined).map((r) => `${r.edge}:${r.near!.join(",")}`).sort();
    expect(near(laneRoutes(result, new Set(), 4))).toEqual(near(result.routes));
  });
});
