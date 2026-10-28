// The settings of the screen of ACTIVATION: the strategies of the gap screen of MEAS2 (`meas2.ts`), the options of BUILD-W3F, and the empty plan `hw:none`.
// Each record gets its output hash, and each highway finder gets the count of its own move. The activation report tells which candidates did not run.
// The base of a highway finder is `hw:none`: `follow` of the empty plan, the routes of `corners`. `activationBase` gives the base of each other strategy.
// Start: `pnpm screen --step router --module scripts/screens/activation.ts --activation small-clustered,dense-groups,hub-chain,many-groups`.
// Start it only in CI, with the workflow `Screen`.
import { highwayMoves } from "../../src/bench/screen/exercise.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";
import * as w3f from "./build-w3f.ts";
import { asRouterStrategy, highwaysByName, isStrategy, strategies as meas2 } from "./meas2.ts";

/** The empty plan: each edge goes as in the router `corners`. It is the base of each highway finder. */
const none = defineStrategy({ step: "highway", name: "none", describe: "The empty plan.", defaults: {}, schema: {}, maxNodes: 10_000, run: () => ({ highways: [] }) });

const w3fHighways = Object.values(w3f as Record<string, unknown>)
  .filter(isStrategy)
  .filter((s): s is Strategy<"highway", object> => s.step === "highway");

/** The highway strategies of the screen, by the names of the records. */
const highways: Readonly<Record<string, Strategy<"highway", object>>> = {
  ...highwaysByName,
  "hw:none": none as Strategy<"highway", object>,
  ...Object.fromEntries(w3fHighways.map((s) => [`w3f:${s.name}`, s] as const)),
};

/** The strategies of the screen: the strategies of MEAS2, the options of W3F and `hw:none`. */
export const strategies: readonly Strategy<"router", object>[] = [
  ...meas2,
  asRouterStrategy(none as Strategy<"highway", object>, "hw:none"),
  ...w3fHighways.map((s) => asRouterStrategy(s, `w3f:${s.name}`)),
].filter((s, i, all) => all.findIndex((t) => t.name === s.name) === i);

/** The own move counts of each highway finder of the screen. */
export const moves = highwayMoves(highways);
