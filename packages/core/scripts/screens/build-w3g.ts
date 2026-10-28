// The highway settings of the screen of BUILD-W3G: the Steiner trees (HWY-036), the gap highways (HWY-057), the streets by set cover (HWY-058),
// the local search (HWY-059) and the interchanges (HWY-060). Each strategy runs alone and with the gate `stretch`.
// The module also has one or two changes of the options of each strategy.
// Start: `pnpm screen --step highway --strategy steiner,gaps,streets,search,interchanges,corridors --module scripts/screens/build-w3g.ts`.
import { gateStrategy } from "../../src/highways/gates/model.ts";
import { stretchGate } from "../../src/highways/gates/stretch/index.ts";
import { GAP_DEFAULTS, gapPlan } from "../../src/highways/gaps/index.ts";
import { INTERCHANGE_DEFAULTS, interchangePlan } from "../../src/highways/interchanges/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { SEARCH_DEFAULTS, searchPlan } from "../../src/highways/search/index.ts";
import { STEINER_DEFAULTS, steinerPlan } from "../../src/highways/steiner/index.ts";
import { STREET_DEFAULTS, streetPlan } from "../../src/highways/streets/index.ts";
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
export const steinerStretch = gated("steiner");
export const gapsStretch = gated("gaps");
export const streetsStretch = gated("streets");
export const searchStretch = gated("search");
export const interchangesStretch = gated("interchanges");

// HWY-036: the octilinear metric, and one tree for each collection.
export const steinerOctilinear = variant("steiner-octilinear", steinerPlan, { ...STEINER_DEFAULTS, metric: "octilinear" as const });
export const steinerKey = variant("steiner-key", steinerPlan, { ...STEINER_DEFAULTS, group: "key" as const });

// HWY-057: the lines through the corners, and the demand 2.
export const gapsCorners = variant("gaps-corners", gapPlan, { ...GAP_DEFAULTS, source: "corners" as const });
export const gapsK2 = variant("gaps-k2", gapPlan, { ...GAP_DEFAULTS, minSize: 2 });

// HWY-058: the gaps of the room step, and a lower gain.
export const streetsRoom = variant("streets-room", streetPlan, { ...STREET_DEFAULTS, source: "room" as const });
export const streetsGain15 = variant("streets-g1.5", streetPlan, { ...STREET_DEFAULTS, minGain: 1.5 });

// HWY-059: a larger budget, and the start plan alone (no search), as the reference of the search.
export const searchE48 = variant("search-e48", searchPlan, { ...SEARCH_DEFAULTS, evaluations: 48 });
export const searchE0 = variant("search-e0", searchPlan, { ...SEARCH_DEFAULTS, evaluations: 0 });

// HWY-060: three highways for each edge, and changes with no cost.
export const interchangesP3 = variant("interchanges-p3", interchangePlan, { ...INTERCHANGE_DEFAULTS, perEdge: 3 });
export const interchangesC0 = variant("interchanges-c0", interchangePlan, { ...INTERCHANGE_DEFAULTS, changeCost: 0 });
