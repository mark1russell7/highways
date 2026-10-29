import { center, dist, polylineLength, type Box, type Point } from "../../geom.ts";
import { levelLinks, type ItemPair } from "../../levels.ts";
import type { Level, LevelItem, LevelLink } from "../../model.ts";
import type { LevelInput } from "../../strategies/model.ts";
import { depthLevels, type DepthLevelOptions } from "../depths/index.ts";

/** The graph of the backbone of a level: the relative neighbourhood graph, or the Gabriel graph of the centers of the items. */
export type VenationBackbone = "rng" | "gabriel";

/** The values of `VenationBackbone`. */
export const VENATION_BACKBONES: readonly VenationBackbone[] = Object.freeze(["rng", "gabriel"]);

/** The options of the level strategy `venation` (NAT-016 of the nature notes): the options of `depths`, and the options of the backbone. */
export interface VenationOptions extends DepthLevelOptions {
  /** The graph of the backbone. The relative neighbourhood graph has fewer links than the Gabriel graph. The default is `rng`. */
  readonly backbone: VenationBackbone;
  /** The share of the cost of a backbone link that a later level link saves when an earlier level link uses it, from 0 to 0.8. The default is 0.4. */
  readonly discount: number;
  /** A level link takes its way on the backbone only when that way is this many times its direct link or less. The default is 1.5. */
  readonly detour: number;
  /** A level with more items than this number keeps the links of `depths`. The default is 400. */
  readonly maxItems: number;
}

/** The default options of the level strategy `venation`. */
export const VENATION_DEFAULTS: Readonly<VenationOptions> = Object.freeze({ backbone: "rng", discount: 0.4, detour: 1.5, maxItems: 400 });

/**
 * This function gives the links of the backbone of the points, as pairs of indices `i < j` (NAT-016).
 * With `rng`, the link `p q` exists when no third point `r` has `max(d(p, r), d(q, r)) < d(p, q)`.
 * With `gabriel`, the link exists when no third point is inside the circle with the diameter `p q`.
 */
export function backboneLinks(points: readonly Point[], backbone: VenationBackbone): [number, number][] {
  const out: [number, number][] = [];
  const n = points.length;
  const d2 = (a: Point, b: Point): number => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pq = d2(points[i]!, points[j]!);
      let keep = true;
      for (let r = 0; r < n && keep; r++) {
        if (r === i || r === j) continue;
        const pr = d2(points[i]!, points[r]!);
        const qr = d2(points[j]!, points[r]!);
        if (backbone === "rng" ? Math.max(pr, qr) < pq - 1e-9 : pr + qr < pq - 1e-9) keep = false;
      }
      if (keep) out.push([i, j]);
    }
  }
  return out;
}

/**
 * This function gives a way around the box `b`, inflated by `m`, from the point `a` to the point `c` of its boundary.
 * The way goes along the shorter side of the inflated box. It holds the two points at `m` out from `a` and `c`, and the corners between them.
 */
export function aroundBox(b: Box, m: number, a: Point, c: Point): Point[] {
  const x0 = b.x - m;
  const y0 = b.y - m;
  const x1 = b.x + b.w + m;
  const y1 = b.y + b.h + m;
  const w = x1 - x0;
  const h = y1 - y0;
  const per = 2 * (w + h);
  // The point on the boundary of the inflated box nearest to `p`, and its place along the boundary, clockwise from the top left corner.
  const onBoundary = (p: Point): { p: Point; t: number } => {
    const cx = Math.min(x1, Math.max(x0, p.x));
    const cy = Math.min(y1, Math.max(y0, p.y));
    const dl = cx - x0;
    const dr = x1 - cx;
    const dt = cy - y0;
    const db = y1 - cy;
    const least = Math.min(dl, dr, dt, db);
    if (least === dt) return { p: { x: cx, y: y0 }, t: cx - x0 };
    if (least === dr) return { p: { x: x1, y: cy }, t: w + (cy - y0) };
    if (least === db) return { p: { x: cx, y: y1 }, t: w + h + (x1 - cx) };
    return { p: { x: x0, y: cy }, t: 2 * w + h + (y1 - cy) };
  };
  const corners: { p: Point; t: number }[] = [
    { p: { x: x0, y: y0 }, t: 0 },
    { p: { x: x1, y: y0 }, t: w },
    { p: { x: x1, y: y1 }, t: w + h },
    { p: { x: x0, y: y1 }, t: 2 * w + h },
  ];
  const A = onBoundary(a);
  const C = onBoundary(c);
  const ahead = (C.t - A.t + per) % per;
  const out: Point[] = [A.p];
  if (ahead <= per / 2) {
    const list = corners.map((k) => ({ ...k, s: (k.t - A.t + per) % per })).filter((k) => k.s > 1e-9 && k.s < ahead - 1e-9);
    for (const k of list.sort((p, q) => p.s - q.s)) out.push(k.p);
  } else {
    const back = per - ahead;
    const list = corners.map((k) => ({ ...k, s: (A.t - k.t + per) % per })).filter((k) => k.s > 1e-9 && k.s < back - 1e-9);
    for (const k of list.sort((p, q) => p.s - q.s)) out.push(k.p);
  }
  out.push(C.p);
  return out.filter((p, i) => i === 0 || dist(p, out[i - 1]!) > 1e-9);
}

/**
 * This function gives the links of one level along a closed venation backbone (NAT-016, after Runions and others, 2005).
 * The backbone links the items by their relative neighbourhood graph or their Gabriel graph. Each backbone link goes around the other items.
 * The level links go in the order of their counts, the largest first. Each one takes the cheapest way on the backbone, with the cost `L (1 - discount)` for a used backbone link.
 * The way goes around each item between its two ends. A way longer than `detour` times the direct link, or a direct backbone link, keeps the direct link.
 */
export function venationLinks(items: readonly LevelItem[], direct: readonly LevelLink[], o: Readonly<VenationOptions>): LevelLink[] {
  if (direct.length < 2 || items.length < 3 || items.length > o.maxItems) return [...direct];
  const index = new Map(items.map((it, i) => [it.id, i]));
  const links = backboneLinks(items.map((it) => center(it.box)), o.backbone);
  const pairs: ItemPair[] = links.map(([i, j]) => ({ source: items[i]!.id, target: items[j]!.id, count: 1 }));
  const routed = levelLinks(items, pairs, o);
  const n = items.length;
  const next: { to: number; link: number }[][] = Array.from({ length: n }, () => []);
  const cost = routed.map((l) => polylineLength(l.points));
  routed.forEach((l, k) => {
    const i = index.get(l.source)!;
    const j = index.get(l.target)!;
    next[i]!.push({ to: j, link: k });
    next[j]!.push({ to: i, link: k });
  });
  const direct2 = new Set(links.map(([i, j]) => `${i},${j}`));
  const used = new Uint8Array(routed.length);
  const share = 1 - Math.min(0.8, Math.max(0, o.discount));
  const order = direct.map((_, k) => k).sort((p, q) => direct[q]!.count - direct[p]!.count || direct[p]!.source.localeCompare(direct[q]!.source) || direct[p]!.target.localeCompare(direct[q]!.target));
  const margin = o.margin ?? 5;
  const out = [...direct];
  for (const k of order) {
    const l = direct[k]!;
    const s = index.get(l.source);
    const t = index.get(l.target);
    if (s === undefined || t === undefined) continue;
    if (direct2.has(`${Math.min(s, t)},${Math.max(s, t)}`)) {
      const at = next[s]!.find((x) => x.to === t);
      if (at) used[at.link] = 1;
      continue;
    }
    // Dijkstra on the backbone. The graph is small, so a scan for the least open item is enough.
    const best = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const via = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    best[s] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && best[i]! < Infinity && (u < 0 || best[i]! < best[u]!)) u = i;
      if (u < 0 || u === t) break;
      done[u] = 1;
      for (const x of next[u]!) {
        const c = best[u]! + cost[x.link]! * (used[x.link] ? share : 1);
        if (c < best[x.to]! - 1e-9) {
          best[x.to] = c;
          from[x.to] = u;
          via[x.to] = x.link;
        }
      }
    }
    if (from[t]! < 0) continue;
    const hops: { link: number; forward: boolean }[] = [];
    for (let v = t; v !== s; v = from[v]!) hops.push({ link: via[v]!, forward: routed[via[v]!]!.target === items[v]!.id });
    hops.reverse();
    const points: Point[] = [];
    hops.forEach((h, i) => {
      const p = routed[h.link]!.points;
      const seq = h.forward ? [...p] : [...p].reverse();
      if (i > 0) {
        // The way goes around the item between the end of the hop before and the start of this hop.
        const item = items[index.get(h.forward ? routed[h.link]!.source : routed[h.link]!.target)!]!;
        const around = aroundBox(item.box, margin, points[points.length - 1]!, seq[0]!);
        points.pop();
        points.push(...around);
        seq.shift();
      }
      for (const q of seq) if (points.length === 0 || dist(q, points[points.length - 1]!) > 1e-9) points.push(q);
    });
    if (points.length < 2 || polylineLength(points) > o.detour * polylineLength(l.points)) continue;
    for (const h of hops) used[h.link] = 1;
    out[k] = { ...l, points };
  }
  return out;
}

/**
 * This function gives the zoom levels of the level strategy `venation` (NAT-016). The levels and their items are the levels of `depths`.
 * In each level with groups, the links take their ways along a closed venation backbone (`venationLinks`). The last level stays as in `depths`.
 */
export function venationLevels(input: LevelInput, options: Readonly<VenationOptions>): Level[] {
  const levels = depthLevels(input, options);
  return levels.map((level, i) => (i === levels.length - 1 ? level : { ...level, links: venationLinks(level.items, level.links, options) }));
}
