import { dist } from "../../geom.ts";
import { WayFinder } from "../../ways.ts";
import { freeLines, streetEdges, streetRide, type StreetSource } from "../free-lines.ts";
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
  // Each edge id has an index, so `done` is one byte for each id.
  const ids = new Map<string, number>();
  const idOf = Int32Array.from(edges, (e) => {
    let id = ids.get(e.edge);
    if (id === undefined) ids.set(e.edge, (id = ids.size));
    return id;
  });
  // The covers of the streets are typed arrays (L77 of layout-contract): one object for each covered edge of each street filled gigabytes on 1000 boxes.
  // The cover of street `i` is the entries from `starts[i]` to `starts[i + 1]`. Each entry has the index of the edge, its ride, and the two coordinates along the street where the edge joins and leaves it.
  const covers = new CoverStore();
  const starts = new Int32Array(lines.length + 1);
  lines.forEach((line, i) => {
    const vertical = line.a.x === line.b.x;
    for (let k = 0; k < edges.length; k++) {
      const e = edges[k]!;
      const r = streetRide(line, e);
      if (r.ride >= min && r.ramps + r.ride <= o.detour * e.base) covers.add(k, r.ride, vertical ? r.on.y : r.on.x, vertical ? r.off.y : r.off.x);
    }
    starts[i + 1] = covers.length;
  });
  const { edge, ride: rides, on, off } = covers.arrays();
  const done = new Uint8Array(ids.size);
  const chosen: SnapLine[] = [];
  const used = new Uint8Array(lines.length);
  while (chosen.length < Math.max(0, Math.floor(o.maxStreets))) {
    let best = -1;
    let bestGain = -Infinity;
    for (let i = 0; i < lines.length; i++) {
      if (used[i] === 1) continue;
      // The new edges of the street: the count, the sum of their rides in the order of the cover, and the extent of their coordinates along the street.
      let count = 0;
      let ride = 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = starts[i]!; j < starts[i + 1]!; j++) {
        if (done[idOf[edge[j]!]!] === 1) continue;
        count++;
        ride += rides[j]!;
        lo = Math.min(lo, on[j]!, off[j]!);
        hi = Math.max(hi, on[j]!, off[j]!);
      }
      if (count < size) continue;
      const span = hi - lo;
      if (span <= 0) continue;
      const gain = ride / span;
      if (gain > bestGain) [best, bestGain] = [i, gain];
    }
    if (best < 0 || bestGain < o.minGain) break;
    used[best] = 1;
    const line = lines[best]!;
    const members: number[] = [];
    for (let j = starts[best]!; j < starts[best + 1]!; j++) if (done[idOf[edge[j]!]!] !== 1) members.push(edge[j]!);
    for (const k of members) done[idOf[k]!] = 1;
    // The rides of the members come again from `streetRide`, so the points are the same as the points of the cover.
    const parts = members.map((k) => ({ edge: edges[k]!.edge, ride: streetRide(line, edges[k]!) }));
    const vertical = line.a.x === line.b.x;
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of parts) {
      lo = Math.min(lo, vertical ? c.ride.on.y : c.ride.on.x, vertical ? c.ride.off.y : c.ride.off.x);
      hi = Math.max(hi, vertical ? c.ride.on.y : c.ride.on.x, vertical ? c.ride.off.y : c.ride.off.x);
    }
    const a = vertical ? { x: line.a.x, y: lo } : { x: lo, y: line.a.y };
    const b = vertical ? { x: line.a.x, y: hi } : { x: hi, y: line.a.y };
    if (dist(a, b) <= 0) continue;
    chosen.push({ key: `street${chosen.length}`, a, b, members: parts.map((c) => ({ edge: c.edge, from: c.ride.on, to: c.ride.off, at: 0 })) });
  }
  return snapPlan(input, chosen, { minSize: size, direct: true });
}

/** The entries of the covers of the streets, in typed arrays that grow when they are full. */
class CoverStore {
  length = 0;
  private edge = new Int32Array(1024);
  private ride = new Float64Array(1024);
  private on = new Float64Array(1024);
  private off = new Float64Array(1024);

  add(edge: number, ride: number, on: number, off: number): void {
    if (this.length === this.edge.length) this.grow();
    this.edge[this.length] = edge;
    this.ride[this.length] = ride;
    this.on[this.length] = on;
    this.off[this.length] = off;
    this.length++;
  }

  arrays(): { edge: Int32Array; ride: Float64Array; on: Float64Array; off: Float64Array } {
    return { edge: this.edge.subarray(0, this.length), ride: this.ride.subarray(0, this.length), on: this.on.subarray(0, this.length), off: this.off.subarray(0, this.length) };
  }

  private grow(): void {
    const n = this.edge.length * 2;
    const edge = new Int32Array(n);
    edge.set(this.edge);
    this.edge = edge;
    for (const key of ["ride", "on", "off"] as const) {
      const next = new Float64Array(n);
      next.set(this[key]);
      this[key] = next;
    }
  }
}
