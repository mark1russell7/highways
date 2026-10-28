import { boardUnit } from "../../bench/measures/routes.ts";
import { dist, type Point } from "../../geom.ts";
import type { WayOptions } from "../../ways.ts";
import { arcPlace, basePlan, planRoutes, routeIndex, tidyPlan, type HighwayBase } from "../base.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { nearestOnLine } from "../sbeb/index.ts";
import { snapPlan, type SnapLine } from "../snap.ts";

/** The options of the highway strategy `crossbars` (HWY-022 of the notes). */
export interface CrossbarOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The plan that gets the bundled crossings. Only the edges outside its highways can be on a crossbar. The default is `shared-ways`. */
  readonly from: HighwayBase;
  /** Two segments are parallel when the angle between them is this value or less, in degrees. The default is 15. */
  readonly tolerance: number;
  /** Each side of a crossbar has this number of edges or more. The default is 2. */
  readonly minBar: number;
  /** The crossings of one crossbar are this distance or nearer to its first crossing, as a multiple of `boardUnit`. The default is 3. */
  readonly reach: number;
}

/** The default options of the strategy `crossbars`. */
export const CROSSBAR_DEFAULTS: Readonly<Required<Omit<CrossbarOptions, "margin" | "k">>> = Object.freeze({
  from: "shared-ways",
  tolerance: 15,
  minBar: 2,
  reach: 3,
});

/** One crossing of two routes: the edges, the point and the unit directions of the two segments there. */
export interface RouteCrossing {
  readonly e: string;
  readonly f: string;
  readonly p: Point;
  readonly de: Point;
  readonly df: Point;
}

/** This function gives the unit direction from `a` to `b`. */
const unit = (a: Point, b: Point): Point => {
  const l = dist(a, b);
  return l > 1e-12 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : { x: 1, y: 0 };
};

/** This function gives the point where the segments `a b` and `c d` cross inside both, or `undefined`. Segments that only touch at an end do not cross. */
function crossPoint(a: Point, b: Point, c: Point, d: Point): Point | undefined {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return undefined;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  const eps = 1e-9;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps ? { x: a.x + t * rx, y: a.y + t * ry } : undefined;
}

/** This function gives each crossing of two routes of the list, in the order of the list. */
export function routeCrossings(routes: readonly { readonly edge: string; readonly points: readonly Point[] }[]): RouteCrossing[] {
  const segs = routes.flatMap((r) =>
    r.points.slice(1).map((b, i) => {
      const a = r.points[i]!;
      return { edge: r.edge, a, b, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
    }),
  );
  const out: RouteCrossing[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    for (let j = i + 1; j < segs.length; j++) {
      const t = segs[j]!;
      if (t.edge === s.edge || t.x0 > s.x1 || t.x1 < s.x0 || t.y0 > s.y1 || t.y1 < s.y0) continue;
      const p = crossPoint(s.a, s.b, t.a, t.b);
      if (p) out.push({ e: s.edge, f: t.edge, p, de: unit(s.a, s.b), df: unit(t.a, t.b) });
    }
  }
  return out;
}

/** This function tells if two unit directions are parallel within the angle `tol` in radians, in either sense. */
const parallel = (u: Point, v: Point, tol: number): boolean => Math.abs(u.x * v.x + u.y * v.y) >= Math.cos(tol);

/** A crossbar: two sets of edges, with a crossing of each edge of `p` with each edge of `q` near one place. */
export interface Crossbar {
  readonly p: readonly string[];
  readonly q: readonly string[];
  /** The mean point of the crossings of the crossbar. */
  readonly at: Point;
  /** The mean direction of the side `p`, and of the side `q`. */
  readonly dp: Point;
  readonly dq: Point;
}

/**
 * This function gives the crossbars of a greedy search (HWY-022, after Fink, Hershberger, Suri and Verbeek 2016).
 * The search starts at each crossing in order. It grows the two sides while each new edge crosses each edge of the other side near the start, at the same angles.
 * A crossbar with `minBar` edges or more on each side is kept. Each edge is on one crossbar at most.
 */
export function greedyCrossbars(crossings: readonly RouteCrossing[], reach: number, tolDeg: number, minBar: number): Crossbar[] {
  const tol = (Math.max(0, tolDeg) * Math.PI) / 180;
  const used = new Set<string>();
  const out: Crossbar[] = [];
  for (const x of crossings) {
    if (used.has(x.e) || used.has(x.f)) continue;
    // The crossings near the start whose two segments are parallel to the two sides, as pairs (an edge of P, an edge of Q).
    const near = new Map<string, RouteCrossing & { pe: string; qe: string }>();
    for (const y of crossings) {
      if (dist(y.p, x.p) > reach || used.has(y.e) || used.has(y.f)) continue;
      if (parallel(y.de, x.de, tol) && parallel(y.df, x.df, tol)) near.set(`${y.e}\u0000${y.f}`, { ...y, pe: y.e, qe: y.f });
      else if (parallel(y.df, x.de, tol) && parallel(y.de, x.df, tol)) near.set(`${y.f}\u0000${y.e}`, { ...y, pe: y.f, qe: y.e, de: y.df, df: y.de });
    }
    const crosses = (pe: string, qe: string): boolean => near.has(`${pe}\u0000${qe}`);
    const P = [x.e];
    const Q = [x.f];
    const candP = [...new Set([...near.values()].map((c) => c.pe))].sort();
    const candQ = [...new Set([...near.values()].map((c) => c.qe))].sort();
    for (let grown = true; grown; ) {
      grown = false;
      for (const pe of candP)
        if (!P.includes(pe) && !Q.includes(pe) && Q.every((qe) => crosses(pe, qe))) {
          P.push(pe);
          grown = true;
        }
      for (const qe of candQ)
        if (!Q.includes(qe) && !P.includes(qe) && P.every((pe) => crosses(pe, qe))) {
          Q.push(qe);
          grown = true;
        }
    }
    if (P.length < Math.max(1, minBar) || Q.length < Math.max(1, minBar)) continue;
    const parts = P.flatMap((pe) => Q.map((qe) => near.get(`${pe}\u0000${qe}`)!));
    const at = { x: parts.reduce((s, c) => s + c.p.x, 0) / parts.length, y: parts.reduce((s, c) => s + c.p.y, 0) / parts.length };
    // The mean directions, each turned to the sense of the first crossing.
    const mean = (pick: (c: RouteCrossing) => Point, ref: Point): Point => {
      let sx = 0;
      let sy = 0;
      for (const c of parts) {
        const d = pick(c);
        const s = d.x * ref.x + d.y * ref.y >= 0 ? 1 : -1;
        sx += s * d.x;
        sy += s * d.y;
      }
      return unit({ x: 0, y: 0 }, { x: sx, y: sy });
    };
    out.push({ p: P, q: Q, at, dp: mean((c) => c.de, x.de), dq: mean((c) => c.df, x.df) });
    for (const e of [...P, ...Q]) used.add(e);
  }
  return out;
}

/**
 * This function gives the highways of the bundled crossings (HWY-022). The edges outside the highways of the plan `from` keep their routes after `follow`.
 * Each crossbar of those routes gives two highways, one for each side. Each spine is a line through the mean crossing, along the mean direction of its side.
 * It is `2 reach` long, and it goes through the corner graph. So each side crosses the other side at one place, as a bundle.
 * An edge joins the spine near the point of its route nearest to one end of the line. It leaves the spine near the other end.
 */
export function crossbarPlan(input: HighwayInput, o: Readonly<CrossbarOptions>): HighwayPlan {
  const way: WayOptions = { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) };
  const base = basePlan(input, o.from);
  const inPlan = new Set(base.highways.flatMap((h) => h.members.map((m) => m.edge)));
  const routes = routeIndex(planRoutes(input.graph, base).routes);
  const free = input.graph.edges.filter((e) => !inPlan.has(e.id) && routes.has(e.id)).map((e) => ({ edge: e.id, points: routes.get(e.id)!.slice(1, -1) }));
  const reach = Math.max(1e-3, o.reach * boardUnit(input.graph));
  const bars = greedyCrossbars(routeCrossings(free), reach, o.tolerance, o.minBar);
  const lines: SnapLine[] = [];
  bars.forEach((bar, i) => {
    for (const [side, d] of [
      [bar.p, bar.dp],
      [bar.q, bar.dq],
    ] as const) {
      const a = { x: bar.at.x - reach * d.x, y: bar.at.y - reach * d.y };
      const b = { x: bar.at.x + reach * d.x, y: bar.at.y + reach * d.y };
      const members = side.map((edge) => {
        const r = routes.get(edge)!;
        const from = nearestOnLine(r, a);
        const to = nearestOnLine(r, b);
        const total = arcPlace(r, r[r.length - 1]!);
        return { edge, from, to, at: total > 0 ? arcPlace(r, from) / total : 0 };
      });
      lines.push({ key: `x${i}`, a, b, members });
    }
  });
  const bars2 = snapPlan(input, lines, { ...way, minSize: 2 });
  return tidyPlan({ highways: [...base.highways, ...bars2.highways] });
}
