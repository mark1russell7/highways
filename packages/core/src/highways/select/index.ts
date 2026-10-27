import { dist, type Point } from "../../geom.ts";
import { byCollection } from "../../routers/trunks.ts";
import { firstRoutes, tidyPlan } from "../base.ts";
import { CORRIDOR_DEFAULTS, corridorPlan } from "../corridors/index.ts";
import { FLOW_FIELD_DEFAULTS, flowFieldPlan } from "../flow-field/index.ts";
import { lengthBetween, type Highway, type HighwayInput, type HighwayPlan } from "../model.ts";
import { OD_CELL_DEFAULTS, odCellPlan } from "../od-cells/index.ts";
import { QUICKBUNDLES_DEFAULTS, quickBundlesPlan } from "../quickbundles/index.ts";
import { ROAD_CLASS_DEFAULTS, roadClassPlan } from "../road-classes/index.ts";
import { sharedWaysPlan } from "../shared-ways/index.ts";
import { WSPD_DEFAULTS, wspdPlan } from "../wspd/index.ts";

/** A generator of candidate highways: a highway strategy with its defaults. */
export type CandidateSource = "corridors" | "quickbundles" | "wspd" | "road-classes" | "flow-field" | "od-cells" | "shared-ways";

/** The values of `CandidateSource`. */
export const CANDIDATE_SOURCES: readonly CandidateSource[] = Object.freeze(["corridors", "quickbundles", "wspd", "road-classes", "flow-field", "od-cells", "shared-ways"]);

/** The options of the highway strategy `select` (HWY-045 of the note on highways). */
export interface SelectOptions {
  /** The generators of the candidates. The default is `corridors`, `quickbundles`, `wspd` and `road-classes`. */
  readonly generators: readonly CandidateSource[];
  /** The weight of the added length of the edges against the ink that a highway saves (lambda 3 of the note). The default is 1. */
  readonly lambda: number;
  /** The number of passes of the local search with one swap. The default is 2. */
  readonly swaps: number;
}

/** The default options of the strategy `select`. */
export const SELECT_DEFAULTS: Readonly<SelectOptions> = Object.freeze({ generators: Object.freeze(["corridors", "quickbundles", "wspd", "road-classes"] as CandidateSource[]), lambda: 1, swaps: 2 });

/** This function gives the plan of a generator, with its defaults. */
export function candidatePlan(input: HighwayInput, source: CandidateSource): HighwayPlan {
  switch (source) {
    case "corridors":
      return corridorPlan(input, CORRIDOR_DEFAULTS);
    case "quickbundles":
      return quickBundlesPlan(input, QUICKBUNDLES_DEFAULTS);
    case "wspd":
      return wspdPlan(input, WSPD_DEFAULTS);
    case "road-classes":
      return roadClassPlan(input, ROAD_CLASS_DEFAULTS);
    case "flow-field":
      return flowFieldPlan(input, FLOW_FIELD_DEFAULTS);
    case "od-cells":
      return odCellPlan(input, OD_CELL_DEFAULTS);
    case "shared-ways":
      return sharedWaysPlan(input, { rule: byCollection });
  }
}

/** This function gives the place along a polyline (as a length) of the point nearest to `p`, and the distance to it. */
function project(line: readonly Point[], p: Point): { at: number; d: number } {
  let best = { at: 0, d: line.length > 0 ? dist(line[0]!, p) : Infinity };
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = dist(a, b);
    const u = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len))) : 0;
    const d = dist(p, { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    if (d < best.d) best = { at: walked + u * len, d };
    walked += len;
  }
  return best;
}

/** One candidate highway, with the index of its generator, its edges and its net gain. */
interface Candidate {
  readonly highway: Highway;
  readonly source: number;
  readonly edges: readonly string[];
  readonly net: number;
}

/**
 * This function gives the ink that a highway saves. It is the sum of the spine lengths of the members, less the length of their union.
 * The extra length of a member is its detour from its first route. The detour goes to the merge point, along the spine and back from the split point.
 */
export function candidateScore(h: Highway, routes: ReadonlyMap<string, readonly Point[]>): { gain: number; extra: number } {
  const spans = h.members.map((m) => [Math.min(m.on, m.off), Math.max(m.on, m.off)] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let sum = 0;
  for (const [lo, hi] of spans) sum += lengthBetween(h.spine, lo, hi);
  let union = 0;
  let from = -1;
  let to = -1;
  for (const [lo, hi] of spans) {
    if (lo > to) {
      if (to > from) union += lengthBetween(h.spine, from, to);
      [from, to] = [lo, hi];
    } else to = Math.max(to, hi);
  }
  if (to > from) union += lengthBetween(h.spine, from, to);
  let extra = 0;
  for (const m of h.members) {
    const route = routes.get(m.edge);
    if (!route || route.length < 2) continue;
    const a = project(route, m.merge);
    const b = project(route, m.split);
    const along = lengthBetween(h.spine, Math.min(m.on, m.off), Math.max(m.on, m.off));
    extra += Math.max(0, a.d + along + b.d - Math.max(0, b.at - a.at));
  }
  return { gain: sum - union, extra };
}

/**
 * This function gives the highways of the candidate generation and selection (HWY-045). Each generator proposes its highways as candidates.
 * The net gain of a candidate is the ink that it saves, less `lambda` times the length that it adds to its edges.
 * Two candidates of two generators conflict when they share an edge. The highways of one generator do not conflict.
 *
 * The selection takes the candidates by net gain for each edge, without a conflict. Then each pass of the local search
 * swaps in a candidate. The swap occurs when the net gain of the candidate is more than the sum of the selected candidates in conflict with it.
 */
export function selectPlan(input: HighwayInput, o: Readonly<SelectOptions>): HighwayPlan {
  const routes = firstRoutes(input);
  const candidates: Candidate[] = [];
  [...new Set(o.generators)].forEach((source, si) => {
    for (const highway of candidatePlan(input, source).highways) {
      const { gain, extra } = candidateScore(highway, routes);
      candidates.push({ highway: { ...highway, key: `${source}:${highway.key}` }, source: si, edges: highway.members.map((m) => m.edge), net: gain - o.lambda * extra });
    }
  });
  const onEdge = new Map<string, number[]>();
  candidates.forEach((c, i) => {
    for (const e of c.edges) {
      const list = onEdge.get(e);
      if (list) list.push(i);
      else onEdge.set(e, [i]);
    }
  });
  const conflicts = (i: number): Set<number> => {
    const out = new Set<number>();
    for (const e of candidates[i]!.edges) for (const j of onEdge.get(e) ?? []) if (j !== i && candidates[j]!.source !== candidates[i]!.source) out.add(j);
    return out;
  };
  const order = candidates
    .map((_, i) => i)
    .filter((i) => candidates[i]!.net > 0)
    .sort((a, b) => candidates[b]!.net / candidates[b]!.edges.length - candidates[a]!.net / candidates[a]!.edges.length || a - b);
  const chosen = new Set<number>();
  const fill = (): void => {
    for (const i of order) if (!chosen.has(i) && ![...conflicts(i)].some((j) => chosen.has(j))) chosen.add(i);
  };
  fill();
  for (let pass = 0; pass < Math.max(0, Math.round(o.swaps)); pass++) {
    let changed = false;
    for (const i of order) {
      if (chosen.has(i)) continue;
      const against = [...conflicts(i)].filter((j) => chosen.has(j));
      const lost = against.reduce((s, j) => s + candidates[j]!.net, 0);
      if (against.length > 0 && candidates[i]!.net > lost + 1e-9) {
        for (const j of against) chosen.delete(j);
        chosen.add(i);
        changed = true;
      }
    }
    fill();
    if (!changed) break;
  }
  const highways = [...chosen].sort((a, b) => a - b).map((i) => candidates[i]!.highway);
  return tidyPlan({ highways });
}
