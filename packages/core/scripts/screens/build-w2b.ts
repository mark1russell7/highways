// The highway settings of the screen of BUILD-W2B: meet points (HWY-050), Weiszfeld meeting points (HWY-043), stubs (HWY-015),
// the axon zipper (NAT-022) and level links as highways (HWY-056), on the plans `shared-ways`, `corridors` and `none`.
// Start: `pnpm screen --step highway --module scripts/screens/build-w2b.ts`. The baselines are the router `shared` and the strategies `shared-ways` and `corridors`.
import { LEVEL_HIGHWAY_DEFAULTS, levelHighwayPlan, type LevelHighwayOptions } from "../../src/highways/level-links/index.ts";
import { MEET_DEFAULTS, meetPlan, type MeetOptions } from "../../src/highways/meet/index.ts";
import type { HighwayInput, HighwayPlan } from "../../src/highways/model.ts";
import { STUB_DEFAULTS, stubPlan, type StubOptions } from "../../src/highways/stubs/index.ts";
import { WEISZFELD_DEFAULTS, weiszfeldPlan, type WeiszfeldOptions } from "../../src/highways/weiszfeld/index.ts";
import { ZIPPER_DEFAULTS, zipperPlan, type ZipperOptions } from "../../src/highways/zipper/index.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a highway strategy with the name `name`, from the plan function `plan` and the options `options`. */
function variant<O extends object>(name: string, plan: (input: HighwayInput, o: Readonly<O>) => HighwayPlan, options: O): Strategy<"highway", object> {
  const run = (input: HighwayInput): HighwayPlan => plan(input, options);
  return defineStrategy({ step: "highway", name, describe: `The settings ${JSON.stringify(options)}.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

const meet = (name: string, o: Partial<MeetOptions>) => variant(name, meetPlan, { ...MEET_DEFAULTS, ...o });
const weiszfeld = (name: string, o: Partial<WeiszfeldOptions>) => variant(name, weiszfeldPlan, { ...WEISZFELD_DEFAULTS, ...o });
const stubs = (name: string, o: Partial<StubOptions>) => variant(name, stubPlan, { ...STUB_DEFAULTS, ...o });
const zipper = (name: string, o: Partial<ZipperOptions>) => variant(name, zipperPlan, { ...ZIPPER_DEFAULTS, ...o });
const levels = (name: string, o: Partial<LevelHighwayOptions>) => variant(name, levelHighwayPlan, { ...LEVEL_HIGHWAY_DEFAULTS, ...o });

// HWY-050: the meet points on the corridors, and a smaller and a larger distance.
export const meetCorridors = meet("meet-corridors", { from: "corridors" });
export const meetNear4 = meet("meet-near4", { near: 4 });
export const meetNear16 = meet("meet-near16", { near: 16 });

// HWY-043: the Weiszfeld meeting points on the corridors, and the weights of the trunk at the two ends.
export const weiszfeldCorridors = weiszfeld("weiszfeld-corridors", { from: "corridors" });
export const weiszfeldAlpha0 = weiszfeld("weiszfeld-a0", { alpha: 0 });
export const weiszfeldAlpha1 = weiszfeld("weiszfeld-a1", { alpha: 1 });

// HWY-015 with WILD-005: the stubs on the other plans, at the sources only, and with a smaller window.
export const stubsCorridors = stubs("stubs-corridors", { from: "corridors" });
export const stubsNone = stubs("stubs-none", { from: "none" });
export const stubsSource = stubs("stubs-source", { ends: "source" });
export const stubsOmega15 = stubs("stubs-w15", { omega: 15 });

// NAT-022 with WILD-037: the zipper on the other plans, with more adhesion, a larger distance and two passes.
export const zipperCorridors = zipper("zipper-corridors", { from: "corridors" });
export const zipperNone = zipper("zipper-none", { from: "none" });
export const zipperAdhesion1 = zipper("zipper-a1", { adhesion: 1 });
export const zipperNear2 = zipper("zipper-near2", { near: 2, adhesion: 1 });
export const zipperPasses2 = zipper("zipper-p2", { passes: 2 });

// HWY-056 with WILD-034: the level links on the other plans, and at the level of depth 2.
export const levelsCorridors = levels("level-links-corridors", { from: "corridors" });
export const levelsNone = levels("level-links-none", { from: "none" });
export const levelsDepth2 = levels("level-links-d2", { depth: 2 });
