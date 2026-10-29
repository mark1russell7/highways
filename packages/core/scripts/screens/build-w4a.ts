// The highway settings of the screen of BUILD-W4A: the knee of the plant front (NAT-018) and the bronchial splits (NAT-019).
// Each strategy runs alone and with the gate `stretch`. The module also has changes of the options of each strategy.
// Start: `pnpm screen --step highway --strategy knee,bronchial --module scripts/screens/build-w4a.ts`.
import { BRONCHIAL_DEFAULTS, bronchialPlan } from "../../src/highways/bronchial/index.ts";
import { gateStrategy } from "../../src/highways/gates/model.ts";
import { stretchGate } from "../../src/highways/gates/stretch/index.ts";
import { KNEE_DEFAULTS, kneePlan } from "../../src/highways/knee/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { highwayStrategies } from "../../src/strategies/builtins.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a highway strategy with the name `name`, from the plan function `plan` and the options `options`. */
function variant<O extends object>(name: string, plan: (input: HighwayInput, o: Readonly<O>) => HighwayPlan, options: O): Strategy<"highway", object> {
  const run = (input: HighwayInput): HighwayPlan => plan(input, options);
  return defineStrategy({ step: "highway", name, describe: `The settings ${JSON.stringify(options)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// Each strategy with the gate `stretch`.
export const kneeStretch = gateStrategy(highwayStrategies.knee as Strategy<"highway", object>, stretchGate);
export const bronchialStretch = gateStrategy(highwayStrategies.bronchial as Strategy<"highway", object>, stretchGate);

// NAT-018: the rule of the weights, with more weight on the ink.
export const kneeWeights = variant("knee-weights", kneePlan, { ...KNEE_DEFAULTS, rule: "weights" as const, ink: 0.75 });

// NAT-019: the splits at the widest gap and by weight, and a longer share.
export const bronchialGap = variant("bronchial-gap", bronchialPlan, { ...BRONCHIAL_DEFAULTS, split: "gap" as const });
export const bronchialWeight = variant("bronchial-weight", bronchialPlan, { ...BRONCHIAL_DEFAULTS, split: "weight" as const });
export const bronchialShare07 = variant("bronchial-s0.7", bronchialPlan, { ...BRONCHIAL_DEFAULTS, share: 0.7 });
