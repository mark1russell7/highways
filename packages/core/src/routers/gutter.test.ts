import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bendCount, segmentHitsBox, segmentsCross, type Box, type Point } from "../geom.ts";
import { splitFrames, type Edge, type Graph, type Node, type Port, type Route, type Side } from "../model.ts";
import { cornersRouter, type CornersOptions } from "./corners.ts";

// Made-up cards with rows. The card of 240 px holds rows of 24 px with a gap of 6 px.
const CARD: Box = { x: 300, y: 100, w: 240, h: 200 };
const gutter = cornersRouter({ name: "gutter", inner: "gutter" });

/** This function gives `count` rows of the card, from `top`, with the gap `gap` and the space `pad` to each side wall. */
function rowsOf(card: Box, count: number, top: number, gap: number, pad: number): Node[] {
  return Array.from({ length: count }, (_, i) => ({ id: `r${i + 1}`, parent: "card", box: { x: card.x + pad, y: top + i * (24 + gap), w: card.w - 2 * pad, h: 24 } }));
}

/** This function gives a plug of the card on a side wall at the height `y`. */
const plugAt = (card: Box, id: string, side: Side, y: number): Port => ({ id, side, along: (y - card.y) / card.h });
const toPlug = (id: string, row: string, port: string): Edge => ({ id, source: { node: row }, target: { node: "card", port } });
const fromPlug = (id: string, port: string, row: string): Edge => ({ id, source: { node: "card", port }, target: { node: row } });

/**
 * The card of 6 full-width rows from y 113, with the gap 6. The gaps have the middles 140, 170, 200, 230 and 260, and the strip at the top has the middle 106.
 * The plugs are at those heights, on both side walls. Each edge goes from a row to a plug next to it.
 */
function sixRows(pad: number, extra: readonly Edge[] = []): Graph {
  const ports: Port[] = [
    plugAt(CARD, "e1", "east", 140),
    plugAt(CARD, "e2", "east", 200),
    plugAt(CARD, "e3", "east", 260),
    plugAt(CARD, "w1", "west", 170),
    plugAt(CARD, "w2", "west", 230),
    plugAt(CARD, "w3", "west", 106),
  ];
  const edges: Edge[] = [
    toPlug("a", "r1", "e1"),
    fromPlug("b", "e1", "r2"),
    toPlug("c", "r3", "e2"),
    toPlug("d", "r6", "e3"),
    toPlug("e", "r2", "w1"),
    toPlug("f", "r4", "w2"),
    toPlug("g", "r1", "w3"),
    fromPlug("h", "w2", "r5"),
    ...extra,
  ];
  return { nodes: [{ id: "card", box: CARD, ports }, ...rowsOf(CARD, 6, 113, 6, pad)], edges };
}

/** The card of 20 rows with the gap 6 and the space 4 to the walls. 14 plugs on the east wall go to 14 rows, in the order of the rows. */
function twentyRows(): Graph {
  const card: Box = { x: 300, y: 100, w: 240, h: 20 * 24 + 19 * 6 + 20 };
  const ports: Port[] = Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, side: "east", along: (i + 1) / 30 }));
  const rows = [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17, 18, 19];
  const edges = rows.map((r, i) => toPlug(`x${i}`, `r${r + 1}`, `p${i}`));
  return { nodes: [{ id: "card", box: card, ports }, ...rowsOf(card, 20, 110, 6, 4)], edges };
}

/** The counts of one result: the inner routes, the crossings of a row, the legs that are not horizontal or vertical, the bends, the crossings of two routes and the overlaps of two lanes. */
interface Counts {
  readonly routes: number;
  readonly rowCrossings: number;
  readonly slanted: number;
  readonly bends: number;
  readonly crossings: number;
  readonly overlaps: number;
}

/** This function counts the problems of the inner routes of `g`, and checks that each route leaves its plug into the frame, perpendicular to the wall. */
function counts(g: Graph, routes: readonly Route[]): Counts {
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  const inner = splitFrames(g).inner;
  const mine = routes.filter((r) => r.frame !== undefined);
  let rowCrossings = 0;
  let slanted = 0;
  let bends = 0;
  const plugOf = new Map<string, string>();
  for (const r of mine) {
    const { edge, frame, plug } = inner.find((x) => x.edge.id === r.edge)!;
    plugOf.set(r.edge, (plug === "source" ? edge.source.port : edge.target.port)!);
    const f = nodes.get(frame)!.box;
    const pts = plug === "source" ? r.points : [...r.points].reverse();
    const [a, b] = pts as [Point, Point];
    const onSide = a.x === f.x || a.x === f.x + f.w;
    expect(onSide || a.y === f.y || a.y === f.y + f.h, `${r.edge}: the plug is on the wall`).toBe(true);
    expect(onSide ? a.y === b.y && Math.abs(b.x - f.x - f.w / 2) <= Math.abs(a.x - f.x - f.w / 2) : a.x === b.x, `${r.edge}: the stub goes in`).toBe(true);
    for (const p of pts) expect(p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h, `${r.edge}: in the frame`).toBe(true);
    const end = plug === "source" ? edge.target.node : edge.source.node;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!;
      const q = pts[i]!;
      if (p.x !== q.x && p.y !== q.y) slanted++;
      for (const n of g.nodes) if (n.parent === frame && n.id !== end && segmentHitsBox(p, q, n.box, 1e-6)) rowCrossings++;
    }
    bends += bendCount(pts);
  }
  let crossings = 0;
  let overlaps = 0;
  for (let i = 0; i < mine.length; i++)
    for (let j = i + 1; j < mine.length; j++) {
      const p = mine[i]!.points;
      const q = mine[j]!.points;
      // Two routes from one plug share the stub of the plug. That is not an overlap of two lanes.
      const share = plugOf.get(mine[i]!.edge) === plugOf.get(mine[j]!.edge);
      for (let a = 1; a < p.length; a++)
        for (let b = 1; b < q.length; b++) {
          if (segmentsCross(p[a - 1]!, p[a]!, q[b - 1]!, q[b]!)) crossings++;
          if (!share && overlap(p[a - 1]!, p[a]!, q[b - 1]!, q[b]!)) overlaps++;
        }
    }
  return { routes: mine.length, rowCrossings, slanted, bends, crossings, overlaps };
}

/** This function tells if two collinear axis-parallel segments share a part longer than a tiny length. */
function overlap(a: Point, b: Point, c: Point, d: Point): boolean {
  const part = (p: number, q: number, r: number, s: number): number => Math.min(Math.max(p, q), Math.max(r, s)) - Math.max(Math.min(p, q), Math.min(r, s));
  if (a.y === b.y && c.y === d.y && a.y === c.y) return part(a.x, b.x, c.x, d.x) > 1e-6;
  if (a.x === b.x && c.x === d.x && a.x === c.x) return part(a.y, b.y, c.y, d.y) > 1e-6;
  return false;
}

describe("the inner routes of the mode gutter (INTERIOR-GUTTER)", () => {
  it("routes each edge in a gap between full-width rows that touch both side walls, with only horizontal and vertical legs", () => {
    const g = sixRows(0);
    const c = counts(g, gutter.route(g).routes);
    expect(c).toEqual({ routes: 8, rowCrossings: 0, slanted: 0, bends: 8, crossings: 0, overlaps: 0 });
  });

  it("routes each edge on rows 4 px from the walls, also the edges to far rows through the strips at the walls", () => {
    const g = sixRows(4, [toPlug("far1", "r1", "e3"), toPlug("far2", "r6", "w3"), fromPlug("far3", "e2", "r5")]);
    const c = counts(g, gutter.route(g).routes);
    expect(c).toMatchObject({ routes: 11, rowCrossings: 0, slanted: 0, overlaps: 0 });
  });

  it("finds each route of 14 plugs on one wall to 20 rows, with 0 crossings and lanes that do not overlap", () => {
    const g = twentyRows();
    const routes = gutter.route(g).routes;
    const c = counts(g, routes);
    expect(c).toMatchObject({ routes: 14, rowCrossings: 0, slanted: 0, crossings: 0, overlaps: 0 });
    // The 13 routes that go down the strip at the east wall take 13 lanes, evenly spaced in the strip of 4 px.
    const lanes = routes.filter((r) => r.points.length === 4).map((r) => r.points[1]!.x);
    expect(lanes.length).toBe(13);
    expect(new Set(lanes.map((x) => x.toFixed(6))).size).toBe(13);
    for (const x of lanes) expect(x > 536 && x < 540).toBe(true);
  });

  it("gives the stub only, for a plug level with its row", () => {
    for (const pad of [0, 4]) {
      const g: Graph = {
        nodes: [{ id: "card", box: CARD, ports: [plugAt(CARD, "e", "east", 125), plugAt(CARD, "w", "west", 185)] }, ...rowsOf(CARD, 6, 113, 6, pad)],
        edges: [toPlug("s1", "r1", "e"), fromPlug("s2", "w", "r3")],
      };
      const round = (p: Point): Point => ({ x: Math.round(p.x * 1e6) / 1e6, y: Math.round(p.y * 1e6) / 1e6 });
      const routes = new Map(gutter.route(g).routes.map((r) => [r.edge, r.points.map(round)]));
      expect(routes.get("s1"), `pad ${pad}`).toEqual([
        { x: 540 - pad, y: 125 },
        { x: 540, y: 125 },
      ]);
      expect(routes.get("s2"), `pad ${pad}`).toEqual([
        { x: 300, y: 185 },
        { x: 300 + pad, y: 185 },
      ]);
    }
  });

  it("gives no route and no throw for the edges that rows with the gap 0 and the space 0 block", () => {
    const card: Box = { x: 300, y: 100, w: 240, h: 6 * 24 };
    const g: Graph = {
      nodes: [{ id: "card", box: card, ports: [plugAt(card, "e1", "east", 112), plugAt(card, "e2", "east", 160), plugAt(card, "w1", "west", 136)] }, ...rowsOf(card, 6, 100, 0, 0)],
      // The plug e1 is level with r1, e2 with r3 and w1 with r2.
      edges: [toPlug("level", "r1", "e1"), toPlug("blocked1", "r5", "e1"), toPlug("blocked2", "r1", "e2"), toPlug("blocked3", "r4", "w1"), toPlug("level2", "r3", "e2")],
    };
    const routes = gutter.route(g).routes;
    expect(routes.map((r) => r.edge).sort()).toEqual(["level", "level2"]);
    for (const r of routes) expect(r.points[0]).toEqual(r.points[1]);
  });

  it("keeps the inner routes of version 0.9.2 by default and with inner: corners", () => {
    const g = sixRows(20);
    const boards = [g, twentyRows(), sixRows(4, [toPlug("far1", "r1", "e3")])];
    for (const options of [{}, { smooth: true }, { frameInset: 8 }] satisfies Partial<CornersOptions>[]) {
      const base = boards.map((b) => cornersRouter({ name: "c", ...options }).route(b).routes);
      const same = boards.map((b) => cornersRouter({ name: "c", ...options, inner: "corners", bendCost: 50 }).route(b).routes);
      expect(same).toEqual(base);
    }
    const digest = createHash("sha256")
      .update(JSON.stringify(boards.map((b) => cornersRouter({ name: "c" }).route(b).routes)))
      .digest("hex");
    // The digest of the routes of version 0.9.2, before the mode gutter.
    expect(digest).toBe("bddc6d12c64fda12e9f0d3edb083f662c061675f7cfff3861140424828c23a83");
  });

  it("gives fewer bends or the same with a larger bend cost", () => {
    const g = sixRows(4, [toPlug("far1", "r1", "e3"), toPlug("far2", "r6", "w3"), fromPlug("far3", "e2", "r5")]);
    const low = counts(g, cornersRouter({ name: "g", inner: "gutter", bendCost: 0 }).route(g).routes);
    const high = counts(g, cornersRouter({ name: "g", inner: "gutter", bendCost: 100 }).route(g).routes);
    expect(high.bends).toBeLessThanOrEqual(low.bends);
    for (const c of [low, high]) expect(c).toMatchObject({ routes: 11, rowCrossings: 0, slanted: 0, overlaps: 0 });
  });
});
