// The highway settings of the screen of BUILD-W3E: the moving least squares bundling (HWY-008), the skeleton-based edge bundling (HWY-009),
// the image-based edge bundles (HWY-010), the confluent drawings (HWY-013), the power graphs (HWY-014), the bundled crossings (HWY-022)
// and the subtrajectory clusters by the Fréchet distance (HWY-027).
// Each strategy runs alone and with the gate `stretch`. The module also has some changes of the options of each strategy.
// Start: `pnpm screen --step highway --module scripts/screens/build-w3e.ts`.
import { AREA_DEFAULTS, areaPlan, type AreaOptions } from "../../src/highways/areas/index.ts";
import { CONFLUENT_DEFAULTS, confluentPlan, type ConfluentOptions } from "../../src/highways/confluent/index.ts";
import { CROSSBAR_DEFAULTS, crossbarPlan, type CrossbarOptions } from "../../src/highways/crossbars/index.ts";
import { FRECHET_DEFAULTS, frechetPlan, type FrechetOptions } from "../../src/highways/frechet/index.ts";
import { gateStrategy } from "../../src/highways/gates/model.ts";
import { stretchGate } from "../../src/highways/gates/stretch/index.ts";
import { MLSEB_DEFAULTS, mlsebPlan, type MlsebOptions } from "../../src/highways/mlseb/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { POWER_DEFAULTS, powerPlan, type PowerOptions } from "../../src/highways/power/index.ts";
import { SBEB_DEFAULTS, sbebPlan, type SbebOptions } from "../../src/highways/sbeb/index.ts";
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

// Each strategy with the gate `stretch`.
export const mlsebStretch = gated("mlseb");
export const sbebStretch = gated("sbeb");
export const areasStretch = gated("areas");
export const confluentStretch = gated("confluent");
export const powerStretch = gated("power");
export const crossbarsStretch = gated("crossbars");
export const frechetStretch = gated("frechet");

const mlseb = (name: string, o: Partial<MlsebOptions>) => variant(name, mlsebPlan, { ...MLSEB_DEFAULTS, ...o });
const sbeb = (name: string, o: Partial<SbebOptions>) => variant(name, sbebPlan, { ...SBEB_DEFAULTS, ...o });
const areas = (name: string, o: Partial<AreaOptions>) => variant(name, areaPlan, { ...AREA_DEFAULTS, ...o });
const confluent = (name: string, o: Partial<ConfluentOptions>) => variant(name, confluentPlan, { ...CONFLUENT_DEFAULTS, ...o });
const power = (name: string, o: Partial<PowerOptions>) => variant(name, powerPlan, { ...POWER_DEFAULTS, ...o });
const crossbars = (name: string, o: Partial<CrossbarOptions>) => variant(name, crossbarPlan, { ...CROSSBAR_DEFAULTS, ...o });
const frechet = (name: string, o: Partial<FrechetOptions>) => variant(name, frechetPlan, { ...FRECHET_DEFAULTS, ...o });

// HWY-008: the fit parabola, the first routes, and no weight of the angle.
export const mlsebParabola = mlseb("mlseb-parabola", { fit: "parabola" });
export const mlsebRoutes = mlseb("mlseb-routes", { source: "routes" });
export const mlsebNoAngle = mlseb("mlseb-a0", { angleWeight: 0 });

// HWY-009: the mean line of the group in place of the skeleton (the comparison of the record), the keys, and the first routes.
export const sbebMean = sbeb("sbeb-mean", { target: "mean" });
export const sbebKeys = sbeb("sbeb-keys", { group: "keys" });
export const sbebRoutes = sbeb("sbeb-routes", { source: "routes" });

// HWY-010: the half width from the count of the lanes, and the keys.
export const areasCount = areas("areas-count", { width: "count" });
export const areasKeys = areas("areas-keys", { group: "keys" });

// HWY-013: larger bicliques, the scope collection, and no limit of the legs.
export const confluentMin6 = confluent("confluent-min6", { minBiclique: 6 });
export const confluentCollection = confluent("confluent-collection", { scope: "collection" });
export const confluentLegs = confluent("confluent-legs", { legMax: Infinity });

// HWY-014: the modules of near neighbours, a power edge that saves 1 edge, and the scope collection.
export const powerNear = power("power-near", { modules: "near" });
export const powerSaved1 = power("power-saved1", { minSaved: 1 });
export const powerCollection = power("power-collection", { scope: "collection" });

// HWY-022: the plan `corridors`, no plan, and a wider angle.
export const crossbarsCorridors = crossbars("crossbars-corridors", { from: "corridors" });
export const crossbarsNone = crossbars("crossbars-none", { from: "none" });
export const crossbarsTol30 = crossbars("crossbars-t30", { tolerance: 30 });

// HWY-027: a smaller and a larger distance, and a start at each sample.
export const frechetEps05 = frechet("frechet-e0.5", { eps: 0.5 });
export const frechetEps2 = frechet("frechet-e2", { eps: 2 });
export const frechetStride1 = frechet("frechet-s1", { stride: 1 });
