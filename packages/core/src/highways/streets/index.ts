import { dist } from "../../geom.ts";
import { WayFinder } from "../../ways.ts";
import { freeLines, streetEdges, streetRide, type StreetRide, type StreetSource } from "../free-lines.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { snapPlan, type SnapLine } from "../snap.ts";

/** The options of the highway strategy `streets` (HWY-058 of the note on highways). */
export interface StreetOptions {
  /** A street covers an edge when the way of the edge along the street is this many times its first route or less (the limit `s`). The default is 1.2. */
  readonly detour: number;
  /** The greedy cover stops when the best street gives less than this gain: the length that its edges ride over the length of the street. The default is 2. */
  readonly minGain: number;
  /** The largest number of streets. The default is 32. */
  readonly maxStreets: number;
  /** A street with fewer new edges than this number is not a highway. The default is 2. */
  readonly minSize: number;
  /** The source of the streets: the gaps of the room step, or the lines through the corners. The default is `corners`. */
  readonly source: StreetSource;
}

/** The default options of the strategy `streets`. */
export const STREET_DEFAULTS: Readonly<StreetOptions> = Object.freeze({ detour: 1.2, minGain: 2, maxStreets: 32, minSize: 2, source: "corners" });

/**
 * This function gives orthogonal streets by a greedy set cover (HWY-058). A street covers each edge whose way along it is at most `detour` times its first route.
 * Each step takes the street with the largest gain: the length that its new edges ride, over the length of the street that they use.
 * The cover stops at `maxStreets` streets, or when the best gain is below `minGain`. Each edge rides one street at most.
 */
export function streetPlan(input: HighwayInput, o: Readonly<StreetOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes);
  const lines = freeLines(input.graph, finder, o.source);
  const edges = streetEdges(input, finder);
  const min = 2 * finder.margin;
  const size = Math.max(2, Math.round(o.minSize));
  // The cover of each street: each edge that it covers, with its ride.
  const covers: { edge: string; ride: StreetRide }[][] = lines.map((line) => {
    const out: { edge: string; ride: StreetRide }[] = [];
    for (const e of edges) {
      const r = streetRide(line, e);
      if (r.ride >= min && r.ramps + r.ride <= o.detour * e.base) out.push({ edge: e.edge, ride: r });
    }
    return out;
  });
  const done = new Set<string>();
  const chosen: SnapLine[] = [];
  const used = new Set<number>();
  while (chosen.length < Math.max(0, Math.floor(o.maxStreets))) {
    let best = -1;
    let bestGain = -Infinity;
    let bestPart: { edge: string; ride: StreetRide }[] = [];
    covers.forEach((cover, i) => {
      if (used.has(i)) return;
      const part = cover.filter((c) => !done.has(c.edge));
      if (part.length < size) return;
      const vertical = lines[i]!.a.x === lines[i]!.b.x;
      const us = part.flatMap((c) => (vertical ? [c.ride.on.y, c.ride.off.y] : [c.ride.on.x, c.ride.off.x]));
      const span = Math.max(...us) - Math.min(...us);
      if (span <= 0) return;
      let ride = 0;
      for (const c of part) ride += c.ride.ride;
      const gain = ride / span;
      if (gain > bestGain) [best, bestGain, bestPart] = [i, gain, part];
    });
    if (best < 0 || bestGain < o.minGain) break;
    used.add(best);
    for (const c of bestPart) done.add(c.edge);
    const line = lines[best]!;
    const vertical = line.a.x === line.b.x;
    const us = bestPart.flatMap((c) => (vertical ? [c.ride.on.y, c.ride.off.y] : [c.ride.on.x, c.ride.off.x]));
    const lo = Math.min(...us);
    const hi = Math.max(...us);
    const a = vertical ? { x: line.a.x, y: lo } : { x: lo, y: line.a.y };
    const b = vertical ? { x: line.a.x, y: hi } : { x: hi, y: line.a.y };
    if (dist(a, b) <= 0) continue;
    chosen.push({ key: `street${chosen.length}`, a, b, members: bestPart.map((c) => ({ edge: c.edge, from: c.ride.on, to: c.ride.off, at: 0 })) });
  }
  return snapPlan(input, chosen, { minSize: size, direct: true });
}
