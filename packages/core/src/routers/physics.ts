import { inflate, segmentHitsBox, type Box, type Point } from "../geom.ts";
import { Grid } from "../grid.ts";
import { nodeIndex, type Graph, type Node, type Result, type Route } from "../model.ts";
import { cornersRouter } from "./corners.ts";

/** The options of the relaxation of the routes (PHYSICAL): the forces on the points of each route. */
export interface RelaxOptions {
  /** The number of the steps of the forces. The default of `repel` is 60. */
  readonly iterations: number;
  /** The number of the legs of each route after the resampling. Each route gets this number of legs, so a small move of the input gives a small move of the points. */
  readonly legs: number;
  /** The distance in units of the board up to which a box pushes a point. */
  readonly clearance: number;
  /** The weight of the push of the boxes. The value 0 turns it off. */
  readonly boxPush: number;
  /** The distance in units of the board up to which a point of another route pushes a point. */
  readonly gap: number;
  /** The weight of the push between the routes. The value 0 turns it off. */
  readonly edgePush: number;
  /** The weight of the spring that pulls each point to the middle of its two neighbors, from 0 to 1. */
  readonly spring: number;
}

/** The share of the force that one step applies. */
const STEP = 0.25;

/** The tolerance of the rule `no-pass-through` of `checkProperties`, in units of the board. */
const TOLERANCE = 0.5;

/** The squared length of the vector `(x, y)`. */
const sq = (x: number, y: number): number => x * x + y * y;

/** This function gives a polyline with `legs` legs of equal length along the polyline `p`. The two ends stay. */
export function resample(p: readonly Point[], legs: number): Point[] {
  const n = Math.max(1, Math.round(legs));
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1]! + Math.sqrt(sq(p[i]!.x - p[i - 1]!.x, p[i]!.y - p[i - 1]!.y)));
  const total = cum[cum.length - 1]!;
  const out: Point[] = [p[0]!];
  let j = 1;
  for (let k = 1; k < n; k++) {
    const at = (total * k) / n;
    while (j < p.length - 1 && cum[j]! < at) j++;
    const span = cum[j]! - cum[j - 1]!;
    const t = span > 1e-12 ? (at - cum[j - 1]!) / span : 0;
    const a = p[j - 1]!;
    const b = p[j]!;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  out.push(p[p.length - 1]!);
  return out;
}

/** This function gives the push of a box on the point `p`: away from the nearest point of the box, with the size `r (1 − d / r)²`. A point in the box goes away from its center. */
function pushOfBox(p: Point, b: Box, r: number): Point {
  const qx = Math.max(b.x, Math.min(b.x + b.w, p.x));
  const qy = Math.max(b.y, Math.min(b.y + b.h, p.y));
  const d2 = sq(p.x - qx, p.y - qy);
  if (d2 >= r * r) return { x: 0, y: 0 };
  if (d2 < 1e-18) {
    const cx = p.x - (b.x + b.w / 2);
    const cy = p.y - (b.y + b.h / 2);
    const c = Math.sqrt(sq(cx, cy));
    return c < 1e-9 ? { x: 0, y: -r } : { x: (r * cx) / c, y: (r * cy) / c };
  }
  const d = Math.sqrt(d2);
  const m = (r * (1 - d / r) ** 2) / d;
  return { x: m * (p.x - qx), y: m * (p.y - qy) };
}

/** This function moves the point `p` out of each box of `boxes` with the space `pad`, through the nearest side. It takes at most 4 passes. */
function outOf(boxes: Grid<Node>, skip: ReadonlySet<Node>, p: Point, pad: number): Point {
  let q = p;
  for (let pass = 0; pass < 4; pass++) {
    let hit: Box | undefined;
    boxes.query({ x: q.x - pad, y: q.y - pad, w: 2 * pad, h: 2 * pad }, (n) => {
      const b = n.box;
      if (!hit && !skip.has(n) && q.x > b.x - pad && q.x < b.x + b.w + pad && q.y > b.y - pad && q.y < b.y + b.h + pad) hit = b;
    });
    if (!hit) return q;
    const b = hit;
    const moves = [
      { d: q.x - (b.x - pad), p: { x: b.x - pad, y: q.y } },
      { d: b.x + b.w + pad - q.x, p: { x: b.x + b.w + pad, y: q.y } },
      { d: q.y - (b.y - pad), p: { x: q.x, y: b.y - pad } },
      { d: b.y + b.h + pad - q.y, p: { x: q.x, y: b.y + b.h + pad } },
    ];
    moves.sort((u, v) => u.d - v.d);
    q = moves[0]!.p;
  }
  return q;
}

/** This function tells if the box `outer` holds the box `inner`. */
const holds = (outer: Box, inner: Box): boolean =>
  outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.w >= inner.x + inner.w && outer.y + outer.h >= inner.y + inner.h;

/** The boxes of a graph in a grid. For each edge, `skip` gives the boxes that do not push: its two nodes and the frames that hold them. */
export interface BoxField {
  readonly grid: Grid<Node>;
  readonly skip: (edge: string) => ReadonlySet<Node>;
}

/** This function gives the box field of a graph (`BoxField`). */
export function boxField(graph: Graph, cell: number): BoxField {
  const grid = new Grid<Node>(Math.max(16, cell));
  for (const n of graph.nodes) grid.add(n, n.box);
  const byId = nodeIndex(graph);
  const frames = new Map<Node, Node[]>();
  const framesOf = (n: Node): Node[] => {
    let list = frames.get(n);
    if (!list) {
      const found: Node[] = [n];
      grid.query(n.box, (m) => {
        if (m !== n && holds(m.box, n.box)) found.push(m);
      });
      frames.set(n, (list = found));
    }
    return list;
  };
  const ends = new Map(graph.edges.map((e) => [e.id, e] as const));
  const memo = new Map<string, Set<Node>>();
  return {
    grid,
    skip: (edge) => {
      let set = memo.get(edge);
      if (!set) {
        const e = ends.get(edge);
        const s = e ? byId.get(e.source.node) : undefined;
        const t = e ? byId.get(e.target.node) : undefined;
        set = new Set([...(s ? framesOf(s) : []), ...(t ? framesOf(t) : [])]);
        memo.set(edge, set);
      }
      return set;
    },
  };
}

/**
 * This function relaxes the routes `start` with three forces (PHYSICAL). It gives the new points of each route, in the order of `start`.
 * - Each box pushes the points near it (`boxPush`, `clearance`). The boxes of the two ends of a route and the frames that hold them do not push.
 * - The points of other routes push each point (`edgePush`, `gap`).
 * - A spring pulls each point to the middle of its two neighbors (`spring`).
 *
 * Each route first gets `legs` legs of equal length. The two ends stay. All the points move together in each step, so the order of the edges does not change the result.
 * After the steps, each point that is in a box moves out of it.
 */
export function relaxRoutes(graph: Graph, start: readonly Route[], o: Readonly<RelaxOptions>): Route[] {
  const field = boxField(graph, 4 * Math.max(o.clearance, o.gap));
  let lines = start.map((r) => (r.points.length >= 2 ? resample(r.points, o.legs) : [...r.points]));
  const skips = start.map((r) => field.skip(r.edge));
  const gap = Math.max(1e-9, o.gap);
  const clearance = Math.max(1e-9, o.clearance);
  const limit = Math.min(gap, clearance) / 4;
  for (let it = 0; it < Math.max(0, Math.round(o.iterations)); it++) {
    // The points of the routes in a grid. The id of a point is its route times 2^20, plus its index.
    const points = new Grid<number>(gap);
    if (o.edgePush > 0)
      lines.forEach((l, e) => {
        for (let i = 1; i < l.length - 1; i++) points.add(e * 1_048_576 + i, { x: l[i]!.x, y: l[i]!.y, w: 0, h: 0 });
      });
    lines = lines.map((l, e) => {
      if (l.length < 3) return l;
      const next = [...l];
      for (let i = 1; i < l.length - 1; i++) {
        const p = l[i]!;
        let fx = 0;
        let fy = 0;
        if (o.boxPush > 0)
          field.grid.query({ x: p.x - clearance, y: p.y - clearance, w: 2 * clearance, h: 2 * clearance }, (n) => {
            if (skips[e]!.has(n)) return;
            const f = pushOfBox(p, n.box, clearance);
            fx += o.boxPush * f.x;
            fy += o.boxPush * f.y;
          });
        if (o.edgePush > 0)
          points.query({ x: p.x - gap, y: p.y - gap, w: 2 * gap, h: 2 * gap }, (id) => {
            const other = Math.floor(id / 1_048_576);
            if (other === e) return;
            const q = lines[other]![id - other * 1_048_576]!;
            const d2 = sq(p.x - q.x, p.y - q.y);
            if (d2 >= gap * gap || d2 < 1e-18) return;
            const d = Math.sqrt(d2);
            const m = (o.edgePush * gap * (1 - d / gap) ** 2) / d;
            fx += m * (p.x - q.x);
            fy += m * (p.y - q.y);
          });
        let mx = STEP * fx;
        let my = STEP * fy;
        const m2 = sq(mx, my);
        if (m2 > limit * limit) {
          const k = limit / Math.sqrt(m2);
          mx *= k;
          my *= k;
        }
        const a = l[i - 1]!;
        const b = l[i + 1]!;
        const s = Math.min(1, Math.max(0, o.spring));
        next[i] = { x: p.x + mx + s * ((a.x + b.x) / 2 - p.x), y: p.y + my + s * ((a.y + b.y) / 2 - p.y) };
      }
      return next;
    });
  }
  return start.map((r, e) => {
    const l = lines[e]!;
    return { edge: r.edge, points: l.map((p, i) => (i === 0 || i === l.length - 1 ? p : outOf(field.grid, skips[e]!, p, 1))) };
  });
}

/** This function tells if a route goes through a box that is not one of its two ends, as the rule `no-pass-through` of `checkProperties`. */
export function passesThrough(grid: Grid<Node>, route: Route, s: Node | undefined, t: Node | undefined): boolean {
  for (let i = 1; i < route.points.length; i++) {
    const p = route.points[i - 1]!;
    const q = route.points[i]!;
    if (grid.someSegment(p, q, 0, (n) => n !== s && n !== t && segmentHitsBox(p, q, inflate(n.box, -TOLERANCE)))) return true;
  }
  return false;
}

/**
 * This function removes the points of a polyline that are near the line of their neighbors. A point stays when its distance to the line from the last point that stays to the next point is more than `tolerance`.
 * So each point of the result is within `tolerance` of the polyline. A small move of the input gives a small move of the result.
 */
export function simplify(p: readonly Point[], tolerance: number): Point[] {
  if (p.length < 3) return [...p];
  const t2 = tolerance * tolerance;
  const out: Point[] = [p[0]!];
  for (let i = 1; i < p.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = p[i + 1]!;
    const q = p[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = sq(dx, dy);
    const cross = (q.x - a.x) * dy - (q.y - a.y) * dx;
    const d2 = l2 > 1e-18 ? (cross * cross) / l2 : sq(q.x - a.x, q.y - a.y);
    if (d2 > t2) out.push(q);
  }
  out.push(p[p.length - 1]!);
  return out;
}

/** The router that gives the route of an edge that the forces do not route well: `corners`, with its default options. */
const FALLBACK = cornersRouter({ name: "corners" });

/**
 * This function keeps the hard rules of a result of the forces. Each edge gets its route in `routes` if that route keeps the rule `no-pass-through`.
 * If not, it gets its route in `backup`, with the same test. If not, it gets the route of `corners`.
 * The result has the routes in the order of the edges of the graph, and `fallbacks` counts the routes that are not from `routes`.
 */
export function keepRules(graph: Graph, routes: readonly Route[], backup: readonly Route[] = []): Result & { readonly fallbacks: number } {
  const byId = nodeIndex(graph);
  const grid = new Grid<Node>(180);
  for (const n of graph.nodes) grid.add(n, n.box);
  const own = new Map(routes.map((r) => [r.edge, r] as const));
  const second = new Map(backup.map((r) => [r.edge, r] as const));
  let fallback: Map<string, Route> | undefined;
  let fallbacks = 0;
  const out: Route[] = [];
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    const good = (r: Route | undefined): r is Route => r !== undefined && r.points.length >= 2 && !passesThrough(grid, r, s, t);
    const r = own.get(e.id);
    if (good(r)) {
      out.push(r);
      continue;
    }
    fallbacks++;
    const b = second.get(e.id);
    if (good(b)) {
      out.push(b);
      continue;
    }
    fallback ??= new Map(FALLBACK.route(graph).routes.map((x) => [x.edge, x] as const));
    const f = fallback.get(e.id);
    if (f) out.push(f);
  }
  return { routes: out, fallbacks };
}
