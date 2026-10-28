// The highway settings of the screen of BUILD-W3B: the nested levels (HWY-052), the lanes and the capacity (HWY-051) and the local growth (HWY-055).
// Start: `pnpm screen --step highway --strategy shared-ways,corridors,quickbundles,nested,lanes,growth --module scripts/screens/build-w3b.ts`.
// The baselines are the router `shared`, and `shared-ways`, `corridors` and `quickbundles` (the flat clusters of `nested`).
// The module writes the channel overflows of `lanes` and the nesting checks of `nested` to stderr, because the screen has no measure of them.
import { basePlan } from "../../src/highways/base.ts";
import { GROWTH_DEFAULTS, growthPlan, type GrowthOptions } from "../../src/highways/growth/index.ts";
import { channelOverflows, LANES_DEFAULTS, lanesPlan, type LanesOptions } from "../../src/highways/lanes/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { NESTED_DEFAULTS, nestedGroups, nestedPlan, nestingViolations, type NestedOptions } from "../../src/highways/nested/index.ts";
import { QUICKBUNDLES_DEFAULTS, quickBundles, quickBundlesPlan, type QuickBundlesOptions } from "../../src/highways/quickbundles/index.ts";
import type { Graph } from "../../src/model.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a highway strategy with the name `name`, from the plan function `plan` and the options `options`. */
function variant<O extends object>(name: string, plan: (input: HighwayInput, o: Readonly<O>) => HighwayPlan, options: O): Strategy<"highway", object> {
  const run = (input: HighwayInput): HighwayPlan => plan(input, options);
  return defineStrategy({ step: "highway", name, describe: `The settings ${JSON.stringify(options)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

/** This function gives a short key of a graph, so that each log line comes one time for each board. */
const boardKey = (g: Graph): string => `${g.nodes.length}/${g.edges.length}/${g.nodes[0]?.id}/${g.nodes[0]?.box.x},${g.nodes[0]?.box.y}`;
const logged = new Set<string>();
const logOnce = (key: string, line: string): void => {
  if (logged.has(key)) return;
  logged.add(key);
  process.stderr.write(`${line}\n`);
};

/** This function gives the plan of `lanes`, and logs the overflows of the base and of the plan. */
function lanesLogged(input: HighwayInput, o: Readonly<LanesOptions>): HighwayPlan {
  const plan = lanesPlan(input, o);
  const g = input.graph;
  const base = basePlan(input, o.from);
  logOnce(`lanes ${JSON.stringify(o)} ${boardKey(g)}`, `W3B lanes ${JSON.stringify(o)} board=${boardKey(g)} highways ${base.highways.length}->${plan.highways.length} overflows ${channelOverflows(g, base, o)}->${channelOverflows(g, plan, o)}`);
  return plan;
}

/** This function gives the plan of one level of `nested`, and logs the nesting checks and the group counts of nested and flat clusters. */
function nestedLogged(input: HighwayInput, o: Readonly<NestedOptions>): HighwayPlan {
  const g = input.graph;
  const levels = nestedGroups(input, o);
  const flat = levels.map((_, d) => quickBundles(input, { ...QUICKBUNDLES_DEFAULTS, theta: o.theta * o.ratio ** d }));
  const groups = (m: ReadonlyMap<string, { key: string }>): number => new Set([...m.values()].map((x) => x.key)).size;
  const nest = levels.slice(1).map((coarse, i) => nestingViolations(coarse, levels[i]!));
  const flatNest = flat.slice(1).map((coarse, i) => nestingViolations(coarse, flat[i]!));
  logOnce(
    `nested ${boardKey(g)}`,
    `W3B nested board=${boardKey(g)} groups nested ${levels.map(groups).join(",")} flat ${flat.map(groups).join(",")} violations nested ${nest.join(",")} flat ${flatNest.join(",")}`,
  );
  return nestedPlan(input, o);
}

// HWY-052: each level of the nested clusters, and the flat clusters of QuickBundles at the same scales.
export const nestedL0 = variant("nested-l0", nestedLogged, { ...NESTED_DEFAULTS, level: 0 });
export const nestedL1 = variant("nested-l1", nestedLogged, { ...NESTED_DEFAULTS, level: 1 });
export const nestedL2 = variant("nested-l2", nestedLogged, { ...NESTED_DEFAULTS, level: 2 });
export const flatT6 = variant("quickbundles-t6", quickBundlesPlan, { ...QUICKBUNDLES_DEFAULTS, theta: 6 } as QuickBundlesOptions);
export const flatT12 = variant("quickbundles-t12", quickBundlesPlan, { ...QUICKBUNDLES_DEFAULTS, theta: 12 } as QuickBundlesOptions);

// HWY-051: the split of the highways that do not fit, on the plans of `shared-ways` and `corridors`, and with a smaller width.
export const lanesShared = variant("lanes-shared-ways", lanesLogged, { ...LANES_DEFAULTS } as LanesOptions);
export const lanesCorridors = variant("lanes-corridors", lanesLogged, { ...LANES_DEFAULTS, from: "corridors" } as LanesOptions);
export const lanesW16 = variant("lanes-w16", lanesLogged, { ...LANES_DEFAULTS, maxWidth: 16 } as LanesOptions);

// HWY-055: the local growth with other shares, stretch limits and orders.
export const growthS03 = variant("growth-s0.3", growthPlan, { ...GROWTH_DEFAULTS, share: 0.3 } as GrowthOptions);
export const growthS07 = variant("growth-s0.7", growthPlan, { ...GROWTH_DEFAULTS, share: 0.7 } as GrowthOptions);
export const growthT12 = variant("growth-t1.2", growthPlan, { ...GROWTH_DEFAULTS, stretch: 1.2 } as GrowthOptions);
export const growthInput = variant("growth-input", growthPlan, { ...GROWTH_DEFAULTS, order: "input" } as GrowthOptions);
