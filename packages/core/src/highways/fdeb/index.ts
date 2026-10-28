import { dist, type Point } from "../../geom.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { compatibility } from "../hdbscan/index.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";
import { boxPush, outOfBoxes, tracePlan } from "../trace.ts";

/** The options of the highway strategy `fdeb` (HWY-002 with RULE-002 of the notes). */
export interface FdebOptions extends Pick<WayOptions, "margin" | "k"> {
  /** Two edges attract each other when their compatibility is this value or more. The default is 0.6. */
  readonly compatibility: number;
  /** The spring constant that keeps each edge smooth. The default is 0.1. */
  readonly spring: number;
  /** The number of cycles. Each cycle doubles the points of each edge and halves the step. The default is 5. */
  readonly cycles: number;
  /** The number of steps of the first cycle. Each later cycle has two thirds of the steps of the cycle before it. The default is 50. */
  readonly iterations: number;
  /** The weight of the push of the boxes (RULE-002). The value 0 turns it off. The default is 1. */
  readonly repulsion: number;
  /**
   * The stretch budget of each edge (RULE-002). An edge whose polyline is longer than this value times its straight line gets no pull.
   * `Infinity` sets no budget. The default is 1.25.
   */
  readonly pullLimit: number;
  /** The side of the grid that the points of the edges snap to after the cycles, in units of the board. The default is 8. */
  readonly snap: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `fdeb`. */
export const FDEB_DEFAULTS: Readonly<Required<Omit<FdebOptions, "margin" | "k">>> = Object.freeze({
  compatibility: 0.6,
  spring: 0.1,
  cycles: 5,
  iterations: 50,
  repulsion: 1,
  pullLimit: 1.25,
  snap: 8,
  minSize: 2,
});

/** The largest number of partners of one edge. The partners with the largest compatibility stay. */
const PARTNERS = 32;

/** The first step of the points, as a share of the median length of the edges. */
const STEP = 0.04;

/** One straight edge: its two ends. */
interface Segment {
  readonly a: Point;
  readonly b: Point;
}

/** One partner of an edge: its index, its compatibility, and `flip` when it goes the other way. */
interface Partner {
  readonly j: number;
  readonly c: number;
  readonly flip: boolean;
}

/**
 * This function gives the partners of each edge: the edges with a compatibility of `threshold` or more, at most 32, the largest first.
 * The search reads only the edges whose middles are near enough in x, so it does not test each pair of a large graph.
 */
function partnersOf(segments: readonly Segment[], threshold: number): Partner[][] {
  const n = segments.length;
  const len = segments.map((s) => dist(s.a, s.b));
  const mid = segments.map((s) => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }));
  const longest = len.reduce((m, l) => Math.max(m, l), 0);
  const t = Math.max(1e-3, Math.min(1, threshold));
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => mid[i]!.x - mid[j]!.x || i - j);
  const found: Partner[][] = Array.from({ length: n }, () => []);
  for (let a = 0; a < n; a++) {
    const i = order[a]!;
    // `Cp >= t` needs a distance of the middles of `avg (1 / t - 1)` or less.
    const reach = ((len[i]! + longest) / 2) * (1 / t - 1);
    for (let b = a + 1; b < n; b++) {
      const j = order[b]!;
      if (mid[j]!.x - mid[i]!.x > reach) break;
      const c = compatibility(segments[i]!.a, segments[i]!.b, segments[j]!.a, segments[j]!.b);
      if (c < t) continue;
      const si = segments[i]!;
      const sj = segments[j]!;
      const flip = (si.b.x - si.a.x) * (sj.b.x - sj.a.x) + (si.b.y - si.a.y) * (sj.b.y - sj.a.y) < 0;
      found[i]!.push({ j, c, flip });
      found[j]!.push({ j: i, c, flip });
    }
  }
  return found.map((list) => list.sort((p, q) => q.c - p.c || p.j - q.j).slice(0, PARTNERS));
}

/** This function gives the length of a polyline. */
const lengthOf = (p: readonly Point[]): number => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += dist(p[i - 1]!, p[i]!);
  return s;
};

/** This function gives a polyline with a new point in the middle of each leg. */
function subdivide(p: readonly Point[]): Point[] {
  const out: Point[] = [p[0]!];
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b);
  }
  return out;
}

/**
 * This function gives the polylines of the force-directed edge bundling (HWY-002, Holten and van Wijk 2009), with the box field of RULE-002.
 * Each edge starts as the straight line between its two points out of the plugs. Each cycle doubles its points.
 * In each step, a point moves by `step` times the mean pull to the matching points of its partners. The springs to its two neighbours also move it.
 * The boxes push the points, and after each cycle a point in a box moves out of it. An edge over its stretch budget gets no pull in that step.
 */
export function fdebLines(input: HighwayInput, finder: WayFinder, o: Readonly<FdebOptions>): Map<string, Point[]> {
  const plugs = edgePlugs(input.graph);
  const segments = plugs.map(({ ps, pt }) => ({ a: finder.out(ps), b: finder.out(pt) }));
  const n = segments.length;
  const out = new Map<string, Point[]>();
  if (n === 0) return out;
  const partners = partnersOf(segments, o.compatibility);
  const lengths = segments.map((s) => dist(s.a, s.b));
  const sorted = [...lengths].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const pad = finder.margin / 2;
  const reach = finder.margin * 2;
  const budget = o.pullLimit > 0 ? o.pullLimit : Infinity;
  let lines: Point[][] = segments.map((s) => [s.a, s.b]);
  let step = STEP * median;
  let iterations = Math.max(0, Math.round(o.iterations));
  for (let cycle = 0; cycle < Math.max(0, Math.round(o.cycles)); cycle++) {
    lines = lines.map(subdivide);
    const P = lines[0]!.length;
    for (let it = 0; it < iterations; it++) {
      const next = lines.map((l) => [...l]);
      for (let e = 0; e < n; e++) {
        const line = lines[e]!;
        const pull = lengths[e]! > 1e-9 && lengthOf(line) <= budget * lengths[e]!;
        for (let i = 1; i < P - 1; i++) {
          const p = line[i]!;
          let fx = 0;
          let fy = 0;
          if (pull) {
            let w = 0;
            for (const q of partners[e]!) {
              const m = lines[q.j]![q.flip ? P - 1 - i : i]!;
              const d = dist(p, m);
              if (d < 1e-9) continue;
              fx += (q.c * (m.x - p.x)) / d;
              fy += (q.c * (m.y - p.y)) / d;
              w += q.c;
            }
            if (w > 0) {
              fx /= w;
              fy /= w;
            }
          }
          if (o.repulsion > 0) {
            const push = boxPush(finder.obstacles, p, reach);
            fx += o.repulsion * push.x;
            fy += o.repulsion * push.y;
          }
          const a = line[i - 1]!;
          const b = line[i + 1]!;
          const sx = o.spring * ((a.x + b.x) / 2 - p.x);
          const sy = o.spring * ((a.y + b.y) / 2 - p.y);
          next[e]![i] = { x: p.x + step * fx + sx, y: p.y + step * fy + sy };
        }
      }
      lines = next;
    }
    // The hard projection of RULE-002: no point stays in a box.
    lines = lines.map((l) => l.map((p, i) => (i === 0 || i === l.length - 1 ? p : outOfBoxes(finder.obstacles, p, pad))));
    step /= 2;
    iterations = Math.round((iterations * 2) / 3);
  }
  plugs.forEach(({ edge }, e) => out.set(edge.id, lines[e]!));
  return out;
}

/**
 * This function gives the highways of the force-directed edge bundling (HWY-002 with RULE-002).
 * The points of the bundled polylines snap to a grid of side `snap`, so the points of one bundle come together.
 * Each edge then goes through its points along the corner graph, and the stretches that `minSize` edges share become highways.
 */
export function fdebPlan(input: HighwayInput, o: Readonly<FdebOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const lines = fdebLines(input, finder, o);
  const waypoints = new Map([...lines].map(([edge, l]) => [edge, l.slice(1, -1)] as const));
  return tracePlan(input, finder, waypoints, { snap: o.snap, minSize: o.minSize, key: "fdeb" });
}
