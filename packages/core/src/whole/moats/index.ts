import { inkSaved } from "../../bench/measures/bundles.ts";
import { checkProperties } from "../../bench/properties.ts";
import { polylineLength, type Point } from "../../geom.ts";
import type { Graph, Result } from "../../model.ts";
import type { WholeOutput } from "../../strategies/model.ts";
import { runPipeline } from "../pipeline/index.ts";
import type { PortfolioSetting } from "../portfolio/index.ts";

/** The largest number of different plug points that `inkFloor` reads. On a larger board, it reads the pairs of the first edges only, so the floor is lower but still true. */
export const MOAT_POINTS = 400;

/** The options of the whole strategy `moats` (WILD-054). */
export interface MoatOptions {
  /** The number of settings that the strategy tries, from the start of its list, from 1 to 12. The default is 4. */
  readonly settings: number;
}

/** The default options of the strategy `moats`. */
export const MOAT_DEFAULTS: Readonly<MoatOptions> = Object.freeze({ settings: 4 });

/** The ink floor of a set of plug pairs: the dual value `floor`, the number of pairs that it reads and the number of pairs. */
export interface InkFloor {
  readonly floor: number;
  readonly pairs: number;
  readonly read: number;
}

/**
 * This function gives a floor for the ink of each drawing that joins the plug pairs of `pairs` (WILD-054).
 * It grows moats around the plug points at one rate, as the primal-dual method of Goemans and Williamson (1995) does.
 * A moat grows while it holds one end of a pair and not the other end. Two moats join when their discs touch.
 * The floor is the sum of the growth of the active moats. Each drawing that joins the pairs crosses each active ring, so its ink is at least the floor.
 * The boxes only make each drawing longer, so the floor holds with boxes too.
 */
export function inkFloor(pairs: readonly (readonly [Point, Point])[]): InkFloor {
  const ids = new Map<string, number>();
  const points: Point[] = [];
  const idOf = (p: Point): number => {
    const k = `${p.x},${p.y}`;
    let i = ids.get(k);
    if (i === undefined) {
      i = points.length;
      ids.set(k, i);
      points.push(p);
    }
    return i;
  };
  const read: [number, number][] = [];
  for (const [a, b] of pairs) {
    const ka = ids.has(`${a.x},${a.y}`) ? 0 : 1;
    const kb = ids.has(`${b.x},${b.y}`) || (a.x === b.x && a.y === b.y) ? 0 : 1;
    if (points.length + ka + kb > MOAT_POINTS) break;
    read.push([idOf(a), idOf(b)]);
  }
  const n = points.length;
  const d = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y);
      d[i * n + j] = v;
      d[j * n + i] = v;
    }
  }
  // The moat of each point, and the radius of each point. Only the points of an active moat grow.
  const moat = Int32Array.from({ length: n }, (_, i) => i);
  const r = new Float64Array(n);
  const active = new Uint8Array(n);
  const refresh = (): number => {
    active.fill(0);
    for (const [a, b] of read) {
      if (moat[a] !== moat[b]) {
        active[moat[a]!] = 1;
        active[moat[b]!] = 1;
      }
    }
    let count = 0;
    for (let m = 0; m < n; m++) count += active[m]!;
    return count;
  };
  let live = refresh();
  let floor = 0;
  while (live > 0) {
    // The next time that two discs of two moats touch, where one moat at least grows.
    let next = Infinity;
    let pi = -1;
    let pj = -1;
    for (let i = 0; i < n; i++) {
      const mi = moat[i]!;
      const ai = active[mi]!;
      const ri = r[i]!;
      const row = i * n;
      for (let j = i + 1; j < n; j++) {
        const mj = moat[j]!;
        if (mi === mj) continue;
        const rate = ai + active[mj]!;
        if (rate === 0) continue;
        const dt = Math.max(0, d[row + j]! - ri - r[j]!) / rate;
        if (dt < next) {
          next = dt;
          pi = i;
          pj = j;
        }
      }
    }
    if (pi < 0) break;
    floor += next * live;
    for (let i = 0; i < n; i++) if (active[moat[i]!]) r[i]! += next;
    const from = moat[pj]!;
    const to = moat[pi]!;
    for (let i = 0; i < n; i++) if (moat[i] === from) moat[i] = to;
    live = refresh();
  }
  return { floor, pairs: pairs.length, read: read.length };
}

/** This function gives the plug pairs of a result: the first and the last point of each route. */
export function plugPairs(result: Result): [Point, Point][] {
  return result.routes.filter((r) => r.points.length >= 2).map((r) => [r.points[0]!, r.points[r.points.length - 1]!]);
}

/**
 * This function gives the share of the largest saving of ink that a result gets: `(ΣL - ink) / (ΣL - floor)`, from 0 to 1.
 * `ΣL` is the length of all the routes, and `ink` is the drawn length. It is `B1 / B1_max` of WILD-054. A result with no saving to get gives 1.
 */
export function inkShare(result: Result): number {
  let total = 0;
  for (const r of result.routes) total += polylineLength(r.points);
  if (total <= 0) return 1;
  const ink = (1 - inkSaved(result.routes)) * total;
  const room = total - inkFloor(plugPairs(result)).floor;
  if (room <= 1e-9) return 1;
  return Math.max(0, Math.min(1, (total - ink) / room));
}

/** The share of one setting on the board, and its saving of ink for a tie. */
export interface MoatEntry {
  readonly name: string;
  readonly share: number;
  readonly saved: number;
}

/** The result of `moats`: the output, the name of the pick and the share of each setting with no break of a hard rule. */
export interface MoatRun {
  readonly output: WholeOutput;
  readonly pick: string;
  readonly entries: readonly MoatEntry[];
}

/**
 * This function runs the whole strategy `moats` (WILD-054). It runs the first `settings` settings of `list` on the board.
 * A setting with a break of a hard rule, or above its node limit, does not count. The largest share of `inkShare` wins.
 * A tie goes to the larger saving of ink, then to the earlier setting.
 */
export function moats(graph: Graph, list: readonly PortfolioSetting[], options: Partial<MoatOptions> = {}): MoatRun {
  const o = { ...MOAT_DEFAULTS, ...options };
  const count = Math.max(1, Math.min(list.length, Math.floor(o.settings)));
  const entries: MoatEntry[] = [];
  const outputs: WholeOutput[] = [];
  let fallback: { name: string; output: WholeOutput } | undefined;
  for (const s of list.slice(0, count)) {
    const limit = (s.pipeline.highway ?? s.pipeline.router).maxNodes;
    if (limit !== undefined && graph.nodes.length > limit) continue;
    const output = runPipeline(graph, s.pipeline);
    fallback ??= { name: s.name, output };
    if (checkProperties(output.graph, output.result, 1).length > 0) continue;
    entries.push({ name: s.name, share: inkShare(output.result), saved: inkSaved(output.result.routes) });
    outputs.push(output);
  }
  if (entries.length === 0) {
    const first = fallback ?? { name: list[0]!.name, output: runPipeline(graph, list[0]!.pipeline) };
    return { output: first.output, pick: first.name, entries };
  }
  let best = 0;
  entries.forEach((e, i) => {
    const b = entries[best]!;
    if (e.share > b.share + 1e-9 || (Math.abs(e.share - b.share) <= 1e-9 && e.saved > b.saved + 1e-9)) best = i;
  });
  return { output: outputs[best]!, pick: entries[best]!.name, entries };
}
