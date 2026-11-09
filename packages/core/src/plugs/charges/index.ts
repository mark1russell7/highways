/**
 * The plug strategy `charges` (RULE-054): the free plugs of one side push apart as equal charges.
 * A spring pulls each plug to the place where it faces its far end.
 * The plugs move on the side by small steps of gradient descent, and they keep their order. The result has no hard gap: a crowded side gives plugs closer than `spacing`.
 */
import { center, type Point } from "../../geom.ts";
import { fixedPortPoint, nodeIndex, type Edge, type Node, type Port, type Side } from "../../model.ts";
import { placePlug, type Plug } from "../../plugs.ts";
import type { PlugInput, PlugPair } from "../../strategies/model.ts";
import { alongAxis, portOfEnd, rangeInterval } from "../range.ts";

/** The options of the plug strategy `charges`. */
export interface ChargeOptions {
  /** The distance at which two plugs with one ideal place come to rest. The charge follows from it. The default is 8. */
  readonly spacing?: number;
  /** The number of steps of the descent. 0 keeps the plugs of `facing`. The default is 60. */
  readonly rounds?: number;
  /** The distance from a plug to a corner of its box, or a quarter of the side when the side is short. The default is 6. */
  readonly inset?: number;
}

/** The defaults of the plug strategy `charges`. */
export const CHARGE_DEFAULTS: Required<ChargeOptions> = Object.freeze({ spacing: 8, rounds: 60, inset: 6 });

/** The least distance in the charge force, so two plugs at one place get a finite push. */
const NEAR = 1e-3;

/**
 * This function places `ideal.length` plugs on one side, each in its interval from `lo[i]` to `hi[i]`.
 * The energy is the sum of `(x - ideal)^2 / 2` for each plug and `q / d` for each pair at the distance `d`, with `q = spacing^3 / 2`.
 * Thus two plugs with one ideal place rest at `spacing` apart.
 *
 * Each step divides the force on a plug by the curvature of the energy at that plug (a Jacobi step).
 * The curvature is 1 plus the sum of `2q / d^3`, so the matrix of the step is strictly diagonally dominant. A step moves a plug at most `spacing / 2`, then the plugs keep their order.
 * The function `tie` orders two plugs with the same ideal place. The result is in the order of `ideal`.
 */
export function chargePlugs(ideal: readonly number[], lo: readonly number[], hi: readonly number[], options: ChargeOptions = {}, tie?: (i: number) => number): number[] {
  const k = ideal.length;
  if (k === 0) return [];
  const spacing = Math.max(0, options.spacing ?? CHARGE_DEFAULTS.spacing);
  const rounds = Math.max(0, Math.floor(options.rounds ?? CHARGE_DEFAULTS.rounds));
  const order = ideal.map((_, i) => i).sort((a, b) => ideal[a]! - ideal[b]! || (tie ? tie(a) - tie(b) : 0) || a - b);
  const want = order.map((j) => ideal[j]!);
  const low = order.map((j) => lo[j]!);
  const high = order.map((j) => Math.max(lo[j]!, hi[j]!));
  const x = want.map((v, i) => Math.min(high[i]!, Math.max(low[i]!, v)));
  const q = (spacing * spacing * spacing) / 2;
  const most = spacing / 2;
  for (let r = 0; r < rounds && k > 1 && q > 0; r++) {
    const force = x.map((v, i) => want[i]! - v);
    const curve = x.map(() => 1);
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const d = Math.max(x[j]! - x[i]!, NEAR);
        const push = q / (d * d);
        const bend = (2 * push) / d;
        force[i]! -= push;
        force[j]! += push;
        curve[i]! += bend;
        curve[j]! += bend;
      }
    }
    for (let i = 0; i < k; i++) x[i] = Math.min(high[i]!, Math.max(low[i]!, x[i]! + Math.max(-most, Math.min(most, force[i]! / curve[i]!))));
    // The plugs keep their order: a pair that changed places meets at its midpoint.
    for (let i = 1; i < k; i++) {
      if (x[i]! < x[i - 1]!) {
        const m = (x[i]! + x[i - 1]!) / 2;
        x[i - 1] = m;
        x[i] = m;
      }
    }
  }
  const out = new Array<number>(k);
  order.forEach((j, i) => {
    out[j] = x[i]!;
  });
  return out;
}

/** This function gives the side of an outward normal. */
function sideOfNormal(n: Point): Side {
  if (n.x > 0) return "east";
  if (n.x < 0) return "west";
  return n.y > 0 ? "south" : "north";
}

/**
 * This function gives the plugs of the plug strategy `charges`: the plugs of `facing`, then `chargePlugs` on the free plugs of each side.
 * A fixed plug does not move. A plug of a port with a `range` stays in its range (PORT-RANGE).
 * The output has one entry for each edge with two known nodes, in the order of the edges.
 */
export function chargeEnds(input: PlugInput, options: ChargeOptions = {}): PlugPair[] {
  const { graph } = input;
  const inset = options.inset ?? CHARGE_DEFAULTS.inset;
  const byId = nodeIndex(graph);
  const ends: [Edge, Node, Node, Plug, Plug][] = [];
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) continue;
    ends.push([e, s, t, placePlug(s, e.source, center(t.box)), placePlug(t, e.target, center(s.box))]);
  }
  // The free plugs of each side: the index of the edge, the end (3 for the source, 4 for the target), the point of the other end and the port.
  const sides = new Map<string, { node: Node; normal: Point; items: [number, 3 | 4, Point, Port | undefined][] }>();
  ends.forEach(([e, s, t, ps, pt], i) => {
    for (const [end, node, plug, other, k] of [
      [e.source, s, ps, pt, 3],
      [e.target, t, pt, ps, 4],
    ] as const) {
      if (fixedPortPoint(node, end) !== undefined) continue;
      const key = JSON.stringify([node.id, plug.normal.x, plug.normal.y]);
      let side = sides.get(key);
      if (!side) sides.set(key, (side = { node, normal: plug.normal, items: [] }));
      side.items.push([i, k, other.point, portOfEnd(node, end)]);
    }
  });
  for (const { node, normal, items } of sides.values()) {
    if (items.length < 2) continue;
    const side = sideOfNormal(normal);
    const along = alongAxis(side);
    const b = node.box;
    const start = along === "y" ? b.y : b.x;
    const len = along === "y" ? b.h : b.w;
    const m = Math.min(inset, len / 4);
    const spans = items.map(([, , , port]): [number, number] => rangeInterval(b, side, port, inset) ?? [start + m, start + len - m]);
    const ideal = items.map(([i, k]) => ends[i]![k].point[along]);
    const placed = chargePlugs(
      ideal,
      spans.map((r) => r[0]),
      spans.map((r) => r[1]),
      options,
      (j) => items[j]![2][along],
    );
    items.forEach(([i, k], j) => {
      const old = ends[i]![k];
      ends[i]![k] = { point: along === "y" ? { x: old.point.x, y: placed[j]! } : { x: placed[j]!, y: old.point.y }, normal: old.normal };
    });
  }
  return ends.map(([e, , , source, target]) => ({ edge: e.id, source, target }));
}
