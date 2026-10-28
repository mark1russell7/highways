import { boardUnit } from "../../bench/measures/routes.ts";
import { dist, polylineLength, type Point } from "../../geom.ts";
import { orderLanes } from "../../segments.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { arcPlace, firstRoutes, orderAlongRoutes, tidyPlan } from "../base.ts";
import { memberAt, type Highway, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";

/** The options of the highway strategy `frechet` (HWY-027 of the notes). */
export interface FrechetOptions extends Pick<WayOptions, "margin" | "k"> {
  /** Two parts of routes are one bundle when their discrete Fréchet distance is this value or less, as a multiple of `boardUnit`. The default is 1. */
  readonly eps: number;
  /** A bundle has this number of edges or more, with the reference edge. The default is 2. */
  readonly minSize: number;
  /** The reference part of a bundle is this length or longer, as a multiple of `boardUnit`. The default is 2. */
  readonly minLength: number;
  /** The distance between two samples of a route, as a multiple of `boardUnit`. The default is 0.5. */
  readonly step: number;
  /** A search starts at each sample of this number along each route. The default is 2. */
  readonly stride: number;
}

/** The default options of the strategy `frechet`. */
export const FRECHET_DEFAULTS: Readonly<Required<Omit<FrechetOptions, "margin" | "k">>> = Object.freeze({
  eps: 1,
  minSize: 2,
  minLength: 2,
  step: 0.5,
  stride: 2,
});

/** This function gives the points of a polyline at equal distances of `step` or less, with its first and its last point. */
export function samplesOf(line: readonly Point[], step: number): Point[] {
  if (line.length < 2) return [...line];
  const out: Point[] = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / Math.max(1e-9, step)));
    for (let s = 1; s <= n; s++) out.push({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n });
  }
  return out;
}

/** The cells of one row of the free space that a monotone path reaches. Each cell is a sorted index of the other curve. */
type Row = readonly number[];

/**
 * This function gives the next row of the free space of the discrete Fréchet distance. The curve `q` has a free start and a free end.
 * A cell `(j, b)` is free when the distance of `p[j]` to `q[b]` is `eps` or less.
 * A path reaches a free cell from `(j - 1, b)`, `(j - 1, b - 1)` or `(j, b - 1)`.
 */
export function nextRow(prev: Row, pj: Point, q: readonly Point[], eps: number): number[] {
  const out: number[] = [];
  if (prev.length === 0) return out;
  const has = new Set(prev);
  const last = prev[prev.length - 1]!;
  let left = false;
  for (let b = prev[0]!; b < q.length; b++) {
    const reach: boolean = dist(pj, q[b]!) <= eps && (has.has(b) || has.has(b - 1) || left);
    if (reach) out.push(b);
    left = reach;
    if (!reach && b > last) break;
  }
  return out;
}

/**
 * This function tells if a part of `q` has a discrete Fréchet distance of `eps` or less to the whole of `p`. The part of `q` is free to start and to end anywhere.
 * It uses the rows of `nextRow`.
 */
export function partWithin(p: readonly Point[], q: readonly Point[], eps: number): boolean {
  if (p.length === 0) return true;
  let row: number[] = [];
  for (let b = 0; b < q.length; b++) if (dist(p[0]!, q[b]!) <= eps) row.push(b);
  for (let j = 1; j < p.length && row.length > 0; j++) row = nextRow(row, p[j]!, q, eps);
  return row.length > 0;
}

/** One bundle of the search: the reference edge, the part of its samples, and the other edges with their sense. */
export interface FrechetBundle {
  readonly edge: string;
  readonly from: number;
  readonly to: number;
  readonly length: number;
  /** The other edges. `back` is true when the edge goes along the reference part in the reverse sense. */
  readonly members: readonly { readonly edge: string; readonly back: boolean }[];
}

/**
 * This function gives the bundles of the search (HWY-027, after Buchin, Buchin, Gudmundsson, Löffler and Luo 2011, in a simple exact form).
 * For each reference route and each start sample (at each `stride`), it grows the reference part one sample at a time.
 * It keeps the other routes, in both senses, with a part at a discrete Fréchet distance of `eps` or less.
 * It stops when fewer than `minSize - 1` routes remain.
 * Each start gives the part with the best score: the number of edges times the length.
 * The search uses the discrete distance on samples only. It does not use the continuous distance or the full free space diagram.
 */
export function frechetBundles(samples: ReadonlyMap<string, readonly Point[]>, eps: number, minSize: number, minLength: number, stride: number): FrechetBundle[] {
  const edges = [...samples.keys()];
  const curves = new Map<string, readonly Point[]>();
  for (const e of edges) {
    curves.set(`${e}\u0000f`, samples.get(e)!);
    curves.set(`${e}\u0000b`, [...samples.get(e)!].reverse());
  }
  // A grid of the samples of each curve, with cells of the side `eps`, finds the first row of each start.
  const cell = Math.max(1e-6, eps);
  const grid = new Map<string, Set<string>>();
  const cellKey = (p: Point): string => `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
  for (const [key, c] of curves)
    for (const p of c) {
      const k = cellKey(p);
      let set = grid.get(k);
      if (!set) grid.set(k, (set = new Set()));
      set.add(key);
    }
  const near = (p: Point): string[] => {
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const out = new Set<string>();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const k of grid.get(`${cx + dx},${cy + dy}`) ?? []) out.add(k);
    return [...out].sort();
  };
  const need = Math.max(1, minSize - 1);
  const out: FrechetBundle[] = [];
  for (const r of edges) {
    const p = samples.get(r)!;
    const lengths = [0];
    for (let i = 1; i < p.length; i++) lengths.push(lengths[i - 1]! + dist(p[i - 1]!, p[i]!));
    for (let i = 0; i < p.length - 1; i += Math.max(1, Math.round(stride))) {
      let rows = new Map<string, number[]>();
      for (const key of near(p[i]!)) {
        if (key.startsWith(`${r}\u0000`)) continue;
        const q = curves.get(key)!;
        const row: number[] = [];
        q.forEach((s, b) => {
          if (dist(p[i]!, s) <= eps) row.push(b);
        });
        if (row.length > 0) rows.set(key, row);
      }
      let best: FrechetBundle | undefined;
      let bestScore = 0;
      for (let j = i + 1; j < p.length; j++) {
        const next = new Map<string, number[]>();
        for (const [key, row] of rows) {
          const n = nextRow(row, p[j]!, curves.get(key)!, eps);
          if (n.length > 0) next.set(key, n);
        }
        rows = next;
        // One edge counts once: its forward sense wins over its reverse sense.
        const alive = new Map<string, boolean>();
        for (const key of rows.keys()) {
          const [edge, sense] = key.split("\u0000") as [string, string];
          if (!alive.has(edge) || sense === "f") alive.set(edge, sense === "b");
        }
        if (alive.size < need) break;
        const length = lengths[j]! - lengths[i]!;
        const score = (alive.size + 1) * length;
        if (length >= minLength && score > bestScore) {
          bestScore = score;
          best = { edge: r, from: i, to: j, length, members: [...alive].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([edge, back]) => ({ edge, back })) };
        }
      }
      if (best) out.push(best);
    }
  }
  return out;
}

/**
 * This function gives the highways of the subtrajectory clusters of the first routes (HWY-027). The samples of each route leave out its two end points.
 * The bundles go in the order of their score, the best first. A bundle keeps the members whose part of the route is not on a bundle already.
 * The spine of a highway is the reference part. Each member rides the whole spine, in its own sense.
 */
export function frechetPlan(input: HighwayInput, o: Readonly<FrechetOptions>): HighwayPlan {
  const graph = input.graph;
  const unit = boardUnit(graph);
  const finder = new WayFinder(graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const routes = firstRoutes(input);
  const step = Math.max(1e-3, o.step * unit);
  const samples = new Map<string, Point[]>();
  for (const e of graph.edges) {
    const route = routes.get(e.id);
    if (!route || route.length < 4) continue;
    const s = samplesOf(route.slice(1, -1), step);
    if (s.length >= 2) samples.set(e.id, s);
  }
  const minSize = Math.max(2, Math.round(o.minSize));
  const bundles = frechetBundles(samples, Math.max(1e-3, o.eps * unit), minSize, Math.max(finder.margin, o.minLength * unit), o.stride);
  bundles.sort((a, b) => (b.members.length + 1) * b.length - (a.members.length + 1) * a.length || (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : a.from - b.from));
  // The used parts of each route, as places along the route.
  const used = new Map<string, [number, number][]>();
  const free = (edge: string, lo: number, hi: number): boolean => (used.get(edge) ?? []).every(([a, b]) => hi <= a || lo >= b);
  const take = (edge: string, lo: number, hi: number): void => {
    const list = used.get(edge);
    if (list) list.push([lo, hi]);
    else used.set(edge, [[lo, hi]]);
  };
  const highways: Highway[] = [];
  for (const bundle of bundles) {
    const spine = samples.get(bundle.edge)!.slice(bundle.from, bundle.to + 1);
    if (polylineLength(spine) <= finder.margin) continue;
    const own = routes.get(bundle.edge)!;
    const span = (route: readonly Point[]): [number, number] => {
      const a = arcPlace(route, spine[0]!);
      const b = arcPlace(route, spine[spine.length - 1]!);
      return [Math.min(a, b), Math.max(a, b)];
    };
    const [rlo, rhi] = span(own);
    if (!free(bundle.edge, rlo, rhi)) continue;
    const riders = bundle.members.filter((m) => {
      const [lo, hi] = span(routes.get(m.edge)!);
      return free(m.edge, lo, hi);
    });
    if (riders.length + 1 < minSize) continue;
    const all = [{ edge: bundle.edge, back: false }, ...riders];
    for (const m of all) take(m.edge, ...span(routes.get(m.edge)!));
    const last = spine.length - 1;
    const trip = (m: { edge: string; back: boolean }): Point[] => {
      const r = routes.get(m.edge)!;
      const [from, to] = [r[0]!, r[r.length - 1]!];
      return m.back ? [to, ...spine, from] : [from, ...spine, to];
    };
    const lanes = orderLanes(
      spine,
      all.map((m) => ({ edge: m.edge, points: trip(m) })),
      "bundle",
    );
    const back = new Map(all.map((m) => [m.edge, m.back]));
    const members: HighwayMember[] = lanes.map((edge) => (back.get(edge) ? memberAt(spine, edge, last, 0) : memberAt(spine, edge, 0, last)));
    highways.push({ id: `h${highways.length}`, key: `f${highways.length}`, spine, lanes, members });
  }
  return tidyPlan(orderAlongRoutes({ highways }, routes));
}
