// The plug settings of the screen of BUILD-W5: the plug auction (WILD-003).
// Start: `pnpm screen --step plugs --strategy auction --module scripts/screens/build-w5-plugs.ts`. The baseline is `facing`.
import { AUCTION_DEFAULTS, auctionEnds, type AuctionOptions } from "../../src/plugs/auction/index.ts";
import { defineStrategy, type PlugInput, type PlugPair, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a plug strategy of `auction` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<AuctionOptions>): Strategy<"plugs", object> {
  const o = { ...AUCTION_DEFAULTS, ...options };
  const run = (input: PlugInput): PlugPair[] => auctionEnds(input, o);
  return defineStrategy({ step: "plugs", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run });
}

// WILD-003: more slots, no cost of the crossings, and a double weight of the angle.
export const auctionSlots10 = variant("auction-slots10", { slots: 10 });
export const auctionCross0 = variant("auction-cross0", { crossing: 0 });
export const auctionAngle2 = variant("auction-angle2", { angle: 2 });
