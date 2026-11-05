import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import { segmentHitsBox, type Box, type Point } from "../../geom.ts";
import { Grid } from "../../grid.ts";
import { fixedPortPoint, nodeIndex, outerGraph, type End, type Graph, type Node, type Result, type Route, type Router } from "../../model.ts";

/** The distance from the bounding frame of the boxes to the ring of the routes. */
export const PERIMETER_MARGIN = 20;
/** The size limit of this router. */
const MAX_NODES = 10_000;
/** The size of a cell of the grid that finds the boxes on the way out. */
const CELL = 64;

/** A side of a box. Each side is also the side of the ring that the end goes to. */
type Side = "top" | "right" | "bottom" | "left";
const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

/** This function gives the middle of a side of the box. */
function sideMiddle(box: Box, side: Side): Point {
  const x = box.x + box.w / 2;
  const y = box.y + box.h / 2;
  if (side === "top") return { x, y: box.y };
  if (side === "bottom") return { x, y: box.y + box.h };
  return { x: side === "left" ? box.x : box.x + box.w, y };
}

/** This function gives the side of the box that is nearest to a point on the box. */
function nearestSide(box: Box, p: Point): Side {
  const far: readonly number[] = [Math.abs(p.y - box.y), Math.abs(box.x + box.w - p.x), Math.abs(box.y + box.h - p.y), Math.abs(p.x - box.x)];
  return SIDES[far.indexOf(Math.min(...far))]!;
}

/** This function gives the place on the ring straight out from `p` on the side `side`. */
function outOn(ring: Box, p: Point, side: Side): Point {
  if (side === "top") return { x: p.x, y: ring.y };
  if (side === "bottom") return { x: p.x, y: ring.y + ring.h };
  return { x: side === "left" ? ring.x : ring.x + ring.w, y: p.y };
}

/** This function gives the distance along the ring, clockwise from its top left corner, of a place on the ring. */
function along(ring: Box, p: Point): number {
  if (p.y === ring.y) return p.x - ring.x;
  if (p.x === ring.x + ring.w) return ring.w + (p.y - ring.y);
  if (p.y === ring.y + ring.h) return ring.w + ring.h + (ring.x + ring.w - p.x);
  return 2 * ring.w + ring.h + (ring.y + ring.h - p.y);
}

/** This function gives the corners of the ring on the shorter way between two places on the ring. A tie goes clockwise. */
function cornersBetween(ring: Box, from: Point, to: Point): Point[] {
  const size = 2 * (ring.w + ring.h);
  const corners: readonly { readonly at: number; readonly point: Point }[] = [
    { at: 0, point: { x: ring.x, y: ring.y } },
    { at: ring.w, point: { x: ring.x + ring.w, y: ring.y } },
    { at: ring.w + ring.h, point: { x: ring.x + ring.w, y: ring.y + ring.h } },
    { at: 2 * ring.w + ring.h, point: { x: ring.x, y: ring.y + ring.h } },
  ];
  const a = along(ring, from);
  const clockwise = (((along(ring, to) - a) % size) + size) % size;
  const forward = clockwise <= size / 2;
  const gone = (c: number): number => (forward ? ((c - a) % size) + size : ((a - c) % size) + size) % size;
  const span = forward ? clockwise : size - clockwise;
  return corners
    .filter((c) => gone(c.at) > 0 && gone(c.at) < span)
    .sort((p, q) => gone(p.at) - gone(q.at))
    .map((c) => c.point);
}

/**
 * A control of the benchmark: each end goes straight out past the bounding frame of the boxes, along the frame by the shorter way, and back in.
 * A free end takes the side with the fewest boxes on its way out, and then the shortest way out. This router pays any length for that.
 * On a board with many boxes, each way out of a box can cross a box, so this control usually does not buy `route.through`.
 * The router does not mark `through`, and it gives no shared run, as `straight`.
 */
export const perimeterRouter: Router = {
  name: "perimeter",
  maxNodes: MAX_NODES,
  route(input: Graph): Result {
    const graph = outerGraph(input);
    if (graph.nodes.length === 0) return { routes: [] };
    const x0 = Math.min(...graph.nodes.map((n) => n.box.x));
    const y0 = Math.min(...graph.nodes.map((n) => n.box.y));
    const x1 = Math.max(...graph.nodes.map((n) => n.box.x + n.box.w));
    const y1 = Math.max(...graph.nodes.map((n) => n.box.y + n.box.h));
    const ring: Box = { x: x0 - PERIMETER_MARGIN, y: y0 - PERIMETER_MARGIN, w: x1 - x0 + 2 * PERIMETER_MARGIN, h: y1 - y0 + 2 * PERIMETER_MARGIN };
    const grid = new Grid<Node>(CELL);
    for (const n of graph.nodes) grid.add(n, n.box);
    const hitsOut = (node: Node, a: Point, b: Point): number => {
      let hits = 0;
      grid.querySegment(a, b, 0, (other) => {
        if (other !== node && segmentHitsBox(a, b, other.box)) hits++;
      });
      return hits;
    };
    const freeEnds = new Map<string, { readonly plug: Point; readonly out: Point }>();
    const endOf = (node: Node, end: End): { readonly plug: Point; readonly out: Point } => {
      const fixed = fixedPortPoint(node, end);
      if (fixed) return { plug: fixed, out: outOn(ring, fixed, nearestSide(node.box, fixed)) };
      let best = freeEnds.get(node.id);
      if (best) return best;
      let score: readonly [number, number] = [Infinity, Infinity];
      for (const side of SIDES) {
        const plug = sideMiddle(node.box, side);
        const out = outOn(ring, plug, side);
        const here = [hitsOut(node, plug, out), Math.abs(plug.x - out.x) + Math.abs(plug.y - out.y)] as const;
        if (here[0] < score[0] || (here[0] === score[0] && here[1] < score[1])) [best, score] = [{ plug, out }, here];
      }
      freeEnds.set(node.id, best!);
      return best!;
    };
    const byId = nodeIndex(graph);
    const routes: Route[] = [];
    for (const e of graph.edges) {
      const s = byId.get(e.source.node);
      const t = byId.get(e.target.node);
      if (!s || !t) continue;
      const a = endOf(s, e.source);
      const b = endOf(t, e.target);
      const same = a.out.x === b.out.x && a.out.y === b.out.y;
      routes.push({ edge: e.id, points: [a.plug, a.out, ...cornersBetween(ring, a.out, b.out), ...(same ? [] : [b.out]), b.plug] });
    }
    return { routes };
  },
};

/** The strategy of the control `perimeter`. It is a baseline, so no chooser offers it and no default uses it. */
export const perimeterStrategy: Strategy<"router", object> = defineStrategy({
  step: "router",
  name: perimeterRouter.name,
  describe: "A control. Each end goes straight out past the frame of the boxes, along the frame, and back in.",
  defaults: {},
  schema: {},
  maxNodes: MAX_NODES,
  run: (graph: Graph): Result => perimeterRouter.route(graph),
});
