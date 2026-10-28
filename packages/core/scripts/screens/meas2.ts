// The settings of the gap screen of MEAS2: each built highway strategy and each option of waves 1 to 3, kept and dropped, on the set `exact-v1`.
// Each strategy here is a router, so that one screen gives the gap closed of all of them. The screen adds the built-in routers.
// A built-in highway strategy has the name `hw:<name>`, and an option of a wave has the name `<wave>:<name>`, because two waves use the name `quickbundles-t6`.
// The exact strategies of W3B are not here: they are the reference.
// Start: `pnpm screen --step router --set exact-v1 --module scripts/screens/meas2.ts`. Start it only in CI, with the workflow `Screen`.
import { sharedWaysAll } from "../../src/bench/screen/gap.ts";
import { highwayRouterStrategy } from "../../src/highways/router.ts";
import { highwayStrategies } from "../../src/strategies/builtins.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";
import * as w1b from "./build-w1b.ts";
import * as w1c from "./build-w1c.ts";
import * as w2a from "./build-w2a.ts";
import * as w2b from "./build-w2b.ts";
import * as w2c from "./build-w2c.ts";
import * as w3a from "./build-w3a.ts";
import * as w3b from "./build-w3b.ts";
import * as w3bRouter from "./build-w3b-router.ts";
import * as w3c from "./build-w3c.ts";
import * as w3d from "./build-w3d.ts";

type AnyOf = Strategy<"highway", object> | Strategy<"router", object>;

/** This function tells if a value is a strategy of the step `highway` or `router`. */
function isStrategy(value: unknown): value is AnyOf {
  const s = value as { step?: unknown; name?: unknown; run?: unknown };
  return typeof s === "object" && s !== null && (s.step === "highway" || s.step === "router") && typeof s.name === "string" && typeof s.run === "function";
}

/** This function gives a strategy as a router strategy with the name `name`. A highway strategy routes along its plan with `follow`. */
function asRouterStrategy(s: AnyOf, name: string): Strategy<"router", object> {
  const router = s.step === "highway" ? highwayRouterStrategy(s as Strategy<"highway", object>) : (s as Strategy<"router", object>);
  return defineStrategy({
    step: "router",
    name,
    describe: router.describe,
    defaults: router.defaults,
    ...(router.schema === undefined ? {} : { schema: router.schema }),
    ...(router.maxNodes === undefined ? {} : { maxNodes: router.maxNodes }),
    run: router.run,
  });
}

const waves: Readonly<Record<string, Record<string, unknown>>> = { w1b, w1c, w2a, w2b, w2c, w3a, w3b, w3bRouter, w3c, w3d };

/** The strategies of the gap screen: the built-in highway strategies, `shared-ways-all`, and the options of each wave. */
export const strategies: readonly Strategy<"router", object>[] = [
  ...Object.entries(highwayStrategies).map(([name, s]) => asRouterStrategy(s as AnyOf, `hw:${name}`)),
  asRouterStrategy(sharedWaysAll, "hw:shared-ways-all"),
  ...Object.entries(waves).flatMap(([wave, mod]) =>
    Object.values(mod)
      .filter(isStrategy)
      .map((s) => (s.step === "router" ? (s as Strategy<"router", object>) : asRouterStrategy(s, `${wave}:${s.name}`))),
  ),
].filter((s, i, all) => all.findIndex((t) => t.name === s.name) === i);
