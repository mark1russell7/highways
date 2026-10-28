// The highway settings of the screen of BUILD-W3F: the spectral clusters (HWY-029), the effective resistance (HWY-021), the link communities (HWY-030),
// the territories (HWY-033), the consensus (HWY-035), the p-hub median (HWY-041) and the scale space with persistence (HWY-053).
// Each strategy runs alone and with the gate `stretch`. The module also has some changes of the options of each strategy,
// and the levels 1 and 2 of `nested`, the baseline of `scale-space`.
// Start: `pnpm screen --step highway --strategy spectral,resistance,link-communities,territories,consensus,p-hub,scale-space,shared-ways,hub-arcs,nested,corridors,quickbundles,wspd,road-classes --module scripts/screens/build-w3f.ts`.
import { gateStrategy } from "../../src/highways/gates/model.ts";
import { stretchGate } from "../../src/highways/gates/stretch/index.ts";
import { CONSENSUS_DEFAULTS, consensusPlan, type ConsensusOptions } from "../../src/highways/consensus/index.ts";
import { LINK_COMMUNITY_DEFAULTS, linkCommunityPlan, type LinkCommunityOptions } from "../../src/highways/link-communities/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { NESTED_DEFAULTS, nestedPlan, type NestedOptions } from "../../src/highways/nested/index.ts";
import { P_HUB_DEFAULTS, pHubPlan, type PHubOptions } from "../../src/highways/p-hub/index.ts";
import { RESISTANCE_DEFAULTS, resistancePlan, type ResistanceOptions } from "../../src/highways/resistance/index.ts";
import { SCALE_SPACE_DEFAULTS, scaleSpacePlan, type ScaleSpaceOptions } from "../../src/highways/scale-space/index.ts";
import { SPECTRAL_DEFAULTS, spectralPlan, type SpectralOptions } from "../../src/highways/spectral/index.ts";
import { TERRITORY_DEFAULTS, territoryPlan, type TerritoryOptions } from "../../src/highways/territories/index.ts";
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

// Each strategy with the gate `stretch`, and the gated `hub-arcs` of W3C for the comparison with `p-hub`.
export const spectralStretch = gated("spectral");
export const resistanceStretch = gated("resistance");
export const linkCommunitiesStretch = gated("link-communities");
export const territoriesStretch = gated("territories");
export const consensusStretch = gated("consensus");
export const pHubStretch = gated("p-hub");
export const scaleSpaceStretch = gated("scale-space");
export const hubArcsStretch = gated("hub-arcs");

const spectral = (name: string, o: Partial<SpectralOptions>) => variant(name, spectralPlan, { ...SPECTRAL_DEFAULTS, ...o });
const resistance = (name: string, o: Partial<ResistanceOptions>) => variant(name, resistancePlan, { ...RESISTANCE_DEFAULTS, ...o });
const communities = (name: string, o: Partial<LinkCommunityOptions>) => variant(name, linkCommunityPlan, { ...LINK_COMMUNITY_DEFAULTS, ...o });
const territories = (name: string, o: Partial<TerritoryOptions>) => variant(name, territoryPlan, { ...TERRITORY_DEFAULTS, ...o });
const consensus = (name: string, o: Partial<ConsensusOptions>) => variant(name, consensusPlan, { ...CONSENSUS_DEFAULTS, ...o });
const pHub = (name: string, o: Partial<PHubOptions>) => variant(name, pHubPlan, { ...P_HUB_DEFAULTS, ...o });
const scaleSpace = (name: string, o: Partial<ScaleSpaceOptions>) => variant(name, scaleSpacePlan, { ...SCALE_SPACE_DEFAULTS, ...o });
const nested = (name: string, o: Partial<NestedOptions>) => variant(name, nestedPlan, { ...NESTED_DEFAULTS, ...o });

// HWY-029: a lower threshold of the pairs, and the spine `shared`.
export const spectralC03 = spectral("spectral-c0.3", { c0: 0.3 });
export const spectralShared = spectral("spectral-shared", { spine: "shared" });

// HWY-021: the full weight of the resistance, and no pairs for the bridges.
export const resistanceW1 = resistance("resistance-w1", { weight: 1 });
export const resistanceSparse = resistance("resistance-sparse", { sparsify: true });

// HWY-030: a fixed cut at 0.3, and the spine `trunk`.
export const communitiesT03 = communities("link-communities-t0.3", { threshold: 0.3 });
export const communitiesTrunk = communities("link-communities-trunk", { spine: "trunk" });

// HWY-033: the radii 2 and 8 (three zoom levels with the default 4), and only the plugs.
export const territoriesR2 = territories("territories-r2", { radius: 2 });
export const territoriesR8 = territories("territories-r8", { radius: 8 });
export const territoriesPlugs = territories("territories-plugs", { points: "plugs" });

// HWY-035: the single linkage, and the cuts 0.3 (strict) and 0.7 (loose).
export const consensusSingle = consensus("consensus-single", { linkage: "single" });
export const consensusC03 = consensus("consensus-c0.3", { cut: 0.3 });
export const consensusC07 = consensus("consensus-c0.7", { cut: 0.7 });

// HWY-041: the multiple allocation, the centres of the sections, and the cost 0.2 of a hub link.
export const pHubMultiple = pHub("p-hub-multiple", { allocation: "multiple" });
export const pHubSections = pHub("p-hub-sections", { candidates: "sections" });
export const pHubA02 = pHub("p-hub-a0.2", { alpha: 0.2 });

// HWY-053: one scale with no persistence (`p0` 0), the scales 4 (6 units) and 6 (12 units), and the levels 1 and 2 of `nested` at the same scales.
export const scaleSpaceP0 = scaleSpace("scale-space-p0", { p0: 0 });
export const scaleSpaceL4 = scaleSpace("scale-space-l4", { level: 4 });
export const scaleSpaceL6 = scaleSpace("scale-space-l6", { level: 6 });
export const nestedL1 = nested("w3f-nested-l1", { level: 1 });
export const nestedL2 = nested("w3f-nested-l2", { level: 2 });
