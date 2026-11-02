/**
 * The plug strategy `escape` (EDA-022): ordered escape of the plugs, after the ordered escape routing of the boards of printed circuits.
 * The free plugs of one wall go in the order of the direction of the first leg of their ways. Thus the stubs leave the box with no crossing.
 */
import { center, type Point } from "../../geom.ts";
import { nodeIndex, portOffset, type End, type Node, type Side } from "../../model.ts";
import { nearestSide, placePlug, SIDE_NORMAL, sideToward, type Plug } from "../../plugs.ts";
import type { PlugInput, PlugPair } from "../../strategies/model.ts";
import { WayFinder } from "../../ways.ts";
import { placeInIntervals, rangeInterval } from "../range.ts";
import { alongOf, keyOf, pointAt, roomOf } from "../walls.ts";

/** The method that places the plugs of a wall in their order: the least moves from the facing places, or even slots with an ordered assignment. */
export type EscapeMethod = "sort" | "flow";

/** The values of `EscapeMethod`. */
export const ESCAPE_METHODS: readonly EscapeMethod[] = Object.freeze(["sort", "flow"]);

/** The options of the plug strategy `escape` (EDA-022). */
export interface EscapeOptions {
  /** The method that places the plugs of a wall. The default is `sort`. */
  readonly method: EscapeMethod;
  /** The least gap between two plugs of one wall, and the gap of the slots of `flow`, from 2 to 8. The default is 4. */
  readonly slotSpacing: number;
  /** The share of the side that stays free at each corner, from 0 to 0.25. The default is 0.1. */
  readonly cornerReserve: number;
  /** The number of passes that route the ways again from the new plugs and sort each wall again, from 0 to 3. The default is 1. */
  readonly rounds: number;
}

/** The defaults of the plug strategy `escape`. */
export const ESCAPE_DEFAULTS: Readonly<EscapeOptions> = Object.freeze({ method: "sort", slotSpacing: 4, cornerReserve: 0.1, rounds: 1 });

/** A free plug: one port without a fixed point, or one end without a port. All the ends of one port share its plug. */
interface Slot {
  readonly node: Node;
  readonly side: Side;
  /** The place of the facing plug on the axis along the wall. */
  readonly ideal: number;
  /** The index of the slot, for a tie. */
  readonly rank: number;
  /** The first end of the slot: its edge, and `true` for the source end. */
  readonly first: { readonly edge: number; readonly source: boolean };
  /** The interval of the range of the port on the axis along the wall (PORT-RANGE), or `undefined` for a plug with no range. */
  readonly range: readonly [number, number] | undefined;
  /** The place of the plug on the axis along the wall. */
  at: number;
}

/** This function gives the corner inset of a side for the share `reserve`: the share of the length, and 2 or more. `roomOf` keeps it to a quarter of the side. */
function insetOf(len: number, reserve: number): number {
  return Math.max(reserve * len, 2);
}

/**
 * This function places `ideal.length` plugs in their order on slots `gap` apart from `lo` to `hi` (the `flow` method of EDA-022).
 * An ordered assignment (dynamic programming) gives the least sum of the moves from the ideal places. On a line it is the min-cost flow that keeps the order.
 * When the slots are fewer than the plugs, the plugs keep their order with the least sum of the squares of the moves (`placeInIntervals`).
 */
export function placeSlots(ideal: readonly number[], lo: number, hi: number, gap: number): number[] {
  const k = ideal.length;
  if (k === 0) return [];
  const count = gap > 0 ? Math.floor((hi - lo) / gap + 1e-9) + 1 : 1;
  if (count < k) return placeInIntervals(ideal, ideal.map(() => lo), ideal.map(() => hi), gap);
  const slot = (j: number): number => lo + j * gap;
  // cost[i][j]: the least cost of the plugs 0 to i, with the plug i on the slot j.
  const cost: Float64Array[] = [];
  const from: Int32Array[] = [];
  for (let i = 0; i < k; i++) {
    const row = new Float64Array(count).fill(Infinity);
    const back = new Int32Array(count).fill(-1);
    let best = Infinity;
    let arg = -1;
    for (let j = i; j <= count - k + i; j++) {
      if (i > 0 && cost[i - 1]![j - 1]! < best) [best, arg] = [cost[i - 1]![j - 1]!, j - 1];
      const prev = i === 0 ? 0 : best;
      row[j] = prev + Math.abs(slot(j) - ideal[i]!);
      back[j] = arg;
    }
    cost.push(row);
    from.push(back);
  }
  let j = 0;
  for (let q = 1; q < count; q++) if (cost[k - 1]![q]! < cost[k - 1]![j]!) j = q;
  const out = new Array<number>(k);
  for (let i = k - 1; i >= 0; i--) {
    out[i] = slot(j);
    j = from[i]![j]!;
  }
  return out;
}

/**
 * This function places the slots of one wall in their order. The fixed plugs cut the room into parts.
 * Each slot goes into the part of its ideal place, and the parts keep the order of the slots. A plug and a fixed plug are `gap` or more apart.
 * A plug of a port with a range stays in its range (PORT-RANGE). The method `flow` applies only to a part with no range and room for the gap.
 */
function placeWall(slots: readonly Slot[], fixed: readonly number[], lo: number, hi: number, gap: number, method: EscapeMethod): void {
  const cuts = [...new Set(fixed.filter((f) => f > lo - 1e-9 && f < hi + 1e-9))].sort((a, b) => a - b);
  const ends = [lo, ...cuts, hi];
  const parts: Slot[][] = cuts.map(() => []).concat([[]]);
  let part = 0;
  for (const s of slots) {
    let p = 0;
    while (p < cuts.length && s.ideal > cuts[p]!) p++;
    part = Math.max(part, p);
    parts[part]!.push(s);
  }
  parts.forEach((list, p) => {
    if (list.length === 0) return;
    const fa = p > 0 ? 1 : 0;
    const fb = p < cuts.length ? 1 : 0;
    const steps = list.length - 1 + fa + fb;
    const s = steps > 0 ? Math.max(0, Math.min(gap, (ends[p + 1]! - ends[p]!) / steps)) : gap;
    const lower = ends[p]! + fa * s;
    const upper = Math.max(lower, ends[p + 1]! - fb * s);
    const ideal = list.map((x) => x.ideal);
    const bounds = list.map((x): [number, number] => {
      if (x.range === undefined) return [lower, upper];
      const a = Math.max(lower, x.range[0]);
      const b = Math.min(upper, x.range[1]);
      return a <= b ? [a, b] : [x.range[0], x.range[1]];
    });
    const free = list.every((x) => x.range === undefined);
    const at =
      method === "flow" && free && s >= gap
        ? placeSlots(ideal, lower, upper, gap)
        : placeInIntervals(
            ideal,
            bounds.map((b) => b[0]),
            bounds.map((b) => b[1]),
            s,
          );
    list.forEach((x, i) => {
      x.at = at[i]!;
    });
  });
}

/**
 * This function gives the plugs of the plug strategy `escape` (EDA-022, after the ordered escape routing of Luo and others, 2008).
 * A fixed plug stays at its point, and a plug with a side stays on that side. Each other plug goes on the side of its facing plug.
 * The way of each edge between the facing plugs gives the first leg of each end, past its stub. The free plugs of each wall go in the order of the keys of those legs.
 * The method places them with `slotSpacing` or more between two of them. Each round routes the ways again from the new plugs and sorts again.
 * The output has one entry for each edge with two known nodes, in the order of the edges.
 */
export function escapeEnds(input: PlugInput, options: Partial<EscapeOptions> = {}): PlugPair[] {
  const o = { ...ESCAPE_DEFAULTS, ...options };
  const { graph } = input;
  const ways = input.ways ?? new WayFinder(graph.nodes);
  const byId = nodeIndex(graph);
  const slots = new Map<string, Slot>();
  const walls = new Map<string, { node: Node; side: Side; slots: Slot[]; fixed: number[] }>();
  const edges: { id: string; s: Node; t: Node; source: Plug | string; target: Plug | string }[] = [];
  const wallOf = (node: Node, side: Side): { node: Node; side: Side; slots: Slot[]; fixed: number[] } => {
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
  const plugOf = (node: Node, end: End, far: Node, edge: number, source: boolean): Plug | string => {
    const toward = center(far.box);
    const port = end.port === undefined ? undefined : node.ports?.find((p) => p.id === end.port);
    if (port && portOffset(node.box, port) !== undefined) return placePlug(node, end, toward);
    const key = port ? JSON.stringify([node.id, port.id]) : JSON.stringify([node.id, slots.size]);
    if (slots.has(key)) return key;
    const side = port?.side ?? sideToward(node.box, toward);
    const ideal = placePlug(node, end, toward).point[alongOf(side)];
    const len = alongOf(side) === "y" ? node.box.h : node.box.w;
    const range = rangeInterval(node.box, side, port, insetOf(len, o.cornerReserve));
    const slot: Slot = { node, side, ideal, rank: slots.size, first: { edge, source }, range, at: ideal };
    slots.set(key, slot);
    wallOf(node, side).slots.push(slot);
    return key;
  };
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) continue;
    const n = edges.length;
    edges.push({ id: e.id, s, t, source: plugOf(s, e.source, t, n, true), target: plugOf(t, e.target, s, n, false) });
  }
  const resolve = (p: Plug | string): Plug => {
    if (typeof p !== "string") return p;
    const s = slots.get(p)!;
    return { point: pointAt(s.node.box, s.side, s.at), normal: SIDE_NORMAL[s.side] };
  };
  const rounds = Math.max(0, Math.min(3, Math.floor(o.rounds)));
  for (let round = 0; round <= rounds; round++) {
    // The first leg of each end: the point of the way after the stub of the plug.
    const legs = edges.map((x) => {
      const ps = resolve(x.source);
      const pt = resolve(x.target);
      const way = ways.between(ps, pt, new Set<Node>([x.s, x.t]));
      const at = (i: number): Point => way[Math.max(0, Math.min(way.length - 1, i))]!;
      return { source: way.length > 3 ? at(2) : pt.point, target: way.length > 3 ? at(way.length - 3) : ps.point };
    });
    for (const wall of walls.values()) {
      const box = wall.node.box;
      const [lo, hi] = roomOf(box, wall.side, insetOf(alongOf(wall.side) === "y" ? box.h : box.w, o.cornerReserve));
      const key = new Map(wall.slots.map((s) => [s, keyOf(wall.node.box, wall.side, s.first.source ? legs[s.first.edge]!.source : legs[s.first.edge]!.target)]));
      const sorted = [...wall.slots].sort((a, b) => key.get(a)! - key.get(b)! || a.ideal - b.ideal || a.rank - b.rank);
      placeWall(sorted, wall.fixed, lo, hi, o.slotSpacing, o.method);
    }
  }
  return edges.map((x) => ({ edge: x.id, source: resolve(x.source), target: resolve(x.target) }));
}
