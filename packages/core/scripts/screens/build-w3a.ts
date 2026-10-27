// The highway settings of the screen of BUILD-W3A: MINGLE (HWY-003), the spiral trees (HWY-017 with EDA-035),
// the flow clusters in 4D (HWY-023), TRACLUS (HWY-025) and the diffusion on the corner graph (HWY-020).
// Each finder runs alone and with the gate `stretch`. The module also has some changes of the options of each finder.
// Start: `pnpm screen --step highway --strategy mingle,spiral,flow-clusters,traclus,diffusion,shared-ways --module scripts/screens/build-w3a.ts`.
import { DIFFUSION_DEFAULTS, diffusionPlan, type DiffusionOptions } from "../../src/highways/diffusion/index.ts";
import { FLOW_CLUSTER_DEFAULTS, flowClusterPlan, type FlowClusterOptions } from "../../src/highways/flow-clusters/index.ts";
import { gateStrategy } from "../../src/highways/gates/model.ts";
import { stretchGate } from "../../src/highways/gates/stretch/index.ts";
import { MINGLE_DEFAULTS, minglePlan, type MingleOptions } from "../../src/highways/mingle/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { SPIRAL_DEFAULTS, spiralPlan, type SpiralOptions } from "../../src/highways/spiral/index.ts";
import { TRACLUS_DEFAULTS, traclusPlan, type TraclusOptions } from "../../src/highways/traclus/index.ts";
import { highwayStrategies } from "../../src/strategies/builtins.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a highway strategy with the name `name`, from the plan function `plan` and the options `options`. */
function variant<O extends object>(name: string, plan: (input: HighwayInput, o: Readonly<O>) => HighwayPlan, options: O): Strategy<"highway", object> {
  const run = (input: HighwayInput): HighwayPlan => plan(input, options);
  return defineStrategy({ step: "highway", name, describe: `The settings ${JSON.stringify(options)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

/** This function puts the gate `stretch` after the built-in strategy `name`. */
function gated(name: keyof typeof highwayStrategies): Strategy<"highway", object> {
  return gateStrategy(highwayStrategies[name] as Strategy<"highway", object>, stretchGate);
}

// Each finder with the gate `stretch`.
export const mingleStretch = gated("mingle");
export const spiralStretch = gated("spiral");
export const flowClustersStretch = gated("flow-clusters");
export const traclusStretch = gated("traclus");
export const diffusionStretch = gated("diffusion");

const mingle = (name: string, o: Partial<MingleOptions>) => variant(name, minglePlan, { ...MINGLE_DEFAULTS, ...o });
const spiral = (name: string, o: Partial<SpiralOptions>) => variant(name, spiralPlan, { ...SPIRAL_DEFAULTS, ...o });
const flows = (name: string, o: Partial<FlowClusterOptions>) => variant(name, flowClusterPlan, { ...FLOW_CLUSTER_DEFAULTS, ...o });
const traclus = (name: string, o: Partial<TraclusOptions>) => variant(name, traclusPlan, { ...TRACLUS_DEFAULTS, ...o });
const diffusion = (name: string, o: Partial<DiffusionOptions>) => variant(name, diffusionPlan, { ...DIFFUSION_DEFAULTS, ...o });

// HWY-003: the shared spine, a smaller and a larger turn limit, and two levels only.
export const mingleShared = mingle("mingle-shared", { spine: "shared" });
export const mingleTurn25 = mingle("mingle-t25", { maxTurn: 25 });
export const mingleTurn60 = mingle("mingle-t60", { maxTurn: 60 });
export const mingleLevels2 = mingle("mingle-l2", { levels: 2 });

// HWY-017 with EDA-035: a smaller and a larger spiral angle, and fans of 3 targets.
export const spiralAlpha15 = spiral("spiral-a15", { alpha: 15 });
export const spiralAlpha35 = spiral("spiral-a35", { alpha: 35 });
export const spiralTargets3 = spiral("spiral-n3", { minTargets: 3 });

// HWY-023: the shared spine, a smaller and a larger cut, and the complete linkage.
export const flowsShared = flows("flow-clusters-shared", { spine: "shared" });
export const flowsTau015 = flows("flow-clusters-t0.15", { tau: 0.15 });
export const flowsTau05 = flows("flow-clusters-t0.5", { tau: 0.5 });
export const flowsComplete = flows("flow-clusters-complete", { linkage: "complete" });

// HWY-025: a smaller and a larger neighbour distance, and clusters of 2 edges.
export const traclusEps1 = traclus("traclus-e1", { eps: 1 });
export const traclusEps4 = traclus("traclus-e4", { eps: 4 });
export const traclusMin2 = traclus("traclus-m2", { minLns: 2 });

// HWY-020: a stronger pull of the density, a wider diffusion, and a sharper cost.
export const diffusionLambda3 = diffusion("diffusion-l3", { lambda: 3 });
export const diffusionWide = diffusion("diffusion-wide", { a: 0.5, steps: 6 });
export const diffusionGamma2 = diffusion("diffusion-g2", { gamma: 2 });
