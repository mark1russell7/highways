// The highway settings of the screen of BUILD-W2A: the gates of HWY-046, HWY-047, HWY-048, HWY-049 and HWY-054 after `corridors` and after `shared-ways`.
// Start: `pnpm screen --step highway --module scripts/screens/build-w2a.ts --edits 5 --families small-clustered,dense-groups,hub-chain,many-groups`.
// The baselines are the router `shared` and the plans `corridors` and `shared-ways`. The built-in gates `corridors+<gate>` run with their defaults.
import { ambiguityGate } from "../../src/highways/gates/ambiguity/index.ts";
import { breakEvenGate } from "../../src/highways/gates/breakeven/index.ts";
import { hysteresisGate } from "../../src/highways/gates/hysteresis/index.ts";
import { stableIdGate } from "../../src/highways/gates/ids/index.ts";
import { gateStrategy } from "../../src/highways/gates/model.ts";
import { stretchGate } from "../../src/highways/gates/stretch/index.ts";
import type { HighwayInput } from "../../src/highways/model.ts";
import { highwayStrategies } from "../../src/strategies/builtins.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function gives a copy of a highway strategy with another name and other default options. */
function variant<O extends object>(strategy: Strategy<"highway", O>, name: string, options: Partial<O>): Strategy<"highway", O> {
  const describe = `${strategy.describe} The options are ${JSON.stringify(options)}.`;
  const defaults = { ...strategy.defaults, ...options } as O;
  return defineStrategy<"highway", O>({ step: "highway", name, describe, defaults, ...(strategy.schema ? { schema: strategy.schema } : {}), maxNodes: 10_000, run: (input: HighwayInput, o: Readonly<O>) => strategy.run(input, o) });
}

const corridors = highwayStrategies.corridors;
const sharedWays = highwayStrategies["shared-ways"];

// HWY-047: the break-even law with one line for a shared stretch (the ink of B1), and after `shared-ways`.
export const corridorsBreakEven0 = variant(gateStrategy(corridors, breakEvenGate), "corridors+breakeven-a0", { shareAlpha: 0 });
export const sharedWaysBreakEven = gateStrategy(sharedWays, breakEvenGate);
export const sharedWaysBreakEven0 = variant(gateStrategy(sharedWays, breakEvenGate), "shared-ways+breakeven-a0", { shareAlpha: 0 });

// HWY-048: the stretch budget 1.1 and 1.5, and after `shared-ways`.
export const corridorsStretch11 = variant(gateStrategy(corridors, stretchGate), "corridors+stretch-1.1", { budget: 1.1 });
export const corridorsStretch15 = variant(gateStrategy(corridors, stretchGate), "corridors+stretch-1.5", { budget: 1.5 });
export const sharedWaysStretch = gateStrategy(sharedWays, stretchGate);

// HWY-049: the ambiguity guard without the node rule, with a lower limit, and after `shared-ways`.
export const corridorsAmbiguityAny = variant(gateStrategy(corridors, ambiguityGate), "corridors+ambiguity-any", { link: "any" });
export const corridorsAmbiguity03 = variant(gateStrategy(corridors, ambiguityGate), "corridors+ambiguity-0.3", { maxAmbiguity: 0.3 });
export const sharedWaysAmbiguity = gateStrategy(sharedWays, ambiguityGate);

// HWY-046: the control without memory (`minSize` 3), a wider band, and after `shared-ways`.
export const corridorsMin3 = variant(corridors, "corridors-min3", { minSize: 3 });
export const corridorsHysteresis42 = variant(gateStrategy(corridors, hysteresisGate), "corridors+hysteresis-4-2", { kOn: 4, kOff: 2 });
export const sharedWaysHysteresis = gateStrategy(sharedWays, hysteresisGate);

// HWY-054: the stable ids after `shared-ways`.
export const sharedWaysIds = gateStrategy(sharedWays, stableIdGate);

// Two gates in a row: the stretch budget, then the break-even law.
export const corridorsStretchBreakEven = gateStrategy(gateStrategy(corridors, stretchGate), breakEvenGate);
