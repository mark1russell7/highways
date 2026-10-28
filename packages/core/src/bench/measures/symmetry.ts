import { center, dist, type Point } from "../../geom.ts";
import type { Graph, Route } from "../../model.ts";
import { boardUnit } from "./routes.ts";

const EPS = 1e-9;

/** One map of the board onto itself: a mirror on an axis through the center of the board, or the half turn about the center. */
type Map2 = (p: Point) => Point;

/** This function gives the corners of a polyline: the points without repeats and without inner points on a straight line. */
function cornersOf(points: readonly Point[]): Point[] {
  const q: Point[] = [];
  for (const v of points) if (q.length === 0 || dist(q[q.length - 1]!, v) > EPS) q.push(v);
  const out: Point[] = [];
  for (let i = 0; i < q.length; i++) {
    const v = q[i]!;
    if (i > 0 && i + 1 < q.length) {
      const a = out[out.length - 1]!;
      const c = q[i + 1]!;
      const cr = (v.x - a.x) * (c.y - v.y) - (v.y - a.y) * (c.x - v.x);
      const dt = (v.x - a.x) * (c.x - v.x) + (v.y - a.y) * (c.y - v.y);
      if (Math.abs(cr) <= EPS * Math.max(1, dist(a, v) * dist(v, c)) && dt > 0) continue;
    }
    out.push(v);
  }
  return out;
}

/** This function tells if two lists of corners are the same, point by point, within `tol`. */
const sameCorners = (a: readonly Point[], b: readonly Point[], tol: number): boolean => a.length === b.length && a.every((p, i) => dist(p, b[i]!) <= tol);

/**
 * This function gives the symmetry of the drawing (H3 of MEAS0). The value is the share of the routes that the best map of the board sends onto a route.
 * The maps are the two mirrors on the axes and the half turn. Each one goes through the center of the boxes.
 *
 * A route of the edge `(s, t)` maps when two things are true. The map sends the centers of `s` and `t` to the centers of the nodes `s'` and `t'`, within `u / 4`.
 * A route of an edge between `s'` and `t'` has the same corners as the mapped route, within `u / 4`. `u` is the unit of the board.
 *
 * The scale is 0 to 1, and higher is better. A router keeps the symmetry that the boxes have, or loses it. Routes without points give `undefined`.
 * The cost is linear in the points of the routes.
 */
export function routeSymmetry(graph: Graph, routes: readonly Route[]): number | undefined {
  const drawn = routes.filter((r) => r.points.length >= 2);
  if (drawn.length === 0 || graph.nodes.length === 0) return undefined;
  const u = boardUnit(graph);
  const tol = u / 4;
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const n of graph.nodes) {
    x0 = Math.min(x0, n.box.x);
    y0 = Math.min(y0, n.box.y);
    x1 = Math.max(x1, n.box.x + n.box.w);
    y1 = Math.max(y1, n.box.y + n.box.h);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const maps: readonly Map2[] = [(p) => ({ x: 2 * cx - p.x, y: p.y }), (p) => ({ x: p.x, y: 2 * cy - p.y }), (p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y })];
  // The nodes by a cell of the size `tol`, so the node at a mapped center is a lookup of 9 cells.
  const cellOf = (p: Point): [number, number] => [Math.floor(p.x / tol), Math.floor(p.y / tol)];
  const cells = new Map<string, { id: string; at: Point }[]>();
  const at = new Map<string, Point>();
  for (const n of graph.nodes) {
    const c = center(n.box);
    at.set(n.id, c);
    const [i, j] = cellOf(c);
    const k = `${i},${j}`;
    const list = cells.get(k);
    if (list) list.push({ id: n.id, at: c });
    else cells.set(k, [{ id: n.id, at: c }]);
  }
  const nodeAt = (p: Point): string | undefined => {
    const [i, j] = cellOf(p);
    let best: { id: string; d: number } | undefined;
    for (let a = i - 1; a <= i + 1; a++)
      for (let b = j - 1; b <= j + 1; b++)
        for (const n of cells.get(`${a},${b}`) ?? []) {
          const d = dist(n.at, p);
          if (d <= tol && (best === undefined || d < best.d || (d === best.d && n.id < best.id))) best = { id: n.id, d };
        }
    return best?.id;
  };
  const ends = new Map(graph.edges.map((e) => [e.id, [e.source.node, e.target.node] as const]));
  const byPair = new Map<string, Point[][]>();
  const corners = drawn.map((r) => cornersOf(r.points));
  drawn.forEach((r, i) => {
    const e = ends.get(r.edge);
    if (!e) return;
    const k = `${e[0]}\u0000${e[1]}`;
    const list = byPair.get(k);
    if (list) list.push(corners[i]!);
    else byPair.set(k, [corners[i]!]);
  });
  let best = 0;
  for (const m of maps) {
    let hits = 0;
    drawn.forEach((r, i) => {
      const e = ends.get(r.edge);
      if (!e) return;
      const a = at.get(e[0]);
      const b = at.get(e[1]);
      const s = a && nodeAt(m(a));
      const t = b && nodeAt(m(b));
      if (s === undefined || t === undefined) return;
      const mapped = corners[i]!.map(m);
      const back = [...mapped].reverse();
      const hit = (byPair.get(`${s}\u0000${t}`) ?? []).some((c) => sameCorners(mapped, c, tol)) || (byPair.get(`${t}\u0000${s}`) ?? []).some((c) => sameCorners(back, c, tol));
      if (hit) hits++;
    });
    best = Math.max(best, hits / drawn.length);
  }
  return best;
}
