// The highway settings of the screen of BUILD-W2C: QuickBundles (HWY-026), road classes (HWY-034), the flow field (EDA-046),
// the WSPD (HWY-018), the candidate selection (HWY-045) and the OD cells (EDA-033). Each finder runs alone and with the gate `stretch`.
// The module also has `zipper+stretch` (NAT-022) and `level-links+stretch` (HWY-056), with smaller budgets of the gate.
// Start: `pnpm screen --step highway --module scripts/screens/build-w2c.ts`. The baselines are the router `shared` and the strategies `shared-ways` and `corridors`.
import { FLOW_FIELD_DEFAULTS, flowFieldPlan, type FlowFieldOptions } from "../../src/highways/flow-field/index.ts";
import { gateStrategy } from "../../src/highways/gates/model.ts";
import { stretchGate } from "../../src/highways/gates/stretch/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { OD_CELL_DEFAULTS, odCellPlan, type OdCellOptions } from "../../src/highways/od-cells/index.ts";
import { QUICKBUNDLES_DEFAULTS, quickBundlesPlan, type QuickBundlesOptions } from "../../src/highways/quickbundles/index.ts";
import { ROAD_CLASS_DEFAULTS, roadClassPlan, type RoadClassOptions } from "../../src/highways/road-classes/index.ts";
import { SELECT_DEFAULTS, selectPlan, type SelectOptions } from "../../src/highways/select/index.ts";
import { WSPD_DEFAULTS, wspdPlan, type WspdOptions } from "../../src/highways/wspd/index.ts";
import { highwayStrategies } from "../../src/strategies/builtins.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a highway strategy with the name `name`, from the plan function `plan` and the options `options`. */
function variant<O extends object>(name: string, plan: (input: HighwayInput, o: Readonly<O>) => HighwayPlan, options: O): Strategy<"highway", object> {
  const run = (input: HighwayInput): HighwayPlan => plan(input, options);
  return defineStrategy({ step: "highway", name, describe: `The settings ${JSON.stringify(options)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

/** This function puts the gate `stretch` after the built-in strategy `name`, with the budget `budget`. */
function gated(name: keyof typeof highwayStrategies, budget?: number): Strategy<"highway", object> {
  const strategy = gateStrategy(highwayStrategies[name] as Strategy<"highway", object>, stretchGate);
  if (budget === undefined) return strategy;
  const options = { ...strategy.defaults, budget };
  return defineStrategy({ step: "highway", name: `${strategy.name}-b${budget}`, describe: strategy.describe, defaults: {}, schema: {}, maxNodes: 10_000, run: (input: HighwayInput) => strategy.run(input, options) });
}

// Each finder with the gate `stretch`.
export const quickbundlesStretch = gated("quickbundles");
export const roadClassesStretch = gated("road-classes");
export const flowFieldStretch = gated("flow-field");
export const wspdStretch = gated("wspd");
export const odCellsStretch = gated("od-cells");
export const selectStretch = gated("select");

// NAT-022 with WILD-037, and HWY-056 with WILD-034: the plan changers with the gate, and with smaller budgets.
export const zipperStretch = gated("zipper");
export const zipperStretch115 = gated("zipper", 1.15);
export const zipperStretch11 = gated("zipper", 1.1);
export const levelLinksStretch = gated("level-links");
export const levelLinksStretch11 = gated("level-links", 1.1);

const quick = (name: string, o: Partial<QuickBundlesOptions>) => variant(name, quickBundlesPlan, { ...QUICKBUNDLES_DEFAULTS, ...o });
const roads = (name: string, o: Partial<RoadClassOptions>) => variant(name, roadClassPlan, { ...ROAD_CLASS_DEFAULTS, ...o });
const field = (name: string, o: Partial<FlowFieldOptions>) => variant(name, flowFieldPlan, { ...FLOW_FIELD_DEFAULTS, ...o });
const wspd = (name: string, o: Partial<WspdOptions>) => variant(name, wspdPlan, { ...WSPD_DEFAULTS, ...o });
const cells = (name: string, o: Partial<OdCellOptions>) => variant(name, odCellPlan, { ...OD_CELL_DEFAULTS, ...o });
const select = (name: string, o: Partial<SelectOptions>) => variant(name, selectPlan, { ...SELECT_DEFAULTS, ...o });

// HWY-026: the trunk spine, the straight lines, and a smaller and a larger threshold.
export const quickTrunk = quick("quickbundles-trunk", { spine: "trunk" });
export const quickLines = quick("quickbundles-lines", { line: "lines" });
export const quickTheta15 = quick("quickbundles-t1.5", { theta: 1.5 });
export const quickTheta6 = quick("quickbundles-t6", { theta: 6 });

// HWY-034 with EDA-050: more main roads, and a smaller discount.
export const roadsQ08 = roads("road-classes-q0.8", { quantile: 0.8 });
export const roadsDiscount03 = roads("road-classes-d0.3", { discount: 0.3 });

// EDA-046 with HWY-037: the field at the sources.
export const fieldSource = field("flow-field-source", { end: "source" });

// HWY-018: the shared spine, and a smaller and a larger separation.
export const wspdShared = wspd("wspd-shared", { spine: "shared" });
export const wspdS1 = wspd("wspd-s1", { separation: 1 });
export const wspdS4 = wspd("wspd-s4", { separation: 4 });

// EDA-033 with WILD-032: the cells at the levels 1 and 3, and the shared spine.
export const cellsLevel1 = cells("od-cells-l1", { level: 1 });
export const cellsLevel3 = cells("od-cells-l3", { level: 3 });
export const cellsShared = cells("od-cells-shared", { spine: "shared" });

// HWY-045: a smaller and a larger weight of the detour, and all the generators.
export const selectLambda05 = select("select-l0.5", { lambda: 0.5 });
export const selectLambda2 = select("select-l2", { lambda: 2 });
export const selectAll = select("select-all", { generators: ["corridors", "quickbundles", "wspd", "road-classes", "flow-field", "od-cells", "shared-ways"] });
