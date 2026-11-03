/**
 * The plug strategy `auction` (WILD-003): a plug auction, after the auction algorithm of Bertsekas (1988) for the assignment problem.
 * Each side of a box has slots at an even spacing. The free plugs of the box bid for the slots, and no two plugs share a slot.
 */
import { center, dist, segmentsCross, type Point } from "../../geom.ts";
import { nodeIndex, portOffset, type Node, type Port, type Side } from "../../model.ts";
import { nearestSide, placePlug, SIDE_NORMAL, sideToward, type Plug } from "../../plugs.ts";
import type { PlugInput, PlugPair } from "../../strategies/model.ts";
import { clampToRange, rangeInterval } from "../range.ts";
import { alongOf, pointAt, roomOf } from "../walls.ts";

/** The options of the plug strategy `auction` (WILD-003). */
export interface AuctionOptions {
  /** The least number of slots on each side, from 2 to 16. A side gets more slots when its box has more plugs. The default is 6. */
  readonly slots: number;
  /** The weight of the angle between the normal of the slot and the far end, from 0 to 4. The default is 1. */
  readonly angle: number;
  /** The weight of the detour of the slot against the facing plug, from 0 to 4. The default is 1. */
  readonly detour: number;
  /** The weight of each crossing of the straight stubs, from 0 to 4. The default is 0.5. */
  readonly crossing: number;
  /** The last step of the prices, from 0.01 to 1. The auction stops with the step `eps / (k + 1)` for `k` plugs. The default is 0.1. */
  readonly eps: number;
}

/** The defaults of the plug strategy `auction`. */
export const AUCTION_DEFAULTS: Readonly<AuctionOptions> = Object.freeze({ slots: 6, angle: 1, detour: 1, crossing: 0.5, eps: 0.1 });

/** The sides of a box, in a fixed order. */
const SIDES: readonly Side[] = ["north", "east", "south", "west"];

/** The largest number of other ends that the crossing count of one stub reads. */
const CROSS_READ = 32;

/** The cost of the private slot of a plug: the slot at its facing place, when no other slot is free. */
const FALLBACK = 1e6;

/** A free plug of a box: one port without a fixed point, or one end without a port. All the ends of one port share its plug. */
interface Bidder {
  readonly port: Port | undefined;
  /** The far end of the first edge of the plug. */
  readonly far: Point;
  /** The facing plug. */
  readonly facing: Plug;
  /** The only side of the plug, or `undefined` for a plug of each side. */
  readonly side: Side | undefined;
}

/** A slot of a box: its side and its point. A slot of `owner` is private to that bidder. */
interface Place {
  readonly side: Side;
  readonly point: Point;
  readonly owner: number | undefined;
}

/**
 * This function gives an assignment of each bidder to one place with the least sum of the costs, by the auction of Bertsekas with ε-scaling.
 * `options(i)` gives the places of the bidder `i` and their costs. The step `eps` falls by 4 at each phase, down to `last`.
 * A bid goes to the least index for a tie, so the result is the same each time. Each bidder needs one place at least.
 * The first step is a quarter of the largest cost below `top`.
 */
export function auctionAssign(bidders: number, places: number, options: (i: number) => readonly (readonly [number, number])[], last: number, top: number = Infinity): number[] {
  const price = new Float64Array(places);
  let spread = 0;
  for (let i = 0; i < bidders; i++) for (const [, c] of options(i)) if (Math.abs(c) < top) spread = Math.max(spread, Math.abs(c));
  let eps = Math.max(last, spread / 4);
  let owner = new Int32Array(places).fill(-1);
  let assigned = new Int32Array(bidders).fill(-1);
  for (;;) {
    owner = new Int32Array(places).fill(-1);
    assigned = new Int32Array(bidders).fill(-1);
    const queue: number[] = [];
    for (let i = 0; i < bidders; i++) queue.push(i);
    let guard = 0;
    const limit = 2000 * (bidders + 1);
    while (queue.length > 0 && guard++ < limit) {
      const i = queue.shift()!;
      let best = -1;
      let v1 = -Infinity;
      let v2 = -Infinity;
      for (const [j, c] of options(i)) {
        const v = -c - price[j]!;
        if (v > v1 || (v === v1 && j < best)) {
          v2 = v1;
          v1 = v;
          best = j;
        } else if (v > v2) v2 = v;
      }
      if (best < 0) continue;
      const step = v2 === -Infinity ? spread + eps : v1 - v2;
      price[best]! += step + eps;
      const before = owner[best]!;
      owner[best] = i;
      assigned[i] = best;
      if (before >= 0) {
        assigned[before] = -1;
        queue.push(before);
      }
    }
    if (eps <= last) break;
    eps = Math.max(last, eps / 4);
  }
  return [...assigned];
}

/** This function counts the crossings of the segment from `a` to `b` with the segments of `others`. */
function crossings(a: Point, b: Point, others: readonly (readonly [Point, Point])[]): number {
  let n = 0;
  for (const [c, d] of others) if (segmentsCross(a, b, c, d)) n++;
  return n;
}

/**
 * This function gives the plugs of the plug strategy `auction` (WILD-003). A fixed plug stays at its point, and a plug with a side bids only on that side.
 * Each side of a box gets `slots` or more even slots. The cost of a slot is `angle × (1 - cos θ) + detour × d + crossing × x`.
 * `θ` is the angle between the normal of the slot and the far end. `x` counts the crossings of the straight stubs.
 * `d` is the extra length to the far end over the facing plug, as a share.
 * A plug of a port with a range bids only on the slots in its range. It also bids on a private slot at its facing place in the range.
 * The output has one entry for each edge with two known nodes, in the order of the edges.
 */
export function auctionEnds(input: PlugInput, options: Partial<AuctionOptions> = {}): PlugPair[] {
  const o = { ...AUCTION_DEFAULTS, ...options };
  const { graph } = input;
  const byId = nodeIndex(graph);
  const perNode = new Map<Node, { bidders: Bidder[]; keys: Map<string, number> }>();
  const edges: { id: string; source: Plug | [Node, number]; target: Plug | [Node, number] }[] = [];
  const plugOf = (node: Node, end: { readonly node: string; readonly port?: string }, far: Node): Plug | [Node, number] => {
    const toward = center(far.box);
    const port = end.port === undefined ? undefined : node.ports?.find((p) => p.id === end.port);
    if (port && portOffset(node.box, port) !== undefined) return placePlug(node, end, toward);
    let own = perNode.get(node);
    if (!own) perNode.set(node, (own = { bidders: [], keys: new Map() }));
    const key = port ? `p:${port.id}` : `e:${own.bidders.length}`;
    const known = own.keys.get(key);
    if (known !== undefined) return [node, known];
    const facing = placePlug(node, end, toward);
    const side = port?.side ?? (port?.range !== undefined ? sideToward(node.box, toward) : undefined);
    own.keys.set(key, own.bidders.length);
    own.bidders.push({ port, far: toward, facing, side });
    return [node, own.bidders.length - 1];
  };
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) continue;
    edges.push({ id: e.id, source: plugOf(s, e.source, t), target: plugOf(t, e.target, s) });
  }
  const placed = new Map<Node, Plug[]>();
  for (const [node, { bidders }] of perNode) placed.set(node, placeNode(node, bidders, o));
  const resolve = (p: Plug | [Node, number]): Plug => (Array.isArray(p) ? placed.get(p[0])![p[1]]! : p);
  return edges.map((x) => ({ edge: x.id, source: resolve(x.source), target: resolve(x.target) }));
}

/** This function gives the plug of each bidder of one box, by the auction over the slots of its sides. */
function placeNode(node: Node, bidders: readonly Bidder[], o: Readonly<AuctionOptions>): Plug[] {
  const box = node.box;
  // The fixed plugs of each side: a slot nearer than the spacing to a fixed plug is not a slot.
  const fixed = new Map<Side, number[]>(SIDES.map((s) => [s, []]));
  for (const p of node.ports ?? []) {
    const at = portOffset(box, p);
    if (at === undefined) continue;
    const point = { x: box.x + at.x, y: box.y + at.y };
    const side = p.side ?? nearestSide(box, point);
    fixed.get(side)!.push(point[alongOf(side)]);
  }
  const only = new Map<Side, number>(SIDES.map((s) => [s, 0]));
  let open = 0;
  for (const b of bidders) {
    if (b.side === undefined) open++;
    else only.set(b.side, only.get(b.side)! + 1);
  }
  const places: Place[] = [];
  for (const side of SIDES) {
    const len = alongOf(side) === "y" ? box.h : box.w;
    const [lo, hi] = roomOf(box, side, Math.max(0.1 * len, 2));
    const count = Math.max(Math.floor(o.slots), only.get(side)! + Math.ceil(open / 4));
    const gap = count > 0 ? (hi - lo) / count : 0;
    const fx = fixed.get(side)!;
    for (let k = 0; k < count; k++) {
      const v = lo + (k + 0.5) * gap;
      if (fx.some((f) => Math.abs(f - v) < Math.min(gap, 4))) continue;
      places.push({ side, point: pointAt(box, side, v), owner: undefined });
    }
  }
  // The private slot of each bidder: its facing plug, clamped into its range.
  const privateOf = bidders.map((b, i) => {
    const side = b.side ?? nearestSide(box, b.facing.point);
    const inset = Math.max(0.1 * (alongOf(side) === "y" ? box.h : box.w), 2);
    const point = b.port?.range !== undefined ? clampToRange(box, side, b.port, b.facing.point, inset) : b.facing.point;
    places.push({ side, point, owner: i });
    return places.length - 1;
  });
  // The straight stubs of the facing plugs of the box, for the crossing count.
  const stubs: (readonly [Point, Point])[] = bidders.slice(0, CROSS_READ).map((b) => [b.facing.point, b.far] as const);
  const rows = bidders.map((b, i) => {
    const out: [number, number][] = [];
    const base = Math.max(1, dist(b.facing.point, b.far));
    const range = b.port?.range !== undefined && b.side !== undefined ? rangeInterval(box, b.side, b.port, Math.max(0.1 * (alongOf(b.side) === "y" ? box.h : box.w), 2)) : undefined;
    const others = stubs.filter((_, k) => k !== i);
    places.forEach((p, j) => {
      if (p.owner !== undefined && p.owner !== i) return;
      if (p.owner === undefined) {
        if (b.side !== undefined && p.side !== b.side) return;
        if (range !== undefined) {
          const v = p.point[alongOf(p.side)];
          if (v < range[0] - 1e-9 || v > range[1] + 1e-9) return;
        }
      }
      const n = SIDE_NORMAL[p.side];
      const dx = b.far.x - p.point.x;
      const dy = b.far.y - p.point.y;
      const len = Math.hypot(dx, dy);
      const cos = len > 0 ? (n.x * dx + n.y * dy) / len : 1;
      const detour = Math.max(0, (len - dist(b.facing.point, b.far)) / base);
      const cost = o.angle * (1 - cos) + o.detour * detour + o.crossing * crossings(p.point, b.far, others);
      out.push([j, p.owner === i ? cost + FALLBACK : cost]);
    });
    return out;
  });
  const last = Math.max(0.01, Math.min(1, o.eps)) / (bidders.length + 1);
  const pick = auctionAssign(bidders.length, places.length, (i) => rows[i]!, last, FALLBACK / 2);
  return bidders.map((_, i) => {
    const j = pick[i]! >= 0 ? pick[i]! : privateOf[i]!;
    const p = places[j]!;
    return { point: p.point, normal: SIDE_NORMAL[p.side] };
  });
}
