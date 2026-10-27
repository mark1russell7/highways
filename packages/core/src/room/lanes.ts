import { segmentHitsBox, type Box, type Point } from "../geom.ts";
import { Grid } from "../grid.ts";
import type { LevelLink } from "../model.ts";
import { boardGaps, type Boxed } from "./index.ts";

/**
 * The lane order of the pieces of the links in one gap.
 *
 * - `links`: the order of the list of links. This order reads nothing of the board.
 * - `ends`: the pieces that turn to the near side at their two ends come first. The pieces that turn to the far side come last.
 * - `crossings`: the order with the fewest crossings between the pieces of the gap and the legs at their ends. A local search finds it.
 */
export type LaneOrder = "links" | "ends" | "crossings";

/** The lane orders of `gapLanes`, in the order of the benchmark. */
export const LANE_ORDERS: readonly LaneOrder[] = ["links", "ends", "crossings"];

/** The options of `gapLanes`. */
export interface GapLaneOptions {
  /** The largest distance between two lanes. A narrow gap puts its lanes nearer. The default is 4. */
  readonly spacing?: number;
  /** The lane order in each gap. The default is `crossings`. */
  readonly order?: LaneOrder;
  /** Two box edges nearer than this distance make one boundary of the sweep, as in `boardGaps`. The default is 0.5. */
  readonly snap?: number;
}

/** A piece of a link: a leg of the link that runs along a gap. */
interface Piece {
  /** The index of the link. */
  readonly link: number;
  /** The index of the last point of the leg. The leg goes from the point `seg - 1` to the point `seg`. */
  readonly seg: number;
  /** The span of the leg along the gap. */
  readonly lo: number;
  readonly hi: number;
  /** For each end of the leg: its place along the gap, and the side (-1 or 1) across the gap where the link turns. */
  readonly turns: readonly (readonly [number, number])[];
}

const EPS = 1e-6;
const ROUNDS = 8;

/**
 * This function gives each link that runs along a gap its own lane in the gap. The lanes of a gap are `spacing` apart, around its middle line.
 * A leg of a link moves across its gap only, so the link keeps its plugs and the axes of its legs.
 * When a move puts a link through more boxes than before, the link keeps its points.
 */
export function gapLanes(items: readonly Boxed[], links: readonly LevelLink[], options: GapLaneOptions = {}): LevelLink[] {
  const spacing = Math.max(0, options.spacing ?? 4);
  const order = options.order ?? "crossings";
  const moved = links.map((l) => l.points.map((p) => ({ x: p.x, y: p.y })));
  for (const g of boardGaps(items, options.snap)) {
    if (g.width <= EPS) continue;
    const across = g.axis;
    const along = g.axis === "x" ? "y" : "x";
    const lo = g.at - g.width;
    const hi = g.at;
    const pieces: Piece[] = [];
    links.forEach((l, li) => {
      const p = l.points;
      // The first and the last legs hold the plugs, so they do not move.
      for (let i = 2; i <= p.length - 2; i++) {
        const a = p[i - 1]!;
        const b = p[i]!;
        if (Math.abs(a[across] - b[across]) > EPS || a[across] <= lo + EPS || a[across] >= hi - EPS) continue;
        if (Math.abs(a[along] - b[along]) <= EPS) continue;
        const side = (q: Point, r: Point): number => Math.sign(r[across] - q[across]);
        pieces.push({
          link: li,
          seg: i,
          lo: Math.min(a[along], b[along]),
          hi: Math.max(a[along], b[along]),
          turns: [
            [a[along], side(a, p[i - 2]!)],
            [b[along], side(b, p[i + 1]!)],
          ],
        });
      }
    });
    if (pieces.length === 0) continue;
    const list = orderPieces(pieces, order);
    // A piece goes one lane past each piece before it in the order that it overlaps. Thus two pieces that overlap keep their order.
    const lane: number[] = [];
    let n = 0;
    list.forEach((P, i) => {
      let k = 0;
      for (let j = 0; j < i; j++) if (overlaps(list[j]!, P)) k = Math.max(k, lane[j]! + 1);
      lane.push(k);
      n = Math.max(n, k + 1);
    });
    const step = Math.min(spacing, g.width / (n + 1));
    const mid = (lo + hi) / 2;
    list.forEach((P, i) => {
      const v = mid + (lane[i]! - (n - 1) / 2) * step;
      moved[P.link]![P.seg - 1]![across] = v;
      moved[P.link]![P.seg]![across] = v;
    });
  }
  const boxes = new Grid<Box>(Math.max(20, meanSide(items)));
  for (const i of items) boxes.add(i.box, i.box);
  return links.map((l, i) => (hits(boxes, moved[i]!) > hits(boxes, l.points) ? l : { ...l, points: moved[i]! }));
}

const overlaps = (P: Piece, Q: Piece): boolean => Math.min(P.hi, Q.hi) - Math.max(P.lo, Q.lo) > EPS;

/**
 * This function counts the crossings when the piece `P` is on the near side of the piece `Q`.
 * A turn of `P` to the far side crosses `Q` when it is inside the span of `Q`. A turn of `Q` to the near side crosses `P` in the same way.
 */
function cost(P: Piece, Q: Piece): number {
  let c = 0;
  for (const [y, s] of P.turns) if (s > 0 && y > Q.lo + EPS && y < Q.hi - EPS) c++;
  for (const [y, s] of Q.turns) if (s < 0 && y > P.lo + EPS && y < P.hi - EPS) c++;
  return c;
}

/** This function gives the pieces of one gap in lane order, from the near side to the far side. */
function orderPieces(pieces: readonly Piece[], order: LaneOrder): Piece[] {
  if (order === "links") return [...pieces];
  const sum = (P: Piece): number => P.turns.reduce((s, [, side]) => s + side, 0);
  const list = [...pieces].sort((P, Q) => sum(P) - sum(Q) || P.link - Q.link || P.seg - Q.seg);
  if (order === "ends") return list;
  // The local search moves one piece to the place that removes the most crossings, until no move removes one.
  const n = list.length;
  const index = new Map(list.map((P, i) => [P, i]));
  const c: number[][] = list.map((P) => list.map((Q) => (P !== Q && overlaps(P, Q) ? cost(P, Q) : 0)));
  const at = (P: Piece, Q: Piece): number => c[index.get(P)!]![index.get(Q)!]!;
  for (let round = 0; round < ROUNDS; round++) {
    let better = false;
    for (let i = 0; i < n; i++) {
      const x = list[i]!;
      // The change of the crossings when `x` moves to the place `k`, for each `k`.
      let best = 0;
      let to = i;
      let d = 0;
      for (let k = i - 1; k >= 0; k--) {
        d += at(x, list[k]!) - at(list[k]!, x);
        if (d < best) [best, to] = [d, k];
      }
      d = 0;
      for (let k = i + 1; k < n; k++) {
        d += at(list[k]!, x) - at(x, list[k]!);
        if (d < best) [best, to] = [d, k];
      }
      if (to !== i) {
        list.splice(i, 1);
        list.splice(to, 0, x);
        better = true;
      }
    }
    if (!better) break;
  }
  return list;
}

/** This function gives the mean of the longer side of the boxes. */
function meanSide(items: readonly Boxed[]): number {
  let s = 0;
  for (const i of items) s += Math.max(i.box.w, i.box.h);
  return items.length ? s / items.length : 1;
}

/** This function counts the legs of a polyline that go through a box, for each box. */
function hits(boxes: Grid<Box>, p: readonly Point[]): number {
  let n = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    boxes.querySegment(a, b, 0, (box) => {
      if (segmentHitsBox(a, b, box)) n++;
    });
  }
  return n;
}
