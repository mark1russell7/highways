import { describe, expect, it } from "vitest";
import { graphInput, inputGraph } from "../bench/screen/forms.ts";
import { segmentHitsBox, type Box, type Point } from "../geom.ts";
import { splitFrames, type Edge, type Graph, type Node, type Port, type Route, type Side } from "../model.ts";
import { listStrategies, STRATEGIES } from "../strategies/index.ts";
import { cornersRouter, type CornersOptions } from "./corners.ts";
import { sectionsRouter } from "./sections.ts";

// A made-up board: the card "card" (240 x 200) with 6 rows (200 x 24, gap 6), 2 plugs on its east wall and 2 on its west wall.
const CARD: Box = { x: 300, y: 100, w: 240, h: 200 };
const PLUGS: Port[] = [
  { id: "e1", side: "east", along: 0.25 },
  { id: "e2", side: "east", along: 0.75 },
  { id: "w1", side: "west", along: 0.25 },
  { id: "w2", side: "west", along: 0.75 },
];
const rows = (shift: (i: number) => Partial<Box> = () => ({})): Node[] =>
  Array.from({ length: 6 }, (_, i) => ({ id: `r${i + 1}`, parent: "card", box: { x: 320, y: 113 + i * 30, w: 200, h: 24, ...shift(i) } }));
const inner = (id: string, row: string, port: string): Edge => ({ id, source: { node: row }, target: { node: "card", port } });

/** The fixture of the API: edges from rows 1, 3 and 5 to the plugs, and two outer edges to the plugs `e1` and `w1`. The plug `e2` has no outer edge. */
function board(shift?: (i: number) => Partial<Box>): Graph {
  return {
    nodes: [
      { id: "left", box: { x: 60, y: 120, w: 100, h: 40 } },
      { id: "card", box: CARD, ports: PLUGS },
      ...rows(shift),
      { id: "right", box: { x: 680, y: 220, w: 100, h: 40 } },
    ],
    edges: [
      inner("i1", "r1", "e1"),
      inner("i3", "r3", "w1"),
      inner("i5", "r5", "e2"),
      { id: "o1", source: { node: "card", port: "e1" }, target: { node: "right" } },
      { id: "o2", source: { node: "left" }, target: { node: "card", port: "w1" } },
    ],
  };
}

const corners = cornersRouter({ name: "corners" });
const byEdge = (routes: readonly Route[]): Map<string, Route> => new Map(routes.map((r) => [r.edge, r]));
const shrink = (b: Box, d: number): Box => ({ x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d });
const within = (p: Point, b: Box, eps = 1e-6): boolean => p.x >= b.x - eps && p.y >= b.y - eps && p.x <= b.x + b.w + eps && p.y <= b.y + b.h + eps;

/** This function gives the problems of each inner route: a point out of the bounds, a crossing of a child box, a stub that is not straight in. */
function problems(g: Graph, routes: readonly Route[], inset: number): string[] {
  const out: string[] = [];
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  for (const { edge, frame, plug } of splitFrames(g).inner) {
    const r = routes.find((x) => x.edge === edge.id);
    if (!r) {
      out.push(`${edge.id}: no route`);
      continue;
    }
    expect(r.frame, edge.id).toBe(frame);
    const f = nodes.get(frame)!;
    const bounds = shrink(f.box, inset);
    const pts = plug === "source" ? r.points : [...r.points].reverse();
    // The first point is the plug on the wall. Each other point is in the bounds.
    pts.slice(1).forEach((p, i) => {
      if (!within(p, bounds)) out.push(`${edge.id}: point ${i + 1} (${p.x}, ${p.y}) is out of the bounds`);
    });
    const [a, b] = pts as [Point, Point];
    if (a.x !== f.box.x && a.x !== f.box.x + f.box.w && a.y !== f.box.y && a.y !== f.box.y + f.box.h) out.push(`${edge.id}: the plug is not on the wall`);
    const across = a.x === f.box.x || a.x === f.box.x + f.box.w ? a.y === b.y : a.x === b.x;
    if (!across) out.push(`${edge.id}: the stub is not perpendicular to the wall`);
    if (!within(b, f.box)) out.push(`${edge.id}: the stub goes out of the frame`);
    const end = plug === "source" ? edge.target.node : edge.source.node;
    for (const n of g.nodes)
      if (n.parent === frame && n.id !== end)
        for (let i = 1; i < pts.length; i++) if (segmentHitsBox(pts[i - 1]!, pts[i]!, n.box, 1e-6)) out.push(`${edge.id}: segment ${i} crosses ${n.id}`);
  }
  return out;
}

/** A seeded generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded variant of the board: 4 to 8 rows of other widths and places, plugs at random fractions on all four walls, and edges from random rows. */
function variant(seed: number): Graph {
  const rnd = seeded(seed);
  const count = 4 + Math.floor(rnd() * 5);
  const h = 20 + Math.floor(rnd() * 8);
  const gap = 4 + Math.floor(rnd() * 6);
  const top = CARD.y + 18 + Math.floor(rnd() * 8);
  const nodes: Node[] = [];
  for (let i = 0; i < count && top + i * (h + gap) + h <= CARD.y + CARD.h - 18; i++) {
    const w = 120 + Math.floor(rnd() * 80);
    const x = CARD.x + 18 + Math.floor(rnd() * (CARD.w - 36 - w));
    nodes.push({ id: `r${i + 1}`, parent: "card", box: { x, y: top + i * (h + gap), w, h } });
  }
  const sides: Side[] = ["north", "east", "south", "west"];
  const ports: Port[] = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, side: sides[Math.floor(rnd() * 4)]!, along: 0.1 + 0.8 * rnd() }));
  const edges: Edge[] = nodes.map((n, i) => {
    const port = ports[Math.floor(rnd() * ports.length)]!.id;
    return i % 2 === 0 ? { id: `i${i}`, source: { node: n.id }, target: { node: "card", port } } : { id: `i${i}`, source: { node: "card", port }, target: { node: n.id } };
  });
  return { nodes: [{ id: "card", box: CARD, ports }, ...nodes], edges };
}

describe("the inner routes of a frame (INTERIOR-ROUTE)", () => {
  it("routes each inner edge in the bounds of its frame, around the other rows, on the fixture and 3 seeded variants", () => {
    for (const options of [{}, { smooth: true }, { frameInset: 8 }, { frameInset: 2 }] satisfies Partial<CornersOptions>[]) {
      const router = cornersRouter({ name: "corners", ...options });
      const inset = options.frameInset ?? 5;
      for (const [name, g] of [["fixture", board()], ...[1, 2, 3].map((s) => [`seed ${s}`, variant(s)] as const)] as const) {
        const routes = router.route(g).routes;
        expect(problems(g, routes, inset), `${name} ${JSON.stringify(options)}`).toEqual([]);
        expect(routes.length, name).toBe(g.edges.length);
      }
    }
  });

  it("joins the outer route and the inner route at one point of a wall plug, both perpendicular to the wall", () => {
    const g = board();
    for (const outer of [corners, sectionsRouter({ name: "sections" })]) {
      const out = byEdge(outer.route(g).routes);
      const inside = byEdge(corners.route(g).routes);
      // The plug e1 is on the east wall at a quarter of the height: (540, 150). The plug w1 is on the west wall: (300, 150).
      for (const [o, i, x, dir] of [
        ["o1", "i1", 540, 1],
        ["o2", "i3", 300, -1],
      ] as const) {
        const op = out.get(o)!.points;
        const ip = inside.get(i)!.points;
        const [oa, ob] = o === "o1" ? [op[0]!, op[1]!] : [op[op.length - 1]!, op[op.length - 2]!];
        const [ia, ib] = [ip[ip.length - 1]!, ip[ip.length - 2]!];
        expect(Math.hypot(oa.x - ia.x, oa.y - ia.y), `${outer.name} ${o}`).toBeLessThanOrEqual(0.5);
        expect(oa, `${outer.name} ${o}`).toEqual({ x, y: 150 });
        // The outer route leaves the wall outward, and the inner route leaves it inward. Both go along the normal of the wall.
        expect([ob.y, Math.sign(ob.x - x)], `${outer.name} ${o}`).toEqual([150, dir]);
        expect([ib.y, Math.sign(ib.x - x)], `${outer.name} ${i}`).toEqual([150, -dir]);
      }
    }
  });

  it("routes an inner edge whose plug has no outer edge", () => {
    const r = byEdge(corners.route(board()).routes).get("i5")!;
    expect(r.frame).toBe("card");
    expect(r.points.at(-1)).toEqual({ x: 540, y: 250 });
  });

  it("gives an inner edge no route from each other router, and the list of the routers that route inner edges stays pinned", () => {
    const g = board();
    const routing = listStrategies(STRATEGIES, "router")
      .filter((s) => s.run(g, {}).routes.some((r) => ["i1", "i3", "i5"].includes(r.edge)))
      .map((s) => s.name);
    expect(routing).toEqual(["corners", "corners-smooth"]);
    for (const s of listStrategies(STRATEGIES, "router")) expect(s.run(g, {}).routes.map((r) => r.edge), s.name).toEqual(expect.arrayContaining(["o1", "o2"]));
  });

  it("with outside: skip, gives no route to a row outside its card. With throw, it throws a RangeError. With clamp, it cuts the row", () => {
    const g = board((i) => (i === 2 ? { x: 480 } : {}));
    expect(() => corners.route(g)).toThrow(RangeError);
    const skip = byEdge(cornersRouter({ name: "c", outside: "skip" }).route(g).routes);
    expect([...skip.keys()].sort()).toEqual(["i1", "i5", "o1", "o2"]);
    const clamp = cornersRouter({ name: "c", outside: "clamp" }).route(g).routes;
    expect(clamp.find((r) => r.edge === "i3")?.frame).toBe("card");
    const cut = { ...g, nodes: g.nodes.map((n) => (n.id === "r3" ? { ...n, box: { ...n.box, w: 535 - 480 } } : n)) };
    expect(problems(cut, clamp, 5)).toEqual([]);
  });

  it("throws a RangeError for a parent that names no node and for a cycle of parents, in each router", () => {
    const g = board();
    const lost: Graph = { ...g, nodes: g.nodes.map((n) => (n.id === "r2" ? { ...n, parent: "nothing" } : n)) };
    const cycle: Graph = { ...g, nodes: g.nodes.map((n) => (n.id === "card" ? { ...n, parent: "r1" } : n)) };
    for (const s of listStrategies(STRATEGIES, "router")) {
      expect(() => s.run(lost, {}), s.name).toThrow(RangeError);
      expect(() => s.run(cycle, {}), s.name).toThrow(/cycle/);
    }
  });

  it("keeps the graph without parents as the same object, and reads and writes parent in an input file", () => {
    const plain: Graph = { nodes: [{ id: "a", box: CARD }], edges: [] };
    expect(splitFrames(plain).graph).toBe(plain);
    const g = board();
    const file = graphInput(g, { id: "frames/card/s1", set: "frames", family: "card", seed: 1 });
    expect(file.boxes.find((b) => b.id === "r1")?.parent).toBe("card");
    expect(inputGraph(file).nodes.find((n) => n.id === "r1")?.parent).toBe("card");
    expect(inputGraph(file).nodes.find((n) => n.id === "card")).not.toHaveProperty("parent");
  });
});
