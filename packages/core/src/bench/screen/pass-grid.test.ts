import { describe, expect, it } from "vitest";
import { center, type Point } from "../../geom.ts";
import { highwayRouterStrategy } from "../../highways/router.ts";
import type { Graph, Result, Route } from "../../model.ts";
import { placePlug } from "../../plugs.ts";
import { makeRoom, roomLinks } from "../../room/index.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy, type Strategy } from "../../strategies/model.ts";
import { WayFinder } from "../../ways.ts";
import { checkProperties } from "../properties.ts";
import { hardFloors } from "./floor.ts";
import { inputGraph, type LayoutRecord } from "./forms.ts";
import { screenInputs, SCREEN_V2 } from "./set.ts";

// The records of these numbers are the run 41499056825 of the workflow `Screen` (PASS-GRID).
const W = 140;
const H = 90;
const board = (seed: number): Graph => inputGraph(screenInputs(SCREEN_V2).find((i) => i.id === `screen-v2/packed-grid/s${seed}`)!);
const routerOf = (name: string): Strategy<"router"> => getStrategy(STRATEGIES, "router", name);
const planOf = (name: string): Strategy<"router"> => highwayRouterStrategy(getStrategy(STRATEGIES, "highway", name));
const routed = (s: Strategy<"router">, g: Graph): Result => s.run(g, s.defaults as never);
const through = (g: Graph, r: Result): string[] => checkProperties(g, r, Number.POSITIVE_INFINITY).flatMap((v) => (v.rule === "no-pass-through" ? [v.edge!] : []));

/** This function gives a route along the seams of the grid: along a side of the source, along two seams, and along a side of the target. */
function seamRoute(g: Graph, id: string): Route {
  const e = g.edges.find((x) => x.id === id)!;
  const s = g.nodes.find((n) => n.id === e.source.node)!;
  const t = g.nodes.find((n) => n.id === e.target.node)!;
  const a = placePlug(s, e.source, center(t.box)).point;
  const b = placePlug(t, e.target, center(s.box)).point;
  const snap = (p: Point): Point => (p.x % W === 0 ? { x: p.x, y: Math.floor(p.y / H) * H } : { x: Math.floor(p.x / W) * W, y: p.y });
  const from = snap(a);
  const to = snap(b);
  return { edge: e.id, points: [a, from, { x: to.x, y: from.y }, to, b] };
}

describe("the pass-throughs of packed-grid (PASS-GRID)", () => {
  it("gives the counts of the records on the worst seeds", () => {
    const counts = (seed: number): number[] => ["corners", "shared"].map((n) => through(board(seed), routed(routerOf(n), board(seed))).length);
    expect(counts(8)).toEqual([97, 97]);
    expect(counts(6)).toEqual([87, 87]);
    expect(through(board(8), routed(planOf("territories"), board(8))).length).toBe(94);
    expect(through(board(8), routed(planOf("ridges"), board(8))).length).toBe(96);
    expect(through(board(6), routed(planOf("territories"), board(6))).length).toBe(88);
    expect(through(board(6), routed(planOf("ridges"), board(6))).length).toBe(85);
  });

  it("gives each edge the straight line, because the corner graph has no point in the board", () => {
    const g = board(8);
    const ways = new WayFinder(g.nodes, {});
    const inside = ways.corners.points.filter((p) => p.x > 0 && p.x < 12 * W && p.y > 0 && p.y < 8 * H);
    expect(ways.corners.points.length).toBe(92);
    expect(inside).toEqual([]);
    const r = routed(routerOf("corners"), g);
    expect(r.routes.length).toBe(133);
    expect(r.routes.filter((x) => x.points.length === 2).length).toBe(133);
    // The edge e1 goes from the row 0 to the row 2 in one column. Its first point is 5 units in the box of the row 1, so the graph has no way.
    const e1 = r.routes.find((x) => x.edge === "e1")!;
    expect(e1.points).toEqual([
      { x: 350, y: 90 },
      { x: 350, y: 180 },
    ]);
    expect(through(g, r)).toContain("e1");
    expect(ways.corners.path({ x: 350, y: 95 }, { x: 350, y: 175 })).toBeUndefined();
  });

  it("finds a route for each edge along the seams, so the true floor of the rule is 0", () => {
    const g = board(8);
    const routes = g.edges.map((e) => seamRoute(g, e.id));
    expect(through(g, { routes })).toEqual([]);
  });

  it("lowers the count when the gaps open before the route", () => {
    const g = board(8);
    const open = { ...g, nodes: makeRoom(g.nodes, roomLinks(g), { gutter: 8, spacing: 4 }).items };
    expect(through(open, routed(routerOf("corners"), open)).length).toBe(0);
  });
});

describe("the floor of a screen", () => {
  const rec = (strategy: string, step: string, input: string, breaks: number, skipped?: string): LayoutRecord =>
    ({ strategy, step, input, hard: { "no-pass-through": breaks }, ...(skipped === undefined ? {} : { skipped }) }) as unknown as LayoutRecord;
  const records = [rec("corners", "router", "a", 97), rec("shared", "router", "a", 97), rec("territories", "highway", "a", 94), rec("ridges", "highway", "b", 96), rec("new", "highway", "c", 1)];

  it("takes only the base routers in the step highway", () => {
    const floor = hardFloors(records, { step: "highway", candidates: new Set(["new"]) });
    expect(floor.get("a")).toEqual({ "no-pass-through": 97 });
  });

  it("does not move when a plan has fewer breaks on one input", () => {
    const more = [...records, rec("lucky", "highway", "a", 3)];
    expect(hardFloors(more, { step: "highway", candidates: new Set() }).get("a")).toEqual(hardFloors(records, { step: "highway", candidates: new Set() }).get("a"));
  });

  it("takes the other built-in strategies on an input without a base router", () => {
    const floor = hardFloors(records, { step: "highway", candidates: new Set(["new"]) });
    expect(floor.get("b")).toEqual({ "no-pass-through": 96 });
    expect(floor.has("c")).toBe(false);
  });

  it("keeps the fewest breaks of each built-in in the other steps", () => {
    const floor = hardFloors(
      [rec("corners", "router", "a", 97), rec("territories", "router", "a", 94), rec("skipped", "router", "a", 0, "too large")],
      { step: "router", candidates: new Set() },
    );
    expect(floor.get("a")).toEqual({ "no-pass-through": 94 });
  });
});
