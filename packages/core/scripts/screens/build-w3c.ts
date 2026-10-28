// The highway settings of the screen of BUILD-W3C: the edge-path bundling (HWY-012), the soft keys (HWY-019), the Hough votes (HWY-024),
// the ridges of the line density (HWY-032), HDBSCAN on edges (HWY-028) and the hub arc location (HWY-042).
// Each finder runs alone and with the gate `stretch`. The module also has some changes of the options of each finder.
// Start: `pnpm screen --step highway --strategy edge-paths,soft-keys,hough,ridges,hdbscan,hub-arcs,shared-ways --module scripts/screens/build-w3c.ts`.
import { EDGE_PATH_DEFAULTS, edgePathPlan, type EdgePathOptions } from "../../src/highways/edge-paths/index.ts";
import { gateStrategy } from "../../src/highways/gates/model.ts";
import { stretchGate } from "../../src/highways/gates/stretch/index.ts";
import { HDBSCAN_DEFAULTS, hdbscanPlan, type HdbscanOptions } from "../../src/highways/hdbscan/index.ts";
import { HOUGH_DEFAULTS, houghPlan, type HoughOptions } from "../../src/highways/hough/index.ts";
import { HUB_ARC_DEFAULTS, hubArcPlan, type HubArcOptions } from "../../src/highways/hub-arcs/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { RIDGE_DEFAULTS, ridgePlan, type RidgeOptions } from "../../src/highways/ridges/index.ts";
import { SOFT_KEY_DEFAULTS, softKeyPlan, type SoftKeyOptions } from "../../src/highways/soft-keys/index.ts";
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
export const edgePathsStretch = gated("edge-paths");
export const softKeysStretch = gated("soft-keys");
export const houghStretch = gated("hough");
export const ridgesStretch = gated("ridges");
export const hdbscanStretch = gated("hdbscan");
export const hubArcsStretch = gated("hub-arcs");

const edgePaths = (name: string, o: Partial<EdgePathOptions>) => variant(name, edgePathPlan, { ...EDGE_PATH_DEFAULTS, ...o });
const softKeys = (name: string, o: Partial<SoftKeyOptions>) => variant(name, softKeyPlan, { ...SOFT_KEY_DEFAULTS, ...o });
const hough = (name: string, o: Partial<HoughOptions>) => variant(name, houghPlan, { ...HOUGH_DEFAULTS, ...o });
const ridges = (name: string, o: Partial<RidgeOptions>) => variant(name, ridgePlan, { ...RIDGE_DEFAULTS, ...o });
const hdbscan = (name: string, o: Partial<HdbscanOptions>) => variant(name, hdbscanPlan, { ...HDBSCAN_DEFAULTS, ...o });
const hubArcs = (name: string, o: Partial<HubArcOptions>) => variant(name, hubArcPlan, { ...HUB_ARC_DEFAULTS, ...o });

// HWY-012: a smaller and a larger distortion.
export const edgePathsK15 = edgePaths("edge-paths-k1.5", { distortion: 1.5 });
export const edgePathsK3 = edgePaths("edge-paths-k3", { distortion: 3 });

// HWY-019: no key term, a key term so large that it acts as a hard key, and a larger cut.
export const softKeysLambda0 = softKeys("soft-keys-l0", { lambda: 0 });
export const softKeysHard = softKeys("soft-keys-hard", { lambda: Infinity });
export const softKeysTau1 = softKeys("soft-keys-t1", { tau: 1 });

// HWY-024: only horizontal and vertical corridors, and wider votes.
export const houghOrthogonal = hough("hough-ortho", { orthogonal: true });
export const houghWide = hough("hough-wide", { dTheta: 12, dRho: 24 });

// HWY-032: the density of the first routes, and a wider blur.
export const ridgesRoutes = ridges("ridges-routes", { source: "routes" });
export const ridgesWide = ridges("ridges-wide", { bandwidth: 32 });

// HWY-028: the flow distance, and clusters of 2 edges.
export const hdbscanFlow = hdbscan("hdbscan-flow", { distance: "flow" });
export const hdbscanMin2 = hdbscan("hdbscan-m2", { minClusterSize: 2, minSamples: 2 });

// HWY-042: fewer arcs, and a smaller cost on an arc.
export const hubArcsQ4 = hubArcs("hub-arcs-q4", { q: 4 });
export const hubArcsAlpha03 = hubArcs("hub-arcs-a0.3", { alpha: 0.3 });
