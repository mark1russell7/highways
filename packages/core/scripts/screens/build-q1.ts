// The highway settings of the screen of BUILD-Q1: the corridor signatures of HWY-031 (with WILD-030), the strategy `corridors`.
// The built-in strategies `corridors` and `corridors+stretch` are the idea alone and with the gate `stretch`.
// This module adds the settings of the params of the record: the near links within one lane, the shares 0.1 and 0.6, the size 3,
// the lane gap 2 and a signature with 128 hashes in 16 bands. The near links also run with the gate `stretch`.
// Start: `pnpm screen --step highway --strategy corridors,corridors+stretch --module scripts/screens/build-q1.ts`.
import { gateStrategy } from "../../src/highways/gates/model.ts";
import { stretchGate } from "../../src/highways/gates/stretch/index.ts";
import { CORRIDOR_DEFAULTS, corridorPlan, type CorridorOptions } from "../../src/highways/corridors/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a highway strategy with the name `name`: the plan of `corridors` with the changes `o` of its defaults. */
function corridors(name: string, o: Partial<CorridorOptions>): Strategy<"highway", object> {
  const options: CorridorOptions = { ...CORRIDOR_DEFAULTS, ...o };
  const run = (input: HighwayInput): HighwayPlan => corridorPlan(input, options);
  return defineStrategy({ step: "highway", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

// The near links of the record: two link ends within one lane (the grid of the lane gap 4) are one point.
export const corridorsNear4 = corridors("corridors-near4", { near: 4 });
export const corridorsNear4Stretch = gateStrategy(corridorsNear4, stretchGate);

// The share `rho` at the ends of its range of the record, and the smallest highway of 3 edges.
export const corridorsRho01 = corridors("corridors-rho0.1", { rho: 0.1 });
export const corridorsRho06 = corridors("corridors-rho0.6", { rho: 0.6 });
export const corridorsMin3 = corridors("corridors-min3", { minSize: 3 });

// A lower break-even floor (lane gap 2), and a signature with more rows in each band (fewer candidate pairs).
export const corridorsLane2 = corridors("corridors-lane2", { lane: 2 });
export const corridorsH128B16 = corridors("corridors-h128b16", { hashes: 128, bands: 16 });
