/**
 * The plug strategy `spread` (PLUG-SPREAD): the free plugs of each wall share the room of that wall with a minimum gap.
 * The order on the wall keeps the order of the far ends, so two routes do not cross at the wall. No plug drops.
 */
import { center, type Box, type Point } from "../../geom.ts";
import { nodeIndex, portOffset, type End, type Node, type Side } from "../../model.ts";
import { nearestSide, placePlug, SIDE_NORMAL, sideToward, type Plug } from "../../plugs.ts";
import type { PlugInput, PlugPair } from "../../strategies/model.ts";
import { isotonic } from "../justify.ts";

/** The options of the plug strategy `spread`. */
export interface SpreadOptions {
  /** The least gap between two plugs of one wall. When the room of the wall is too small, the gap shrinks evenly. The default is 8. */
  readonly plugGap?: number;
  /** The distance from a plug to a corner of its box, or a quarter of the wall when the wall is short. The default is 6. */
  readonly inset?: number;
  /** The number of passes that sort each wall again by the new places of the far ends. The default is 2. */
  readonly rounds?: number;
}

/** The defaults of the plug strategy `spread`. */
export const SPREAD_DEFAULTS: Required<SpreadOptions> = Object.freeze({ plugGap: 8, inset: 6, rounds: 2 });

/** A free plug: one port of a node, or one end without a port. All the ends of one port share its plug. */
interface Slot {
  readonly node: Node;
  readonly side: Side;
  /** The place of the plug that faces the far end (`placePlug`), on the axis along the wall. */
  readonly ideal: number;
  /** The index of the port in the ports of its node, then the index of the slot. Thus the rows of a card keep their order in a tie. */
  readonly rank: readonly [number, number];
  /** The far end of the first end of the slot: a fixed plug, or the key of its slot. */
  far?: Plug | string;
  /** The place of the plug on the axis along the wall. */
  at: number;
}

/** A wall: one side of one node, with its free slots and the places of its fixed plugs on the axis along the wall. */
interface Wall {
  readonly node: Node;
  readonly side: Side;
  readonly slots: Slot[];
  readonly fixed: number[];
}

/** This function gives the axis along a side. */
function alongOf(side: Side): "x" | "y" {
  return side === "east" || side === "west" ? "y" : "x";
}

/** This function gives the room of a wall: the segment of the axis along the side, without the corner insets. */
function roomOf(box: Box, side: Side, inset: number): [number, number] {
  const along = alongOf(side);
  const start = along === "y" ? box.y : box.x;
  const len = along === "y" ? box.h : box.w;
  const m = Math.min(inset, len / 4);
  return [start + m, start + len - m];
}

/** This function gives the point of a side at `v` on the axis along the side. */
function pointAt(box: Box, side: Side, v: number): Point {
  if (side === "east") return { x: box.x + box.w, y: v };
  if (side === "west") return { x: box.x, y: v };
  if (side === "south") return { x: v, y: box.y + box.h };
  return { x: v, y: box.y };
}

/**
 * This function gives the sort key of a far point on a wall. The key has the order of the angle from the normal of the wall, from the center of the box.
 * The key grows in the direction of the axis along the wall. Thus the plugs in the order of the keys do not cross at the wall.
 */
function keyOf(box: Box, side: Side, far: Point): number {
  const c = center(box);
  const n = SIDE_NORMAL[side];
  const dx = far.x - c.x;
  const dy = far.y - c.y;
  const out = dx * n.x + dy * n.y;
  const along = alongOf(side) === "y" ? dy : dx;
  // A pseudo-angle with the order of the angle: a sum and one division, with no transcendental call. It goes from -2 to 2.
  const size = Math.abs(out) + Math.abs(along);
  if (size === 0) return 0;
  const p = along / size;
  if (out >= 0) return p;
  return along >= 0 ? 2 - p : -2 - p;
}

/**
 * This function gives the sort key of a far point for a po-leader (EDA-041): its place on the axis along the wall.
 * A far point behind the wall gets the key of `keyOf` with a large shift, so it goes to an end of the wall.
 */
function poKeyOf(box: Box, side: Side, far: Point): number {
  const c = center(box);
  const n = SIDE_NORMAL[side];
  const out = (far.x - c.x) * n.x + (far.y - c.y) * n.y;
  const along = alongOf(side) === "y" ? far.y : far.x;
  if (out > 0) return along;
  const k = keyOf(box, side, far);
  return k >= 0 ? 1e12 + k : -1e12 + k;
}

/**
 * This function places `ideal.length` plugs in their given order on the segment from `lo` to `hi`. Two neighbours are at least `gap` apart.
 * The gap shrinks evenly when the segment is too short. The sum of the squares of the moves from the ideal places is the least.
 */
function placeInOrder(ideal: readonly number[], lo: number, hi: number, gap: number): number[] {
  const k = ideal.length;
  if (k === 0) return [];
  const s = k > 1 ? Math.max(0, Math.min(gap, (hi - lo) / (k - 1))) : 0;
  const y = isotonic(ideal.map((v, i) => v - i * s));
  const top = Math.max(lo, hi - (k - 1) * s);
  return y.map((v, i) => Math.max(lo, Math.min(top, v)) + i * s);
}

/**
 * This function places the slots of one wall in their order. The fixed plugs cut the room into parts.
 * Each slot goes into the part of its ideal place, and the parts keep the order of the slots. In each part, two plugs and a plug and a fixed plug are at least `gap` apart.
 * The gap of a part shrinks evenly when the part is too short.
 */
function placeWall(slots: readonly Slot[], fixed: readonly number[], lo: number, hi: number, gap: number, idealOf: (s: Slot) => number = (s) => s.ideal): void {
  const cuts = [...new Set(fixed.filter((f) => f > lo - 1e-9 && f < hi + 1e-9))].sort((a, b) => a - b);
  // The part i is from cuts[i - 1] to cuts[i]. The first part starts at lo, and the last part ends at hi.
  const ends = [lo, ...cuts, hi];
  const parts: Slot[][] = cuts.map(() => []).concat([[]]);
  let part = 0;
  for (const s of slots) {
    let p = 0;
    while (p < cuts.length && idealOf(s) > cuts[p]!) p++;
    part = Math.max(part, p);
    parts[part]!.push(s);
  }
  parts.forEach((list, p) => {
    if (list.length === 0) return;
    const a = ends[p]!;
    const b = ends[p + 1]!;
    const fa = p > 0 ? 1 : 0;
    const fb = p < cuts.length ? 1 : 0;
    const steps = list.length - 1 + fa + fb;
    const s = steps > 0 ? Math.max(0, Math.min(gap, (b - a) / steps)) : gap;
    const lower = a + fa * s;
    const upper = Math.max(lower, b - fb * s);
    const at = placeInOrder(
      list.map((x) => idealOf(x)),
      lower,
      upper,
      s,
    );
    list.forEach((x, i) => {
      x.at = at[i]!;
    });
  });
}

/**
 * This function gives the plugs of the plug strategy `spread`. A fixed plug stays at its point, and a plug with a side stays on that side.
 * Each free plug goes on the side that faces the other end (`sideToward`). Then the free plugs of each wall share its room with at least `plugGap` between two of them.
 * They keep the order of their far ends. The ends of one port share one plug.
 *
 * The output has one entry for each edge with two known nodes, in the order of the edges.
 */
export function spreadEnds(input: PlugInput, options: SpreadOptions = {}): PlugPair[] {
  return spreadWith(input, options);
}

/**
 * The order and the places of the plugs of one wall in the strategy `leaders` (EDA-041).
 * With `po`, the sort key of a far end in front of the wall is its place on the axis along the wall.
 * With `opo`, the plugs of a wall go at even places in the order of the keys of `spread`.
 */
export type WallLeader = "po" | "opo";

/**
 * This function does the work of `spreadEnds`, and of the strategy `leaders` with the argument `leader`.
 * Without `leader`, it gives the plugs of `spread`.
 */
export function spreadWith(input: PlugInput, options: SpreadOptions = {}, leader?: WallLeader): PlugPair[] {
  const { graph } = input;
  const gap = options.plugGap ?? SPREAD_DEFAULTS.plugGap;
  const inset = options.inset ?? SPREAD_DEFAULTS.inset;
  const rounds = options.rounds ?? SPREAD_DEFAULTS.rounds;
  const byId = nodeIndex(graph);
  const slots = new Map<string, Slot>();
  const walls = new Map<string, Wall>();
  // The plug of each end: a fixed plug, or the key of its slot.
  const ends: { edge: string; source: Plug | string; target: Plug | string }[] = [];
  const wallOf = (node: Node, side: Side): Wall => {
    const key = JSON.stringify([node.id, side]);
    let wall = walls.get(key);
    if (!wall) {
      const fixed: number[] = [];
      for (const p of node.ports ?? []) {
        const at = portOffset(node.box, p);
        if (at === undefined) continue;
        const point = { x: node.box.x + at.x, y: node.box.y + at.y };
        if ((p.side ?? nearestSide(node.box, point)) === side) fixed.push(point[alongOf(side)]);
      }
      walls.set(key, (wall = { node, side, slots: [], fixed }));
    }
    return wall;
  };
  const plugOf = (node: Node, end: End, far: Node): Plug | string => {
    const toward = center(far.box);
    const port = end.port === undefined ? undefined : node.ports?.find((p) => p.id === end.port);
    if (port && portOffset(node.box, port) !== undefined) return placePlug(node, end, toward);
    const key = port ? JSON.stringify([node.id, port.id]) : JSON.stringify([node.id, slots.size]);
    if (slots.has(key)) return key;
    const side = port?.side ?? sideToward(node.box, toward);
    const ideal = placePlug(node, end, toward).point[alongOf(side)];
    const slot: Slot = { node, side, ideal, rank: [port ? node.ports!.indexOf(port) : -1, slots.size], at: ideal };
    slots.set(key, slot);
    wallOf(node, side).slots.push(slot);
    return key;
  };
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) continue;
    const source = plugOf(s, e.source, t);
    const target = plugOf(t, e.target, s);
    for (const [own, far] of [
      [source, target],
      [target, source],
    ] as const) {
      const slot = typeof own === "string" ? slots.get(own)! : undefined;
      if (slot && slot.far === undefined) slot.far = far;
    }
    ends.push({ edge: e.id, source, target });
  }
  const resolve = (p: Plug | string): Plug => {
    if (typeof p !== "string") return p;
    const s = slots.get(p)!;
    return { point: pointAt(s.node.box, s.side, s.at), normal: SIDE_NORMAL[s.side] };
  };
  // A pass sorts each wall by the places of the far ends as they are now, and places its plugs. A tie keeps the order of the last pass.
  const order = new Map<Slot, number>();
  for (let round = 0; round <= rounds; round++) {
    for (const wall of walls.values()) {
      const [lo, hi] = roomOf(wall.node.box, wall.side, inset);
      const key = leader === "po" ? poKeyOf : keyOf;
      const keys = new Map<Slot, number>(wall.slots.map((s) => [s, key(wall.node.box, wall.side, resolve(s.far!).point)]));
      const tie = (a: Slot, b: Slot): number => (round === 0 ? a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] : order.get(a)! - order.get(b)!);
      const sorted = [...wall.slots].sort((a, b) => keys.get(a)! - keys.get(b)! || tie(a, b));
      sorted.forEach((s, i) => order.set(s, i));
      if (leader === "opo") {
        // The even places: the plugs split the room into equal parts, so the plug spacing of the wall is the largest that it can be.
        const even = new Map<Slot, number>(sorted.map((s, i) => [s, lo + ((i + 0.5) * (hi - lo)) / sorted.length]));
        placeWall(sorted, wall.fixed, lo, hi, gap, (s) => even.get(s)!);
      } else placeWall(sorted, wall.fixed, lo, hi, gap);
    }
  }
  return ends.map((x) => ({ edge: x.edge, source: resolve(x.source), target: resolve(x.target) }));
}
