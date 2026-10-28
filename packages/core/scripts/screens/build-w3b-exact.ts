// The exact reference of BUILD-W3B: fixed-charge network design (HWY-040), solved with HiGHS on the boards of 20 nodes or fewer.
// Start: `pnpm screen --step highway --families tiny-uniform --strategy shared-ways,corridors,quickbundles,road-classes,wspd --module scripts/screens/build-w3b-exact.ts`.
// With the rule `collection`, only the edges of one collection share a link, as in the router `shared`. Its baseline is `shared`.
// With the rule `all`, each edge can share a link. Its baseline is `shared-ways-all` (the router `shared-all` as a plan).
// HiGHS is a devDependency. The library does not import it. The module writes the status and the time of each solve to stderr.
import highsModule from "highs";
import { exactModel, type ExactOptions } from "../../src/bench/exact/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { sharedWaysPlan } from "../../src/highways/shared-ways/index.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

// The types of `highs` describe a CommonJS module, but Node loads its ES module. Its loader is the default export of either form.
const loadHighs = (highsModule.default ?? highsModule) as typeof highsModule.default;

const highs = await loadHighs();

/** The time limit of one solve, in seconds. */
const TIME_LIMIT = Number(process.env["EXACT_SECONDS"] ?? 60);

// The screen runs each strategy twice on each input. The cache gives the second run the plan of the first.
const cache = new Map<string, HighwayPlan>();

/** This function makes the exact strategy with the options `o`. The screen skips a board with more than 20 nodes. */
function exact(name: string, o: ExactOptions): Strategy<"highway", object> {
  const run = (input: HighwayInput): HighwayPlan => {
    const key = `${name}\u0000${JSON.stringify(input.graph)}`;
    const known = cache.get(key);
    if (known) return known;
    const model = exactModel(input.graph, o);
    const start = performance.now();
    const solution = highs.solve(model.lp, { time_limit: TIME_LIMIT, output_flag: false, mip_rel_gap: 0 });
    const seconds = (performance.now() - start) / 1000;
    const found = solution.Status === "Optimal" || (solution.Status === "Time limit reached" && Number.isFinite(solution.ObjectiveValue));
    const columns = solution.Columns as Record<string, { Primal: number }>;
    const plan = found ? model.decode((n) => columns[n]?.Primal ?? 0) : { highways: [] };
    process.stderr.write(
      `W3B exact ${name} nodes=${input.graph.nodes.length} edges=${model.edges} binaries=${model.columns} rows=${model.rows} status="${solution.Status}" objective=${solution.ObjectiveValue} seconds=${seconds.toFixed(1)} highways=${plan.highways.length}\n`,
    );
    cache.set(key, plan);
    return plan;
  };
  return defineStrategy({ step: "highway", name, describe: `The exact fixed-charge network design with ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 20, run });
}

export const exactCol110 = exact("exact-col-s1.1", { stretch: 1.1, rule: "collection" });
export const exactCol125 = exact("exact-col-s1.25", { stretch: 1.25, rule: "collection" });
export const exactCol150 = exact("exact-col-s1.5", { stretch: 1.5, rule: "collection" });
export const exactAll110 = exact("exact-all-s1.1", { stretch: 1.1, rule: "all" });
export const exactAll125 = exact("exact-all-s1.25", { stretch: 1.25, rule: "all" });
export const exactAll150 = exact("exact-all-s1.5", { stretch: 1.5, rule: "all" });

/** The router `shared-all` as a plan: the baseline of the exact model with the rule `all`. */
export const sharedWaysAll = defineStrategy({
  step: "highway",
  name: "shared-ways-all",
  describe: "The plan of the router `shared` without a rule.",
  defaults: {},
  schema: {},
  maxNodes: 10_000,
  run: (input: HighwayInput): HighwayPlan => sharedWaysPlan(input, {}),
});
