// The highway settings of the screen of BUILD-W3D: the divided edge bundling (HWY-011), the hierarchical edge bundling (HWY-001),
// FDEB with the box field (HWY-002 with RULE-002), the control mesh (HWY-004), KDEEB with the mask (RULE-028 with HWY-006) and CUBu (HWY-007).
// Each strategy runs alone and with the gate `stretch`. The module also has some changes of the options of each strategy.
// Start: `pnpm screen --step highway --strategy divided,hierarchy,fdeb,mesh,kdeeb,cubu,shared-ways --module scripts/screens/build-w3d.ts`.
import { CUBU_DEFAULTS, cubuPlan, type CubuOptions } from "../../src/highways/cubu/index.ts";
import { DIVIDED_DEFAULTS, dividedPlan, type DividedOptions } from "../../src/highways/divided/index.ts";
import { FDEB_DEFAULTS, fdebPlan, type FdebOptions } from "../../src/highways/fdeb/index.ts";
import { gateStrategy } from "../../src/highways/gates/model.ts";
import { stretchGate } from "../../src/highways/gates/stretch/index.ts";
import { HIERARCHY_DEFAULTS, hierarchyPlan, type HierarchyOptions } from "../../src/highways/hierarchy/index.ts";
import { KDEEB_DEFAULTS, kdeebPlan, type KdeebOptions } from "../../src/highways/kdeeb/index.ts";
import { MESH_DEFAULTS, meshPlan, type MeshOptions } from "../../src/highways/mesh/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
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
export const dividedStretch = gated("divided");
export const hierarchyStretch = gated("hierarchy");
export const fdebStretch = gated("fdeb");
export const meshStretch = gated("mesh");
export const kdeebStretch = gated("kdeeb");
export const cubuStretch = gated("cubu");

const divided = (name: string, o: Partial<DividedOptions>) => variant(name, dividedPlan, { ...DIVIDED_DEFAULTS, ...o });
const hierarchy = (name: string, o: Partial<HierarchyOptions>) => variant(name, hierarchyPlan, { ...HIERARCHY_DEFAULTS, ...o });
const fdeb = (name: string, o: Partial<FdebOptions>) => variant(name, fdebPlan, { ...FDEB_DEFAULTS, ...o });
const mesh = (name: string, o: Partial<MeshOptions>) => variant(name, meshPlan, { ...MESH_DEFAULTS, ...o });
const kdeeb = (name: string, o: Partial<KdeebOptions>) => variant(name, kdeebPlan, { ...KDEEB_DEFAULTS, ...o });
const cubu = (name: string, o: Partial<CubuOptions>) => variant(name, cubuPlan, { ...CUBU_DEFAULTS, ...o });

// HWY-011: a wider gap, the traffic on the left, and the plan of `corridors`.
export const dividedGap2 = divided("divided-gap2", { gap: 2 });
export const dividedLeft = divided("divided-left", { rule: "left" });
export const dividedCorridors = divided("divided-corridors", { from: "corridors" });

// HWY-001: one hub on each side, a weaker pull, and the kd tree.
export const hierarchyHubs1 = hierarchy("hierarchy-hubs1", { hubs: 1 });
export const hierarchyBeta05 = hierarchy("hierarchy-b0.5", { beta: 0.5 });
export const hierarchyKd = hierarchy("hierarchy-kd", { group: "kd" });

// HWY-002 with RULE-002: no stretch budget, and no push of the boxes (only the hard projection).
export const fdebNoBudget = fdeb("fdeb-nobudget", { pullLimit: Infinity });
export const fdebNoPush = fdeb("fdeb-nopush", { repulsion: 0 });

// HWY-004: larger cells, and clusters of up to 16 edges.
export const meshCell8 = mesh("mesh-c8", { cell: 8 });
export const meshCap16 = mesh("mesh-cap16", { capacity: 16 });

// RULE-028 with HWY-006: no mask (plain KDEEB), and the density of the first routes.
export const kdeebNoMask = kdeeb("kdeeb-nomask", { mask: false });
export const kdeebRoutes = kdeeb("kdeeb-routes", { source: "routes" });

// HWY-007: the kernel of FFTEB.
export const cubuFft = cubu("cubu-fft", { kernel: "fft" });
