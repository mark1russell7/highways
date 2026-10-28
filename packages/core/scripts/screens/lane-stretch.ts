// The variants of the screen of LANE-STRETCH: the router `shared` and `shared-all` with each stretch order.
// Start: `pnpm screen --step router --strategy shared,shared-all --module scripts/screens/lane-stretch.ts` in `packages/core`. The baselines are `shared` and `shared-all`.
// At the exit, the script writes an audit of the set `screen-v1` for each variant: the lane crossings (B5), the broken pairs, their total and the route time.
// A broken pair is a pair of lanes of a run in the order against the relation `bundle`. Its lanes cross at an end of the run, and B5 does not count it.
import { laneCrossings } from "../../src/bench/measures/lanes.ts";
import { inputGraph } from "../../src/bench/screen/forms.ts";
import { SCREEN_V1, screenInputs } from "../../src/bench/screen/set.ts";
import { byBundle, placeRoutes } from "../../src/lane-order.ts";
import { laneStretches, type LaneRun, type LaneStretchOrder } from "../../src/lane-orders/stretch/index.ts";
import type { Graph, Result } from "../../src/model.ts";
import { sharedRouter, type SharedOptions } from "../../src/routers/shared.ts";
import { byCollection } from "../../src/routers/trunks.ts";
import { segmentsOf } from "../../src/segments.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function gives the options of `shared` (with the rule `byCollection`) or `shared-all` (without a rule), with the stretch order `method`. */
function optionsOf(name: string, all: boolean, method: LaneStretchOrder): SharedOptions {
  return { name, maxNodes: 10_000, stretchOrder: method, ...(all ? {} : { rule: byCollection }) };
}

/** This function makes a router strategy of `shared` or `shared-all` with the stretch order `method`. */
function variant(name: string, all: boolean, method: LaneStretchOrder): Strategy<"router", object> {
  const describe = `The router \`${all ? "shared-all" : "shared"}\` with the stretch order \`${method}\` (LANE-STRETCH).`;
  const run = (graph: Graph): Result => sharedRouter(optionsOf(name, all, method)).route(graph);
  return defineStrategy({ step: "router", name, describe, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

export const sharedConsensus = variant("shared-stretch-consensus", false, "consensus");
export const sharedPeriphery = variant("shared-stretch-periphery", false, "periphery");
export const sharedSifting = variant("shared-stretch-sifting", false, "sifting");
export const sharedAllConsensus = variant("shared-all-stretch-consensus", true, "consensus");
export const sharedAllPeriphery = variant("shared-all-stretch-periphery", true, "periphery");
export const sharedAllSifting = variant("shared-all-stretch-sifting", true, "sifting");

/** This function gives the runs of a result with their routes, and the lane order of each run. */
function runsOf(result: Result): { runs: LaneRun[]; orders: (readonly string[])[] } {
  const byEdge = new Map(result.routes.map((r) => [r.edge, r] as const));
  const runs = (result.runs ?? []).map((run) => ({ points: run.points, routes: run.edges.map((e) => byEdge.get(e)!) }));
  return { runs, orders: (result.runs ?? []).map((run) => run.edges) };
}

/**
 * This function counts the pairs of lanes of each run in the order against the relation `bundle`. It also gives the distinct pairs of edges of these pairs.
 * A distinct pair counts one time on a board, as B5 counts a pair.
 */
function brokenPairs(runs: readonly LaneRun[], orders: readonly (readonly string[])[]): { readonly count: number; readonly distinct: number } {
  let count = 0;
  const distinct = new Set<string>();
  runs.forEach((run, i) => {
    const { placed } = placeRoutes(run.points, run.routes);
    const lane = new Map(orders[i]!.map((e, k) => [e, k] as const));
    for (let x = 0; x < placed.length; x++)
      for (let y = x + 1; y < placed.length; y++) {
        const a = placed[x]!;
        const b = placed[y]!;
        const left = byBundle(a, b) > 0 ? b : a;
        const right = left === a ? b : a;
        if (lane.get(left.edge)! < lane.get(right.edge)!) continue;
        count++;
        distinct.add(a.edge < b.edge ? `${a.edge}\u0000${b.edge}` : `${b.edge}\u0000${a.edge}`);
      }
  });
  return { count, distinct: distinct.size };
}

/** The audit of one variant on the set: the sums over the inputs, and the route time of each input. */
interface Audit {
  inputs: number;
  laneCrossings: number;
  brokenPairs: number;
  brokenDistinct: number;
  stretches: number;
  joinedRuns: number;
  ms: number[];
}

/** This function gives the median of a list of numbers. */
const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 === 1 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

/** This function routes each input of the set with each variant, and gives the audit by variant and the B5 of each input. */
function audit(): { totals: Record<string, Omit<Audit, "ms"> & { total: number; msMedian: number; msSum: number }>; perInput: Record<string, Record<string, number>> } {
  const inputs = screenInputs(SCREEN_V1).map((input) => ({ id: input.id, graph: inputGraph(input) }));
  const totals: Record<string, Omit<Audit, "ms"> & { total: number; msMedian: number; msSum: number }> = {};
  const perInput: Record<string, Record<string, number>> = {};
  for (const all of [false, true]) {
    for (const method of ["none", "consensus", "periphery", "sifting"] as const) {
      const name = `${all ? "shared-all" : "shared"}${method === "none" ? "" : `-stretch-${method}`}`;
      const a: Audit = { inputs: 0, laneCrossings: 0, brokenPairs: 0, brokenDistinct: 0, stretches: 0, joinedRuns: 0, ms: [] };
      for (const { id, graph } of inputs) {
        const router = sharedRouter(optionsOf(name, all, method));
        router.route(graph);
        const times: number[] = [];
        let result: Result | undefined;
        for (let k = 0; k < 3; k++) {
          const t0 = performance.now();
          result = router.route(graph);
          times.push(performance.now() - t0);
        }
        const { runs, orders } = runsOf(result!);
        const b5 = laneCrossings(segmentsOf(result!));
        a.inputs++;
        a.laneCrossings += b5;
        const broken = brokenPairs(runs, orders);
        a.brokenPairs += broken.count;
        a.brokenDistinct += broken.distinct;
        for (const s of laneStretches(runs, { method: method === "none" ? "consensus" : method })) {
          if (s.runs.length < 2) continue;
          a.stretches++;
          a.joinedRuns += s.runs.length;
        }
        a.ms.push(median(times));
        (perInput[id] ??= {})[name] = b5;
      }
      totals[name] = { inputs: a.inputs, laneCrossings: a.laneCrossings, brokenPairs: a.brokenPairs, brokenDistinct: a.brokenDistinct, total: a.laneCrossings + a.brokenDistinct, stretches: a.stretches, joinedRuns: a.joinedRuns, msMedian: median(a.ms), msSum: a.ms.reduce((x, y) => x + y, 0) };
    }
  }
  return { totals, perInput };
}

process.on("exit", () => {
  const { totals, perInput } = audit();
  console.log(`lane-stretch audit: ${JSON.stringify({ node: process.version, set: SCREEN_V1.id, totals })}`);
  console.log(`lane-stretch b5: ${JSON.stringify(perInput)}`);
});
