/**
 * The level strategy `detail` (WILD-016 with EDA-038): the level of detail of the bundles of each zoom level.
 * Two legs of level links that are closer on the screen than `pxMin` pixels become one stroke, with a width that grows with the count.
 */
import { segmentHitsBox, type Point } from "../../geom.ts";
import type { Level, LevelItem, LevelLink } from "../../model.ts";
import { itemSizes, PICK } from "../../pick.ts";
import type { LevelInput } from "../../strategies/model.ts";
import { depthLevels, type DepthLevelOptions } from "../depths/index.ts";

/** The growth of the width of a stroke with the number of its edges. */
export type WidthScale = "linear" | "sqrt" | "log";

/** The values of `WidthScale`. */
export const WIDTH_SCALES: readonly WidthScale[] = Object.freeze(["linear", "sqrt", "log"]);

/** The options of the level strategy `detail`: the options of `depths`, and the limits of the collapse. */
export interface DetailOptions extends DepthLevelOptions {
  /** Two parallel legs closer than this number of pixels on the screen become one stroke, from 0.5 to 4. The default is 3. */
  readonly pxMin: number;
  /** A stroke holds this number of edges or more, from 2 to 5. The default is 2. */
  readonly minCount: number;
  /** The width of a stroke of one edge, in pixels, from 1 to 4. The default is 1.5. A renderer reads it with `detailWidth`. */
  readonly w0: number;
  /** The growth of the width of a stroke with its count. The default is `log`. */
  readonly widthScale: WidthScale;
}

/** The default options of the level strategy `detail`. */
export const DETAIL_DEFAULTS: Readonly<DetailOptions> = Object.freeze({ pxMin: 3, minCount: 2, w0: 1.5, widthScale: "log" });

/**
 * This function gives the width of a stroke of `count` edges, in pixels (WILD-016). With `log`, it is `w0 × (1 + log2(count))`.
 * With `sqrt`, it is `w0 × sqrt(count)`. With `linear`, it is `w0 × count`.
 */
export function detailWidth(count: number, o: Pick<DetailOptions, "w0" | "widthScale"> = DETAIL_DEFAULTS): number {
  const c = Math.max(1, count);
  if (o.widthScale === "linear") return o.w0 * c;
  if (o.widthScale === "sqrt") return o.w0 * Math.sqrt(c);
  return o.w0 * (1 + Math.log2(c));
}

/** One inner leg of a level link, parallel to an axis. It has the index of the link and of its first point, its axis and its place across the axis. */
interface Leg {
  readonly link: number;
  readonly at: number;
  /** With `x`, the leg is horizontal. */
  readonly axis: "x" | "y";
  readonly across: number;
  readonly lo: number;
  readonly hi: number;
  readonly count: number;
}

/** This function gives the inner legs of the links that are parallel to an axis. The first and the last leg of a link touch its items, so they stay. */
function legsOf(links: readonly LevelLink[]): Leg[] {
  const out: Leg[] = [];
  links.forEach((l, link) => {
    const p = l.points;
    for (let at = 1; at + 2 < p.length; at++) {
      const a = p[at]!;
      const b = p[at + 1]!;
      if (Math.abs(a.y - b.y) <= 1e-9 && Math.abs(a.x - b.x) > 1e-9) out.push({ link, at, axis: "x", across: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), count: l.count });
      else if (Math.abs(a.x - b.x) <= 1e-9 && Math.abs(a.y - b.y) > 1e-9) out.push({ link, at, axis: "y", across: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y), count: l.count });
    }
  });
  return out;
}

/** This function takes out the repeated points and the points in the middle of a straight run. The first and the last point stay. */
function tidy(p: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const q of p) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - q.x) <= 1e-9 && Math.abs(last.y - q.y) <= 1e-9) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const cross = (b.x - a.x) * (q.y - b.y) - (b.y - a.y) * (q.x - b.x);
      const dot = (b.x - a.x) * (q.x - b.x) + (b.y - a.y) * (q.y - b.y);
      if (Math.abs(cross) <= 1e-9 && dot > 0) out.pop();
    }
    out.push(q);
  }
  if (out.length < 2 && p.length >= 2) return [p[0]!, p[p.length - 1]!];
  return out;
}

/**
 * This function collapses the legs of the links of one level that are closer than `tol` (WILD-016, EDA-038).
 * The legs of each axis go in clusters along the axis across it. The leg with the largest count of a cluster is its stroke, and each other leg moves onto it.
 * A cluster needs two legs whose projections overlap, and a count of `minCount` or more. A move that puts a leg through the box of an item does not happen.
 */
export function collapseLinks(items: readonly LevelItem[], links: readonly LevelLink[], tol: number, minCount: number): LevelLink[] {
  if (!(tol > 0)) return [...links];
  const points = links.map((l) => [...l.points]);
  const boxes = items.map((i) => i.box);
  const clear = (a: Point, b: Point): boolean => boxes.every((box) => !segmentHitsBox(a, b, box, 1e-3));
  for (const axis of ["x", "y"] as const) {
    const legs = legsOf(links.map((l, i) => ({ ...l, points: points[i]! })))
      .filter((g) => g.axis === axis)
      .sort((a, b) => a.across - b.across || a.lo - b.lo || a.link - b.link || a.at - b.at);
    const done = new Set<Leg>();
    for (const anchor of [...legs].sort((a, b) => b.count - a.count || b.hi - b.lo - (a.hi - a.lo) || a.link - b.link || a.at - b.at)) {
      if (done.has(anchor)) continue;
      const near = legs.filter((g) => !done.has(g) && g !== anchor && g.link !== anchor.link && Math.abs(g.across - anchor.across) < tol && Math.min(g.hi, anchor.hi) - Math.max(g.lo, anchor.lo) > 1e-9);
      if (near.length === 0 || near.reduce((s, g) => s + g.count, anchor.count) < minCount) continue;
      done.add(anchor);
      for (const g of near) {
        done.add(g);
        const p = points[g.link]!;
        const a = p[g.at]!;
        const b = p[g.at + 1]!;
        // The leg moves only when its two points are still where the scan found them: an earlier move of the same link can change them.
        if (axis === "x" ? a.y !== g.across || b.y !== g.across : a.x !== g.across || b.x !== g.across) continue;
        const a2 = axis === "x" ? { x: a.x, y: anchor.across } : { x: anchor.across, y: a.y };
        const b2 = axis === "x" ? { x: b.x, y: anchor.across } : { x: anchor.across, y: b.y };
        if (!clear(p[g.at - 1]!, a2) || !clear(a2, b2) || !clear(b2, p[g.at + 2]!)) continue;
        p[g.at] = a2;
        p[g.at + 1] = b2;
      }
    }
  }
  return links.map((l, i) => (points[i]!.every((q, k) => q === l.points[k]) ? l : { ...l, points: tidy(points[i]!) }));
}

/**
 * This function gives the zoom levels of the level strategy `detail` (WILD-016 with EDA-038). The levels and their items are the levels of `depths`.
 * A level with groups first shows at the scale `itemAt / size`, with `size` its median item (`pickLevel`). At that scale, `pxMin` pixels are `pxMin × size / itemAt` units.
 * The links of the level collapse their legs that are closer than that length (`collapseLinks`). The last level stays as in `depths`.
 */
export function detailLevels(input: LevelInput, options: Readonly<DetailOptions>): Level[] {
  const levels = depthLevels(input, options);
  const sizes = itemSizes(levels);
  return levels.map((level, i) => {
    if (i === levels.length - 1) return level;
    const tol = (options.pxMin * sizes[i]!) / PICK.itemAt;
    return { ...level, links: collapseLinks(level.items, level.links, tol, options.minCount) };
  });
}
