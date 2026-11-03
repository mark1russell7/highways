import { segmentBoxDistance, type Box } from "../../../geom.ts";
import type { Graph } from "../../../model.ts";
import type { WayOptions } from "../../../ways.ts";
import type { Highway, HighwayInput, HighwayPlan, SplitState } from "../../model.ts";
import { STABLE_ID_DEFAULTS, stableIdPlan } from "../ids/index.ts";
import { commonEdges, edgeLengths, keepMembers, type Gate } from "../model.ts";
import { decideSplits, forgetLink, newSplitMemory, type EndReading, type LinkReading, type SplitMemory, type SplitOptions } from "./policy.ts";

export {
  SPLIT_DEFAULTS,
  checkSplitOptions,
  decideSplits,
  forgetLink,
  newSplitMemory,
  type Closure as SplitClosure,
  type Decision as SplitDecision,
  type EndReading as SplitEndReading,
  type Evaluation as SplitEvaluation,
  type LinkReading as SplitLinkReading,
  type Reading as SplitReading,
  type SplitEvent,
  type SplitMemory,
  type SplitOptions,
  type SplitReason,
  type SplitRecord,
} from "./policy.ts";

/** The options of the gate `split-hysteresis` (HWY-061): the options of the policy, and the options of the readings. */
export interface SplitHysteresisOptions extends SplitOptions {
  /** The width of one lane, in units of the board. The default is 4. */
  readonly laneWidth: number;
  /** A gap narrower than this number of lanes is below its least size. The default is 2, the `minSize` of the router `trunks`. */
  readonly minLanes: number;
  /** An edge closes when its route along the plan is at most this number times its route alone, plus `detourPad`. The default is 1.2. */
  readonly detourBudget: number;
  /** The added length that each edge can use, in units of the board. The default is 0. */
  readonly detourPad: number;
}

/**
 * The default options of the gate `split-hysteresis`. The gate does one evaluation for each layout run.
 * Thus its timers are short: 2 runs for a split and 3 runs for a merge. The demand drop is 0.5 units of the board. `SPLIT_DEFAULTS` suits a call on each frame.
 */
export const SPLIT_HYSTERESIS_DEFAULTS: Readonly<SplitHysteresisOptions> = Object.freeze({
  pressEvaluations: 2,
  mergeEvaluations: 3,
  mergeSize: 0.9,
  relief: 0.7,
  unclosed: 0,
  demandDrop: 0.5,
  laneWidth: 4,
  minLanes: 2,
  detourBudget: 1.2,
  detourPad: 0,
});

/** The pressure above which an end of the reading is pressed. The pressure of a gap is the width of the lanes over the width of the gap. */
const YIELD = 1;

/** This value separates the parts of an id of the reading. An id of a highway or an edge does not hold it. */
const SEP = "\u0000";

/** This function gives the id of the link that joins an edge to a highway. The id is stable while the highway keeps its id. */
export const splitLinkId = (highway: string, edge: string): string => `${highway}${SEP}${edge}`;

/** This function gives the edge of a link id. */
const edgeOfLink = (id: string): string => id.slice(id.indexOf(SEP) + 1);

/** This function compares two strings by their UTF-16 code units. */
const byCode = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** This function gives the entries of a map, sorted by key. */
const sorted = <V>(m: ReadonlyMap<string, V>): (readonly [string, V])[] => [...m].sort((p, q) => byCode(p[0], q[0]));

/** This function gives the memory of the policy as plain data, with the plan before the gate. The next run reads it from `previous.splits`. */
export function splitStateOf(memory: SplitMemory, base: HighwayPlan): SplitState {
  return { evaluations: memory.evaluations, pressed: sorted(memory.pressed), relaxed: sorted(memory.relaxed), split: sorted(memory.split), base };
}

/** This function gives the memory of the policy from its plain data. */
export function splitMemoryOf(state: SplitState): SplitMemory {
  return { evaluations: state.evaluations, pressed: new Map(state.pressed), relaxed: new Map(state.relaxed), split: new Map(state.split) };
}

/** This function gives the ids of the frames of a graph: the nodes that another node names as its parent. */
export function framesOf(graph: Graph): Set<string> {
  const ids = new Set(graph.nodes.map((n) => n.id));
  return new Set(graph.nodes.flatMap((n) => (n.parent !== undefined && ids.has(n.parent) ? [n.parent] : [])));
}

/**
 * This function gives the width of the gap that the spine of a highway goes through: two times the distance to the nearest box.
 * The boxes of the ends of the members and the frames do not count. A spine with no box near it gives `Infinity`.
 */
export function gapWidth(graph: Graph, highway: Highway, frames: ReadonlySet<string> = framesOf(graph)): number {
  const ends = new Set<string>();
  const members = new Set(highway.members.map((m) => m.edge));
  for (const e of graph.edges) if (members.has(e.id)) ends.add(e.source.node).add(e.target.node);
  const boxes: Box[] = graph.nodes.filter((n) => !ends.has(n.id) && !frames.has(n.id)).map((n) => n.box);
  let d = Infinity;
  for (let i = 0; i + 1 < highway.spine.length; i++) for (const b of boxes) d = Math.min(d, segmentBoxDistance(highway.spine[i]!, highway.spine[i + 1]!, b));
  return 2 * d;
}

/** The parts of the reading of one run that do not depend on the memory. */
interface RunReading {
  readonly ends: EndReading[];
  readonly links: LinkReading[];
  readonly demand: number;
}

/** This function gives the reading of one run: two ends for each highway, and one link for each member. */
function readPlan(graph: Graph, plan: HighwayPlan, o: Readonly<SplitHysteresisOptions>, way: WayOptions): RunReading {
  const parent = new Map(graph.nodes.map((n) => [n.id, n.parent]));
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  const lengths = edgeLengths(graph, plan, way);
  const frames = framesOf(graph);
  const ends: EndReading[] = [];
  const links: LinkReading[] = [];
  let demand = 0;
  for (const h of plan.highways) {
    const rest = h.lanes.length * o.laneWidth;
    const gap = gapWidth(graph, h, frames);
    const pressure = gap === Infinity ? 0 : gap <= 0 ? Infinity : rest / gap;
    demand += rest;
    ends.push({ id: `hw${SEP}${h.id}`, size: rest, restSize: rest, minSize: 0, pressure });
    ends.push({ id: `gap${SEP}${h.id}`, size: gap, restSize: rest, minSize: o.minLanes * o.laneWidth, pressure });
    for (const m of h.members) {
      const e = edges.get(m.edge);
      const l = lengths.get(m.edge);
      const allowed = l ? (o.detourBudget - 1) * l.alone + o.detourPad : 0;
      const closure = l ? { value: allowed - (l.route - l.alone), need: allowed } : undefined;
      const forced = e !== undefined && parent.get(e.source.node) !== parent.get(e.target.node);
      links.push({
        id: splitLinkId(h.id, m.edge),
        a: `hw${SEP}${h.id}`,
        b: `gap${SEP}${h.id}`,
        order: Math.max(0, h.lanes.indexOf(m.edge)),
        ...(forced ? { forced } : {}),
        ...(closure ? { closure } : {}),
      });
    }
  }
  return { ends, links, demand };
}

/**
 * This function applies the split and merge policy with hysteresis (HWY-061) to a plan. It does one evaluation for each run.
 * A link joins each member edge to its highway. A split takes the edge out of the highway, and the edge routes alone.
 * A merge puts the edge on the highway again.
 *
 * The readings of the policy:
 *
 * - An end is a highway, or the gap that its spine goes through. The width of the gap is `gapWidth`.
 * - The size of a gap is its width. The rest size is the width of all the lanes of the highway, `laneWidth` times the lanes.
 * - The least size of a gap is `minLanes` lanes. The highway end has no least size.
 * - The pressure of both ends is the width of the lanes over the width of the gap. The yield pressure is 1.
 * - The closure of a link is the permitted detour of its edge less its actual detour. The need is the permitted detour.
 * - The permitted detour is `detourBudget - 1` times the route alone, plus `detourPad`. The routes come from `edgeLengths`.
 * - A forced link is an edge between two nodes of different frames.
 * - The demand is the width of all the lanes of the plan. The order of a link is the lane of its edge.
 *
 * The highways first get the stable ids of the gate `ids` (HWY-054), so a link id stays the same from run to run.
 * The memory comes from `input.previous.splits`, and the plan gives the new memory in `splits`. A run without it starts from an empty memory.
 * The gate calls `forgetLink` for each link of an edge that the earlier graph has and the graph does not have.
 * A gate value of `mergeEvaluations` below `pressEvaluations + 1` counts as `pressEvaluations + 1`.
 */
export function splitHysteresisPlan(input: HighwayInput, plan: HighwayPlan, options: Readonly<SplitHysteresisOptions>, way: WayOptions = {}): HighwayPlan {
  const previous = input.previous;
  const state = previous?.splits;
  let memory = state ? splitMemoryOf(state) : newSplitMemory();
  if (previous) {
    const common = commonEdges(previous.graph, input.graph);
    const gone = new Set(previous.graph.edges.map((e) => e.id).filter((id) => !common.has(id)));
    if (gone.size > 0) {
      const ids = new Set([...memory.pressed.keys(), ...memory.relaxed.keys(), ...memory.split.keys()]);
      for (const id of ids) if (gone.has(edgeOfLink(id))) memory = forgetLink(memory, id);
    }
  }
  const own: HighwayPlan = plan.splits === undefined ? plan : { highways: plan.highways, ...(plan.laneRule ? { laneRule: plan.laneRule } : {}) };
  const before = state?.base ?? previous?.plan;
  const base: HighwayPlan = previous && before ? { ...own, ...stableIdPlan({ graph: input.graph, previous: { graph: previous.graph, plan: before } }, own, STABLE_ID_DEFAULTS) } : own;
  const reading = readPlan(input.graph, base, options, way);
  const policy: SplitOptions = {
    pressEvaluations: options.pressEvaluations,
    mergeEvaluations: Math.max(options.mergeEvaluations, options.pressEvaluations + 1),
    mergeSize: options.mergeSize,
    relief: options.relief,
    unclosed: options.unclosed,
    demandDrop: options.demandDrop,
  };
  const next = decideSplits({ ends: reading.ends, links: reading.links, yieldPressure: YIELD, demand: reading.demand }, memory, policy).memory;
  const kept = keepMembers(base, (h, m) => !next.split.has(splitLinkId(h.id, m.edge)));
  return { ...kept, ...(base.laneRule ? { laneRule: base.laneRule } : {}), splits: splitStateOf(next, base) };
}

/** The gate `split-hysteresis` (HWY-061): an edge leaves a highway and joins it again with hysteresis over the runs. */
export const splitHysteresisGate: Gate<SplitHysteresisOptions> = {
  name: "split-hysteresis",
  describe:
    "The gate `split-hysteresis` (HWY-061) takes an edge out of its highway after `pressEvaluations` runs with a narrow gap or a long detour. The edge joins again after `mergeEvaluations` calm runs.",
  defaults: SPLIT_HYSTERESIS_DEFAULTS,
  schema: {
    pressEvaluations: { type: "integer", min: 1, max: 8, step: 1, default: 2, describe: "A split condition must hold for this number of runs in a row." },
    mergeEvaluations: { type: "integer", min: 2, max: 12, step: 1, default: 3, describe: "The merge condition must hold for this number of runs in a row." },
    mergeSize: { type: "number", min: 0.5, max: 1, step: 0.05, default: 0.9, describe: "A merge needs a gap of this share of the width of the lanes, or more." },
    relief: { type: "number", min: 0.3, max: 1, step: 0.05, default: 0.7, describe: "A merge needs a pressure below this share of the yield pressure." },
    unclosed: { type: "number", min: 0, max: 1, step: 0.1, default: 0, describe: "An edge does not close when its spare detour is below this share of its permitted detour." },
    demandDrop: { type: "number", min: 0, max: 8, step: 0.5, default: 0.5, describe: "A merge needs a drop of the lane demand of this value or more since the split, in units of the board." },
    laneWidth: { type: "number", min: 1, max: 12, step: 1, default: 4, describe: "The width of one lane, in units of the board." },
    minLanes: { type: "integer", min: 1, max: 6, step: 1, default: 2, describe: "A gap narrower than this number of lanes is below its least size." },
    detourBudget: { type: "number", min: 1, max: 2, step: 0.05, marks: [1.1, 1.2, 1.5], default: 1.2, describe: "The largest ratio of the route along the plan to the route alone." },
    detourPad: { type: "number", min: 0, max: 40, step: 5, default: 0, describe: "The added length that each edge can use, in units of the board." },
  },
  apply: splitHysteresisPlan,
};
