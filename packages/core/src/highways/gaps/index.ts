import { WayFinder } from "../../ways.ts";
import { freeLines, streetEdges, streetRide, type FreeLine, type StreetEdge, type StreetSource } from "../free-lines.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { snapPlan, type SnapLine } from "../snap.ts";

/** The options of the highway strategy `gaps` (HWY-057 of the note on highways). */
export interface GapOptions {
  /** A street with fewer edges than this number (the demand `k`) is not a highway. The default is 3. */
  readonly minSize: number;
  /** The cost of a length on a street against a length off the streets, from 0.1 to 0.8. The default is 0.5. */
  readonly discount: number;
  /** An edge rides a street only when its way along the street is this many times its first route or less. The default is 1.3. */
  readonly detour: number;
  /** The source of the streets: the gaps of the room step, or the lines through the corners. The default is `room`. */
  readonly source: StreetSource;
}

/** The default options of the strategy `gaps`. */
export const GAP_DEFAULTS: Readonly<GapOptions> = Object.freeze({ minSize: 3, discount: 0.5, detour: 1.3, source: "room" });

/** The best street of an edge, from the streets in `open`. The ride costs `discount` times its length. The way is at most `detour` times the first route. */
function bestStreet(lines: readonly FreeLine[], open: ReadonlySet<number>, e: StreetEdge, o: Readonly<GapOptions>, min: number): number {
  let best = -1;
  let bestSaving = 1e-9;
  for (const i of open) {
    const r = streetRide(lines[i]!, e);
    if (r.ride < min) continue;
    if (r.ramps + r.ride > o.detour * e.base) continue;
    const saving = e.base - (r.ramps + o.discount * r.ride);
    if (saving > bestSaving || (saving === bestSaving && i < best)) [best, bestSaving] = [i, saving];
  }
  return best;
}

/**
 * This function gives the highways on the gaps of the board (HWY-057). The streets are the free middle lines of the gaps.
 * Each edge takes the street that saves it the most cost, when a length on a street costs `discount` times its length.
 * A street with `minSize` edges or more becomes a highway. The edges of the other streets then choose again among the highways, two times.
 */
export function gapPlan(input: HighwayInput, o: Readonly<GapOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes);
  const lines = freeLines(input.graph, finder, o.source);
  const edges = streetEdges(input, finder);
  const min = 2 * finder.margin;
  const size = Math.max(2, Math.round(o.minSize));
  let open = new Set(lines.map((_, i) => i));
  let choice = new Map<string, number>();
  for (let round = 0; round < 3; round++) {
    choice = new Map();
    const count = new Map<number, number>();
    for (const e of edges) {
      const i = bestStreet(lines, open, e, o, min);
      if (i < 0) continue;
      choice.set(e.edge, i);
      count.set(i, (count.get(i) ?? 0) + 1);
    }
    const kept = new Set([...open].filter((i) => (count.get(i) ?? 0) >= size));
    if (kept.size === open.size) break;
    open = kept;
  }
  const byLine = new Map<number, SnapLine["members"][number][]>();
  for (const e of edges) {
    const i = choice.get(e.edge);
    if (i === undefined || !open.has(i)) continue;
    const r = streetRide(lines[i]!, e);
    const list = byLine.get(i) ?? [];
    list.push({ edge: e.edge, from: r.on, to: r.off, at: 0 });
    byLine.set(i, list);
  }
  const snaps: SnapLine[] = [...byLine.keys()]
    .sort((p, q) => p - q)
    .map((i) => {
      const members = byLine.get(i)!;
      // The spine runs only over the part of the street that its members ride.
      const line = lines[i]!;
      const vertical = line.a.x === line.b.x;
      const us = members.flatMap((m) => (vertical ? [m.from.y, m.to.y] : [m.from.x, m.to.x]));
      const lo = Math.min(...us);
      const hi = Math.max(...us);
      const a = vertical ? { x: line.a.x, y: lo } : { x: lo, y: line.a.y };
      const b = vertical ? { x: line.a.x, y: hi } : { x: hi, y: line.a.y };
      return { key: `gap${i}`, a, b, members };
    });
  return snapPlan(input, snaps, { minSize: size, direct: true });
}
