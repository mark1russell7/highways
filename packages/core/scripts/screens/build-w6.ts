// The highway settings of the screen of BUILD-W6: a savings merge with a fair share (WILD-033), current corridors (NAT-037) and grassfire corridors (NAT-034).
// The module has changes of the options of the strategies.
// Start: `pnpm screen --step highway --strategy savings,current-corridors,grassfire --module scripts/screens/build-w6.ts`. The baseline is `shared`.
import { CURRENT_CORRIDOR_DEFAULTS, currentCorridorPlan, type CurrentCorridorOptions } from "../../src/highways/current-corridors/index.ts";
import { GRASSFIRE_DEFAULTS, grassfirePlan, type GrassfireOptions } from "../../src/highways/grassfire/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { SAVINGS_DEFAULTS, savingsPlan, type SavingsOptions } from "../../src/highways/savings/index.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a highway strategy with the name `name` from the function `run` and the options `o`. */
function variant(name: string, o: object, run: (input: HighwayInput) => HighwayPlan): Strategy<"highway", object> {
  return defineStrategy({ step: "highway", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

const savings = (name: string, options: Partial<SavingsOptions>): Strategy<"highway", object> => {
  const o = { ...SAVINGS_DEFAULTS, ...options };
  return variant(name, o, (input) => savingsPlan(input, o));
};
const current = (name: string, options: Partial<CurrentCorridorOptions>): Strategy<"highway", object> => {
  const o = { ...CURRENT_CORRIDOR_DEFAULTS, ...options };
  return variant(name, o, (input) => currentCorridorPlan(input, o));
};
const fire = (name: string, options: Partial<GrassfireOptions>): Strategy<"highway", object> => {
  const o = { ...GRASSFIRE_DEFAULTS, ...options };
  return variant(name, o, (input) => grassfirePlan(input, o));
};

// WILD-033: shares by length, more pairs, and a short detour cap.
export const savingsLength = savings("savings-length", { share: "length" });
export const savingsP16 = savings("savings-p16", { pairs: 16 });
export const savingsD12 = savings("savings-d12", { detour: 1.2 });

// NAT-037: more corridor links, fewer corridor links, and more seeded solves.
export const currentQ6 = current("current-corridors-q6", { q: 0.6 });
export const currentQ9 = current("current-corridors-q9", { q: 0.9 });
export const currentS32 = current("current-corridors-s32", { sketch: 32 });

// NAT-034: no price near a box, a high price near a box, and longer spurs.
export const fireL0 = fire("grassfire-l0", { lambda: 0 });
export const fireL4 = fire("grassfire-l4", { lambda: 4 });
export const fireS5 = fire("grassfire-s5", { spur: 5 });
