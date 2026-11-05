import { mulberry32 as seeded } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { graphInput, inputGraph } from "../bench/screen/forms.ts";
import { spikeEnds } from "../bench/measures/through-check.ts";
import { inBox, inflate, segmentHitsBox, type Box, type Point } from "../geom.ts";
import { splitFrames, type Edge, type Graph, type Node, type Port, type Route, type Side } from "../model.ts";
import { listStrategies, STRATEGIES } from "../strategies/index.ts";
import { cornersRouter, type CornersOptions } from "./corners.ts";
import { ROUTERS } from "./index.ts";
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
    // A sibling edge has no plug of a wall. The function siblingProblems checks it.
    if (plug === undefined) continue;
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
    for (const options of [{}, { smooth: true }, { frameInset: 8 }, { frameInset: 2 }, { inner: "gutter" }] satisfies Partial<CornersOptions>[]) {
      const router = cornersRouter({ name: "corners", ...options });
      // The mode gutter routes in the whole box of the frame (INTERIOR-GUTTER).
      const inset = "inner" in options ? 0 : (options.frameInset ?? 5);
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

const endOf = (node: string, port?: string): Edge["source"] => (port === undefined ? { node } : { node, port });
const edge = (id: string, s: string, t: string, sp?: string, tp?: string): Edge => ({ id, source: endOf(s, sp), target: endOf(t, tp) });

/**
 * A made-up board for the sibling edges (FRAME-SIBLINGS). The card `P` holds the rows `d` and `e`, the block `m` between them and the inner card `Q`.
 * The card `Q` holds the rows `q1`, `q2` and `q3`. The row `q2` is between `q1` and `q3`. The row `q1` has a fixed port and `q3` has a port on its west side.
 */
function siblings(): Graph {
  return {
    nodes: [
      { id: "P", box: { x: 100, y: 100, w: 520, h: 300 } },
      { id: "d", parent: "P", box: { x: 120, y: 120, w: 120, h: 40 } },
      { id: "m", parent: "P", box: { x: 110, y: 200, w: 200, h: 60 } },
      { id: "e", parent: "P", box: { x: 120, y: 330, w: 120, h: 40 } },
      { id: "Q", parent: "P", box: { x: 340, y: 120, w: 260, h: 260 } },
      ...[0, 1, 2].map((i): Node => ({ id: `q${i + 1}`, parent: "Q", box: { x: 360, y: 140 + i * 60, w: 220, h: 30 } })),
      { id: "q1p", parent: "Q", box: { x: 360, y: 320, w: 80, h: 30 }, ports: [{ id: "f", side: "east", along: 0.5 }] },
      { id: "q3p", parent: "Q", box: { x: 500, y: 320, w: 80, h: 30 }, ports: [{ id: "w", side: "west" }] },
      { id: "far", box: { x: 700, y: 100, w: 80, h: 40 } },
    ],
    edges: [
      edge("de", "d", "e"),
      edge("dQ", "d", "Q"),
      edge("q13", "q1", "q3"),
      edge("port", "q1p", "q3p", "f", "w"),
      edge("loop", "q2", "q2"),
      edge("cross", "d", "q1"),
      edge("away", "e", "far"),
    ],
  };
}

/** This function gives the nodes below `frame` that hold the node `id`, or the node itself at no depth. */
function holders(nodes: ReadonlyMap<string, Node>, frame: string, id: string): string[] {
  const out: string[] = [];
  for (let p = nodes.get(id)!.parent; p !== undefined && p !== frame; p = nodes.get(p)!.parent) out.push(p);
  return out;
}

/**
 * This function gives the problems of each route without a plug. A problem is no route, a wrong frame, a point out of the bounds, an end off its node or a crossing.
 * The obstacles are the children of the frame and of each frame that holds an end. A frame that holds an end is not an obstacle.
 */
function siblingProblems(g: Graph, routes: readonly Route[], inset: number, orthogonal: boolean): string[] {
  const out: string[] = [];
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  const onBorder = (p: Point, b: Box): boolean => within(p, b) && (p.x === b.x || p.x === b.x + b.w || p.y === b.y || p.y === b.y + b.h);
  for (const { edge, frame, plug } of splitFrames(g).inner) {
    if (plug !== undefined) continue;
    const r = routes.find((x) => x.edge === edge.id);
    if (!r) {
      out.push(`${edge.id}: no route`);
      continue;
    }
    if (r.frame !== frame) out.push(`${edge.id}: the frame is ${String(r.frame)}, not ${frame}`);
    const bounds = shrink(nodes.get(frame)!.box, inset);
    const s = nodes.get(edge.source.node)!.box;
    const t = nodes.get(edge.target.node)!.box;
    const open = new Set([frame, ...holders(nodes, frame, edge.source.node), ...holders(nodes, frame, edge.target.node)]);
    r.points.forEach((p, i) => {
      if (!within(p, bounds)) out.push(`${edge.id}: point ${i} (${p.x}, ${p.y}) is out of the bounds`);
    });
    if (!onBorder(r.points[0]!, s)) out.push(`${edge.id}: the first point is not on the source node`);
    if (!onBorder(r.points.at(-1)!, t)) out.push(`${edge.id}: the last point is not on the target node`);
    for (let i = 1; i < r.points.length; i++) {
      const [a, b] = [r.points[i - 1]!, r.points[i]!];
      if (orthogonal && a.x !== b.x && a.y !== b.y) out.push(`${edge.id}: segment ${i} is slanted`);
      for (const n of g.nodes)
        if (n.parent !== undefined && open.has(n.parent) && !open.has(n.id) && n.id !== edge.source.node && n.id !== edge.target.node && segmentHitsBox(a, b, n.box, 1e-6))
          out.push(`${edge.id}: segment ${i} crosses ${n.id}`);
    }
  }
  return out;
}

describe("the sibling edges of a frame (FRAME-SIBLINGS)", () => {
  it("takes out each edge between two children of one frame as an inner edge of that frame, without a plug", () => {
    const { graph, inner } = splitFrames(siblings());
    expect(inner.map((i) => [i.edge.id, i.frame])).toEqual([
      ["de", "P"],
      ["dQ", "P"],
      ["q13", "Q"],
      ["port", "Q"],
      ["loop", "Q"],
      ["cross", "P"],
    ]);
    for (const i of inner) expect(i, i.edge.id).not.toHaveProperty("plug");
    // An edge to a node outside the frame stays an outer edge.
    expect(graph.edges.map((e) => e.id)).toEqual(["away"]);
  });

  it("routes each sibling edge in its frame, around the other children, in the modes corners and gutter", () => {
    const g = siblings();
    for (const options of [{}, { smooth: true }, { frameInset: 8 }, { inner: "gutter" }] satisfies Partial<CornersOptions>[]) {
      const routes = cornersRouter({ name: "corners", ...options }).route(g).routes;
      const gutter = "inner" in options;
      expect(siblingProblems(g, routes, gutter ? 0 : (options.frameInset ?? 5), gutter), JSON.stringify(options)).toEqual([]);
      expect(routes.map((r) => r.edge).sort(), JSON.stringify(options)).toEqual(g.edges.map((e) => e.id).sort());
      const by = byEdge(routes);
      // The edge at two depths routes in the common frame. The edge out of the frame keeps an outer route.
      expect([by.get("cross")?.frame, by.get("away")?.frame]).toEqual(["P", undefined]);
      // The fixed port of q1p is the middle of its east side. The route ends on the west side of q3p.
      expect(by.get("port")!.points[0], JSON.stringify(options)).toEqual({ x: 440, y: 335 });
      expect(by.get("port")!.points.at(-1)!.x, JSON.stringify(options)).toBe(500);
    }
  });

  it("routes a self-loop in its frame: corners gives a stub out and back at one plug, gutter gives an orthogonal loop around the corner of the node", () => {
    const g = siblings();
    const loop = (options: Partial<CornersOptions>): Route => byEdge(cornersRouter({ name: "corners", ...options }).route(g).routes).get("loop")!;
    const corner = loop({});
    expect(corner.frame).toBe("Q");
    expect(corner.points).toHaveLength(4);
    expect(corner.points[0]).toEqual(corner.points[3]);
    const gutter = loop({ inner: "gutter" });
    expect(gutter.frame).toBe("Q");
    expect(gutter.points.length).toBeGreaterThan(2);
    expect(gutter.points[0]).not.toEqual(gutter.points.at(-1));
  });

  it("gives each sibling edge a route from each router, and keeps it an outer route in each router except corners", () => {
    const g = siblings();
    const names = splitFrames(g)
      .inner.filter((i) => i.plug === undefined)
      .map((i) => i.edge.id);
    for (const s of listStrategies(STRATEGIES, "router")) {
      const routes = byEdge(s.run(g, {}).routes);
      for (const id of names) expect(routes.has(id), `${s.name} ${id}`).toBe(true);
      const framed = names.filter((id) => routes.get(id)?.frame !== undefined);
      expect(framed, s.name).toEqual(s.name.startsWith("corners") ? names : []);
    }
  });
});

/**
 * A made-up board for the edges at two depths (INTERIOR-ROUTE slice 2). The frame `P` holds the nodes `a`, `m` and `b`, and the nested frames `Q`, `Z` and `R`.
 * `Q` holds `q1`, `q2` and `qp`. `Z` holds `z1`, and `Z` stands between `Q` and `b`. `R` holds `r1` and the frame `R2`, and `R2` holds `s1`, `s2` and `s3`.
 * The node `far` and the frame `G` with `g1` are not in `P`.
 */
function depths(): Graph {
  return {
    nodes: [
      { id: "P", box: { x: 100, y: 100, w: 720, h: 420 } },
      { id: "a", parent: "P", box: { x: 120, y: 130, w: 80, h: 30 }, ports: [{ id: "e", side: "east", along: 0.5 }] },
      { id: "m", parent: "P", box: { x: 240, y: 110, w: 30, h: 200 } },
      { id: "Q", parent: "P", box: { x: 300, y: 120, w: 200, h: 170 } },
      { id: "q1", parent: "Q", box: { x: 320, y: 140, w: 80, h: 30 } },
      { id: "q2", parent: "Q", box: { x: 320, y: 220, w: 80, h: 30 } },
      { id: "qp", parent: "Q", box: { x: 420, y: 220, w: 60, h: 30 }, ports: [{ id: "n", side: "north", along: 0.5 }] },
      { id: "Z", parent: "P", box: { x: 530, y: 120, w: 120, h: 170 }, ports: [{ id: "s", side: "south", along: 0.5 }] },
      { id: "z1", parent: "Z", box: { x: 550, y: 150, w: 80, h: 30 } },
      { id: "b", parent: "P", box: { x: 700, y: 180, w: 80, h: 30 } },
      { id: "R", parent: "P", box: { x: 300, y: 310, w: 500, h: 195 } },
      { id: "r1", parent: "R", box: { x: 320, y: 340, w: 100, h: 30 } },
      { id: "R2", parent: "R", box: { x: 460, y: 325, w: 320, h: 165 } },
      { id: "s1", parent: "R2", box: { x: 480, y: 345, w: 100, h: 30 } },
      { id: "s2", parent: "R2", box: { x: 480, y: 430, w: 100, h: 30 } },
      { id: "s3", parent: "R2", box: { x: 620, y: 385, w: 100, h: 30 } },
      { id: "far", box: { x: 900, y: 120, w: 80, h: 40 } },
      { id: "G", box: { x: 900, y: 300, w: 120, h: 120 } },
      { id: "g1", parent: "G", box: { x: 920, y: 330, w: 80, h: 30 } },
    ],
    edges: [
      edge("a-q1", "a", "q1"),
      edge("r1-a", "r1", "a"),
      edge("q1-r1", "q1", "r1"),
      edge("a-s1", "a", "s1"),
      edge("q2-s2", "q2", "s2"),
      edge("q1-b", "q1", "b"),
      edge("port", "a", "qp", "e", "n"),
      edge("Z-r1", "Z", "r1", "s"),
      edge("Q-s3", "Q", "s3"),
      edge("a-b", "a", "b"),
      edge("out", "a", "far"),
      edge("none", "q1", "g1"),
      edge("hold", "Q", "q1"),
    ],
  };
}

const AT_TWO_DEPTHS = ["a-q1", "r1-a", "q1-r1", "a-s1", "q2-s2", "q1-b", "port", "Z-r1", "Q-s3"];

/** A made-up board: the frame `Q` goes over the east wall of `P`, and the end `x` in `Q` goes out of `P` too. The plug `w` is on the west wall of `P`. */
function overflow(edges: readonly Edge[]): Graph {
  return {
    nodes: [
      { id: "P", box: { x: 100, y: 100, w: 300, h: 200 }, ports: [{ id: "w", side: "west", along: 0.5 }] },
      { id: "a", parent: "P", box: { x: 120, y: 120, w: 60, h: 30 } },
      { id: "Q", parent: "P", box: { x: 260, y: 120, w: 200, h: 120 } },
      { id: "x", parent: "Q", box: { x: 280, y: 140, w: 160, h: 30 } },
    ],
    edges,
  };
}

describe("the edges at two depths of a frame (INTERIOR-ROUTE slice 2)", () => {
  it("takes out each edge as an inner edge of the nearest common frame, without a plug", () => {
    const { graph, inner } = splitFrames(depths());
    expect(inner.map((i) => [i.edge.id, i.frame])).toEqual([...AT_TWO_DEPTHS.map((id) => [id, "P"]), ["a-b", "P"]]);
    for (const i of inner) expect(i, i.edge.id).not.toHaveProperty("plug");
    // No frame holds both ends of `out` and `none`. The node `Q` holds the other end of `hold`, and `hold` has no plug.
    expect(graph.edges.map((e) => e.id)).toEqual(["out", "none", "hold"]);
  });

  it("takes the nearest frame, not an outer one, for two nodes at the third depth", () => {
    const g: Graph = { ...depths(), edges: [edge("deep", "s1", "s3"), edge("near", "r1", "s2")] };
    const nested: Graph = { ...g, nodes: g.nodes.map((n) => (n.id === "s3" ? { ...n, parent: "R" } : n)) };
    expect(splitFrames(g).inner.map((i) => [i.edge.id, i.frame])).toEqual([
      ["deep", "R2"],
      ["near", "R"],
    ]);
    expect(splitFrames(nested).inner.map((i) => [i.edge.id, i.frame])).toEqual([
      ["deep", "R"],
      ["near", "R"],
    ]);
  });

  it("routes each edge in the common frame in the modes corners and gutter, into the frames of its ends and around each other node and frame", () => {
    const g = depths();
    for (const options of [{}, { smooth: true }, { frameInset: 8 }, { inner: "gutter" }, { inner: "gutter", bendCost: 2 }] satisfies Partial<CornersOptions>[]) {
      const routes = cornersRouter({ name: "corners", ...options }).route(g).routes;
      const gutter = "inner" in options;
      expect(siblingProblems(g, routes, gutter ? 0 : (options.frameInset ?? 5), gutter), JSON.stringify(options)).toEqual([]);
      expect(routes.map((r) => r.edge).sort(), JSON.stringify(options)).toEqual(g.edges.map((e) => e.id).sort());
      const by = byEdge(routes);
      for (const id of [...AT_TWO_DEPTHS, "a-b"]) expect(by.get(id)?.frame, `${id} ${JSON.stringify(options)}`).toBe("P");
      for (const id of ["out", "none", "hold"]) expect(by.get(id)?.frame, `${id} ${JSON.stringify(options)}`).toBeUndefined();
    }
  });

  it("uses the port of the node at each end, in the two directions of an edge", () => {
    const g = depths();
    for (const mode of ["corners", "gutter"] as const) {
      const by = byEdge(cornersRouter({ name: "corners", inner: mode }).route(g).routes);
      expect(by.get("port")!.points[0], mode).toEqual({ x: 200, y: 145 });
      expect(by.get("port")!.points.at(-1), mode).toEqual({ x: 450, y: 220 });
      // The node `Z` is an end of `Z-r1`, and its port is not a plug of a frame: `Z` does not hold `r1`.
      expect(by.get("Z-r1")!.points[0], mode).toEqual({ x: 590, y: 290 });
      const swapped: Graph = { ...g, edges: [edge("rev", "qp", "a", "n", "e")] };
      const rev = cornersRouter({ name: "corners", inner: mode }).route(swapped).routes[0]!;
      expect([rev.frame, rev.points[0], rev.points.at(-1)], mode).toEqual(["P", { x: 450, y: 220 }, { x: 200, y: 145 }]);
    }
  });

  it("gives one lane to each route of a shared room in the mode gutter", () => {
    const g: Graph = { ...depths(), edges: [edge("one", "a", "q1"), edge("two", "a", "q2"), edge("three", "m", "qp")] };
    const routes = cornersRouter({ name: "corners", inner: "gutter" }).route(g).routes;
    expect(routes).toHaveLength(3);
    expect(siblingProblems(g, routes, 0, true)).toEqual([]);
  });

  it("keeps an outer route in each router except corners, and no router loses a route", () => {
    const g = depths();
    for (const s of listStrategies(STRATEGIES, "router")) {
      const routes = byEdge(s.run(g, {}).routes);
      for (const e of g.edges) expect(routes.has(e.id), `${s.name} ${e.id}`).toBe(true);
      const framed = AT_TWO_DEPTHS.filter((id) => routes.get(id)?.frame !== undefined);
      expect(framed, s.name).toEqual(s.name.startsWith("corners") ? AT_TWO_DEPTHS : []);
    }
  });

  it("applies the rule outside to an end out of the common frame, in the two modes", () => {
    const g = overflow([edge("deep", "a", "x")]);
    for (const mode of ["corners", "gutter"] as const) {
      expect(() => cornersRouter({ name: "c", inner: mode }).route(g), mode).toThrow(/"x" is not inside the box of its frame "P"/);
      expect(cornersRouter({ name: "c", inner: mode, outside: "skip" }).route(g).routes, mode).toEqual([]);
      const [clamp] = cornersRouter({ name: "c", inner: mode, outside: "clamp" }).route(g).routes;
      expect(clamp?.frame, mode).toBe("P");
      for (const p of clamp!.points) expect(within(p, { x: 100, y: 100, w: 300, h: 200 }), mode).toBe(true);
    }
  });

  it("keeps the rule of an edge from a plug of a frame to a node at depth, with no edge at two depths in the room", () => {
    const g = overflow([edge("plug", "P", "x", "w")]);
    expect(corners.route(g).routes.map((r) => [r.edge, r.frame])).toEqual([["plug", "P"]]);
  });
});

describe("the field through of an inner route (INNER-THROUGH)", () => {
  // A made-up frame. The child `wall` goes from the top of the frame to its bottom, so no way joins the plug on the west wall to the child `far`.
  const closed: Graph = {
    nodes: [
      { id: "P", box: { x: 0, y: 0, w: 300, h: 100 }, ports: [{ id: "w", side: "west", along: 0.5 }] },
      { id: "wall", parent: "P", box: { x: 140, y: 0, w: 20, h: 100 } },
      { id: "far", parent: "P", box: { x: 220, y: 30, w: 40, h: 40 } },
    ],
    edges: [{ id: "cut", source: { node: "far" }, target: { node: "P", port: "w" } }],
  };

  it("names the box of a room that the route goes through", () => {
    const [route] = corners.route(closed).routes;
    expect(route?.frame).toBe("P");
    expect(route?.through).toEqual(["wall"]);
  });

  it("does not name an end of the route or a wall of the room", () => {
    const sibling: Graph = {
      nodes: [
        { id: "P", box: { x: 0, y: 0, w: 300, h: 100 } },
        { id: "a", parent: "P", box: { x: 20, y: 30, w: 40, h: 40 } },
        { id: "wall", parent: "P", box: { x: 140, y: 0, w: 20, h: 100 } },
        { id: "b", parent: "P", box: { x: 220, y: 30, w: 40, h: 40 } },
      ],
      edges: [{ id: "cut", source: { node: "a" }, target: { node: "b" } }],
    };
    expect(corners.route(sibling).routes.map((r) => [r.edge, r.through])).toEqual([["cut", ["wall"]]]);
  });

  it("leaves each route of the board with a way clean, in each mode", () => {
    for (const mode of ["corners", "gutter"] as const) {
      const { routes } = cornersRouter({ name: "c", inner: mode }).route(board());
      expect(routes.filter((r) => r.frame !== undefined).length, mode).toBeGreaterThan(0);
      expect(routes.filter((r) => r.through !== undefined), mode).toEqual([]);
    }
  });
});

describe("the first leg of an inner route (INNER-SPIKE)", () => {
  /** This function gives a made-up frame with a plug on each of its four walls. The rows leave gaps of 6, and each plug has a route to a far row. */
  const walledBy = (padding: number): Graph => ({
    nodes: [
      {
        id: "P",
        box: { x: 300, y: 100, w: 200 + 2 * padding, h: 174 + 2 * padding },
        ports: [
          { id: "n", side: "north", along: 0.5 },
          { id: "e", side: "east", along: 0.3 },
          { id: "s", side: "south", along: 0.5 },
          { id: "w", side: "west", along: 0.7 },
        ],
      },
      ...Array.from({ length: 6 }, (_, i): Node => ({ id: `row${i}`, parent: "P", box: { x: 300 + padding, y: 100 + padding + i * 30, w: 200, h: 24 } })),
    ],
    edges: [
      { id: "north", source: { node: "row4" }, target: { node: "P", port: "n" } },
      { id: "east", source: { node: "P", port: "e" }, target: { node: "row4" } },
      { id: "south", source: { node: "row1" }, target: { node: "P", port: "s" } },
      { id: "west", source: { node: "P", port: "w" }, target: { node: "row1" } },
    ],
  });
  const walled = walledBy(10);

  // The sums `inset + margin` fall below, on and above the padding of 10, so no one sum decides the test.
  const margins = [3, 5, 8];
  const insets = [2, 3, 4, 4.75, 5, 5.25, 6, 7, 8, 9];

  it("has no spike at any wall, for each margin and inset", () => {
    for (const margin of margins) {
      for (const frameInset of insets) {
        const routes = cornersRouter({ name: "c", margin, frameInset }).route(walled).routes;
        expect(routes.length).toBe(4);
        expect(routes.map((r) => [r.edge, spikeEnds(r.points)]).filter(([, n]) => n !== 0), `${margin}, ${frameInset}`).toEqual([]);
      }
    }
  });

  it("keeps each stop of a route in the bounds of its frame, and goes through no row", () => {
    for (const margin of margins) {
      for (const frameInset of insets) {
        const bounds = inflate({ x: 300, y: 100, w: 220, h: 194 }, 1e-5 - frameInset);
        for (const r of cornersRouter({ name: "c", margin, frameInset }).route(walled).routes) {
          const out = r.points.slice(1, -1).filter((p) => !inBox(p, bounds));
          expect(out, `${r.edge}, ${margin}, ${frameInset}`).toEqual([]);
          expect(r.through, `${r.edge}, ${margin}, ${frameInset}`).toBeUndefined();
        }
      }
    }
  });

  it("gives each wall half of a free strip that the inset does not fit, so a route stays out of the rows", () => {
    for (const padding of [2, 3, 4, 5]) {
      for (const margin of margins) {
        for (const r of cornersRouter({ name: "c", margin, frameInset: 5 }).route(walledBy(padding)).routes) {
          expect(spikeEnds(r.points), `${r.edge}, ${padding}, ${margin}`).toBe(0);
          expect(r.through, `${r.edge}, ${padding}, ${margin}`).toBeUndefined();
        }
      }
    }
  });

  it("draws one straight leg between a wall plug and the row that faces it", () => {
    const facing: Graph = {
      nodes: [
        { id: "P", box: { x: 0, y: 0, w: 220, h: 44 }, ports: [{ id: "w", side: "west", along: 0.5 }] },
        { id: "row", parent: "P", box: { x: 10, y: 10, w: 200, h: 24 } },
      ],
      edges: [{ id: "a", source: { node: "P", port: "w" }, target: { node: "row", port: "w" } }],
    };
    const nodes = facing.nodes.map((n) => (n.id === "row" ? { ...n, ports: [{ id: "w", side: "west" as const, along: 0.5 }] } : n));
    for (const edge of facing.edges) {
      expect(corners.route({ nodes, edges: [edge] }).routes[0]?.points).toEqual([{ x: 0, y: 22 }, { x: 10, y: 22 }]);
      const back = { ...edge, source: edge.target, target: edge.source };
      expect(corners.route({ nodes, edges: [back] }).routes[0]?.points).toEqual([{ x: 10, y: 22 }, { x: 0, y: 22 }]);
    }
  });

  it("stops on the bounds on the first leg, one inset from the wall", () => {
    const route = (edge: string): readonly Point[] => cornersRouter({ name: "c" }).route(walled).routes.find((r) => r.edge === edge)!.points;
    expect(route("east")[1]).toEqual({ x: 515, y: 100 + 194 * 0.3 });
    expect(route("west")[1]).toEqual({ x: 305, y: 100 + 194 * 0.7 });
    expect(route("north").at(-2)).toEqual({ x: 410, y: 105 });
    expect(route("south").at(-2)).toEqual({ x: 410, y: 289 });
  });
});

// A made-up board for the edges between frames: the cards A and C with a nested panel in A, the card B between them, and the node "solo" at the top level.
// Each edge between frames has no common frame, so the outer graph holds it.
function between(): Graph {
  const card = (id: string, x: number): Node => ({ id, box: { x, y: 100, w: 200, h: 220 } });
  const row = (id: string, parent: string, x: number, y: number): Node => ({ id, parent, box: { x, y, w: 160, h: 24 } });
  return {
    nodes: [
      card("A", 40),
      { id: "A_p", parent: "A", box: { x: 55, y: 200, w: 170, h: 100 } },
      row("A_1", "A", 60, 120),
      row("A_2", "A", 60, 160),
      row("A_p1", "A_p", 60, 215),
      row("A_p2", "A_p", 60, 260),
      card("B", 340),
      row("B_1", "B", 360, 150),
      row("B_2", "B", 360, 230),
      card("C", 640),
      row("C_1", "C", 660, 120),
      row("C_2", "C", 660, 260),
      { id: "solo", box: { x: 380, y: 420, w: 120, h: 40 } },
    ],
    edges: [
      { id: "a-c", source: { node: "A_1" }, target: { node: "C_2" } },
      { id: "deep-c", source: { node: "A_p2" }, target: { node: "C_1" } },
      { id: "solo-a", source: { node: "solo" }, target: { node: "A_p1" } },
      { id: "c-solo", source: { node: "C_2" }, target: { node: "solo" } },
      { id: "in-a", source: { node: "A_1" }, target: { node: "A_2" } },
      { id: "a-b", source: { node: "A_2" }, target: { node: "B_2" } },
    ],
  };
}

/** This function gives the ancestors of a node, the nearest first. */
function ancestorsOf(g: Graph, id: string): string[] {
  const parent = new Map(g.nodes.map((n) => [n.id, n.parent] as const));
  const out: string[] = [];
  for (let p = parent.get(id); p !== undefined; p = parent.get(p)) out.push(p);
  return out;
}

/** This function gives each box that a route goes through: not an end, and not a frame that holds an end. */
function crossed(g: Graph, r: Route): string[] {
  const e = g.edges.find((x) => x.id === r.edge)!;
  const skip = new Set([e.source.node, e.target.node, ...ancestorsOf(g, e.source.node), ...ancestorsOf(g, e.target.node)]);
  const out = new Set<string>();
  for (let i = 1; i < r.points.length; i++) for (const n of g.nodes) if (!skip.has(n.id) && segmentHitsBox(r.points[i - 1]!, r.points[i]!, n.box)) out.add(n.id);
  return [...out];
}

describe("the edges between frames (CROSS-FRAME-ROUTE)", () => {
  const CROSS = ["a-c", "deep-c", "solo-a", "c-solo", "a-b"];

  it("keeps each edge between frames in the outer graph, because no frame holds its two ends", () => {
    const { graph, inner } = splitFrames(between());
    expect(graph.edges.map((e) => e.id)).toEqual(CROSS);
    expect(inner.map((i) => i.edge.id)).toEqual(["in-a"]);
  });

  it("routes each edge between frames around each other box, from its source box to its target box, in the modes corners and gutter", () => {
    const g = between();
    for (const options of [{}, { smooth: true }, { frameInset: 8 }, { inner: "gutter" }] satisfies Partial<CornersOptions>[]) {
      const by = byEdge(cornersRouter({ name: "corners", ...options }).route(g).routes);
      for (const id of CROSS) {
        const r = by.get(id)!;
        const e = g.edges.find((x) => x.id === id)!;
        const box = (n: string): Box => g.nodes.find((x) => x.id === n)!.box;
        expect(crossed(g, r), `${id} ${JSON.stringify(options)}`).toEqual([]);
        expect(r.through, `${id} ${JSON.stringify(options)}`).toBeUndefined();
        expect(r.frame, id).toBeUndefined();
        expect([inBox(r.points[0]!, inflate(box(e.source.node), 1e-6)), inBox(r.points.at(-1)!, inflate(box(e.target.node), 1e-6))], id).toEqual([true, true]);
      }
    }
  });

  it("leaves the top frame of each end once, at one plug of its wall", () => {
    const g = between();
    const by = byEdge(corners.route(g).routes);
    const card = (n: string): Box => g.nodes.find((x) => x.id === n)!.box;
    const changes = (r: Route, b: Box): number =>
      r.points.slice(1).filter((p, i) => inBox(p, shrink(b, 1e-6)) !== inBox(r.points[i]!, shrink(b, 1e-6))).length;
    expect(changes(by.get("a-c")!, card("A"))).toBe(1);
    expect(changes(by.get("a-c")!, card("C"))).toBe(1);
    expect(changes(by.get("deep-c")!, card("A"))).toBe(1);
    expect(changes(by.get("solo-a")!, card("A"))).toBe(1);
    expect(changes(by.get("c-solo")!, card("C"))).toBe(1);
  });

  it("keeps the place of each edge between frames among the outer routes, and the inner routes after them", () => {
    expect(corners.route(between()).routes.map((r) => r.edge)).toEqual([...CROSS, "in-a"]);
  });

  it("gives the outer way between the two ends, as before, when a leg has no route", () => {
    const g = between();
    const out: Graph = { ...g, nodes: g.nodes.map((n) => (n.id === "C_2" ? { ...n, box: { ...n.box, x: 900 } } : n)) };
    const by = byEdge(cornersRouter({ name: "corners", outside: "skip" }).route(out).routes);
    expect(by.get("a-c")?.points.length).toBeGreaterThan(1);
    expect(by.has("deep-c")).toBe(true);
    expect(crossed(out, by.get("deep-c")!)).toEqual([]);
  });

  it("leaves the router straight as it was: one straight line for each edge between frames", () => {
    const straight = ROUTERS.find((r) => r.name === "straight")!;
    const by = byEdge(straight.route(between()).routes);
    for (const id of CROSS) expect(by.get(id)?.points, id).toHaveLength(2);
  });
});
