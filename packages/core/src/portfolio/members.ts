// The members of the portfolio router (PORTFOLIO-API). Each member is a router strategy with the name of its records in the gap screen.
// A built-in highway strategy has the name `hw:<name>`, and an option of an idea wave has the name `<wave>:<name>`. A router option has its own name.
// The test `members.test.ts` checks that each member gives the same output hash as the strategy of the same name in the screen module of MEAS2.
import { ambiguityGate } from "../highways/gates/ambiguity/index.ts";
import { breakEvenGate } from "../highways/gates/breakeven/index.ts";
import { gateStrategy } from "../highways/gates/model.ts";
import { stretchGate } from "../highways/gates/stretch/index.ts";
import type { HighwayInput, HighwayPlan } from "../highways/model.ts";
import { highwayRouterStrategy } from "../highways/router.ts";
import type { Graph, Result } from "../model.ts";
import { cornersRouter, type CornersOptions } from "../routers/corners.ts";
import { sharedRouter, type SharedOptions } from "../routers/shared.ts";
import { byCollection, trunksRouter, type TrunksOptions } from "../routers/trunks.ts";
import { highwayStrategies } from "../strategies/builtins.ts";
import { defineStrategy, type Strategy } from "../strategies/model.ts";
import { sharedWaysAll } from "../bench/screen/gap.ts";

/** The name of a built-in highway strategy. */
type HighwayName = keyof typeof highwayStrategies;

/**
 * The form of one member:
 * - `["shared", options]`, `["trunks", options]` or `["corners", options]`: the router with the options. `shared` and `trunks` use the rule `byCollection`.
 * - `["highway", name]`: the built-in highway strategy `name`, or `shared-ways-all`, with `follow`.
 * - `["gate", name, gate, budget?]`: the built-in highway strategy with the gate `stretch`, `breakeven` or `ambiguity`. `budget` sets the budget of the gate `stretch`.
 * - `["plan", name, options]`: the plan of the built-in highway strategy `name` with other options.
 */
export type MemberForm =
  | readonly ["shared", Omit<SharedOptions, "name" | "rule">]
  | readonly ["trunks", Omit<TrunksOptions, "name" | "rule">]
  | readonly ["corners", Omit<CornersOptions, "name">]
  | readonly ["highway", HighwayName | "shared-ways-all"]
  | readonly ["gate", HighwayName, "stretch" | "breakeven" | "ambiguity", number?]
  | readonly ["plan", HighwayName, Readonly<Record<string, unknown>>];

/** The forms of the members, by the names of the records. `shared` is the base. The greedy sets of `sets.ts` name only these members. */
export const MEMBER_FORMS: Readonly<Record<string, MemberForm>> = {
  shared: ["shared", {}],
  "corners-side": ["corners", { plugs: "side" }],
  "shared-flow-a06-p3": ["shared", { cost: "flow", alpha: 0.6, passes: 3 }],
  "shared-order-shortest": ["shared", { order: "shortest" }],
  "shared-p2": ["shared", { passes: 2 }],
  "shared-p3": ["shared", { passes: 3 }],
  "shared-wind-p2-r0.5": ["shared", { passes: 2, reuse: 0.5 }],
  "shared-wind-p2-r1": ["shared", { passes: 2, reuse: 1 }],
  "shared-wind-p2-r1-e2": ["shared", { passes: 2, reuse: 1, reuseExponent: 2 }],
  "shared-wind-p2-r2": ["shared", { passes: 2, reuse: 2 }],
  "shared-wind-p3-r1": ["shared", { passes: 3, reuse: 1 }],
  "trunks-gilbert-a03": ["trunks", { splitAt: "gilbert", alpha: 0.3 }],
  "trunks-gilbert-a05": ["trunks", { splitAt: "gilbert", alpha: 0.5 }],
  "trunks-gilbert-a07": ["trunks", { splitAt: "gilbert", alpha: 0.7 }],
  "trunks-tree-bf02": ["trunks", { fan: "tree", bf: 0.2 }],
  "trunks-tree-bf06": ["trunks", { fan: "tree", bf: 0.6 }],
  "trunks-tree-bf08": ["trunks", { fan: "tree", bf: 0.8 }],
  "hw:crossbars": ["highway", "crossbars"],
  "hw:cubu": ["highway", "cubu"],
  "hw:diffusion": ["highway", "diffusion"],
  "hw:growth": ["highway", "growth"],
  "hw:lanes": ["highway", "lanes"],
  "hw:level-links": ["highway", "level-links"],
  "hw:mesh": ["highway", "mesh"],
  "hw:mlseb": ["highway", "mlseb"],
  "hw:p-hub": ["highway", "p-hub"],
  "hw:shared-ways-all": ["highway", "shared-ways-all"],
  "hw:spiral": ["highway", "spiral"],
  "hw:stubs": ["highway", "stubs"],
  "hw:weiszfeld": ["highway", "weiszfeld"],
  "hw:zipper": ["highway", "zipper"],
  "hw:areas": ["highway", "areas"],
  "w2a:shared-ways+ambiguity": ["gate", "shared-ways", "ambiguity"],
  "w2a:shared-ways+breakeven": ["gate", "shared-ways", "breakeven"],
  "w2a:shared-ways+stretch": ["gate", "shared-ways", "stretch"],
  "w2b:weiszfeld-a0": ["plan", "weiszfeld", { alpha: 0 }],
  "w2b:weiszfeld-a1": ["plan", "weiszfeld", { alpha: 1 }],
  "w2b:zipper-a1": ["plan", "zipper", { adhesion: 1 }],
  "w2b:zipper-p2": ["plan", "zipper", { passes: 2 }],
  "w2c:level-links+stretch": ["gate", "level-links", "stretch"],
  "w2c:level-links+stretch-b1.1": ["gate", "level-links", "stretch", 1.1],
  "w2c:road-classes-d0.3": ["plan", "road-classes", { discount: 0.3 }],
  "w2c:select+stretch": ["gate", "select", "stretch"],
  "w2c:zipper+stretch-b1.1": ["gate", "zipper", "stretch", 1.1],
  "w3a:diffusion+stretch": ["gate", "diffusion", "stretch"],
  "w3a:diffusion-g2": ["plan", "diffusion", { gamma: 2 }],
  "w3a:diffusion-l3": ["plan", "diffusion", { lambda: 3 }],
  "w3a:diffusion-wide": ["plan", "diffusion", { a: 0.5, steps: 6 }],
  "w3a:spiral-a15": ["plan", "spiral", { alpha: 15 }],
  "w3a:spiral-a35": ["plan", "spiral", { alpha: 35 }],
  "w3a:spiral-n3": ["plan", "spiral", { minTargets: 3 }],
  "w3b:growth-input": ["plan", "growth", { order: "input" }],
  "w3b:growth-s0.3": ["plan", "growth", { share: 0.3 }],
  "w3b:growth-s0.7": ["plan", "growth", { share: 0.7 }],
  "w3b:growth-t1.2": ["plan", "growth", { stretch: 1.2 }],
  "w3c:edge-paths-k1.5": ["plan", "edge-paths", { distortion: 1.5 }],
  "w3c:hdbscan+stretch": ["gate", "hdbscan", "stretch"],
  "w3c:hough-wide": ["plan", "hough", { dTheta: 12, dRho: 24 }],
  "w3d:cubu+stretch": ["gate", "cubu", "stretch"],
  "w3d:kdeeb+stretch": ["gate", "kdeeb", "stretch"],
  "w3d:kdeeb-nomask": ["plan", "kdeeb", { mask: false }],
  "w3d:kdeeb-routes": ["plan", "kdeeb", { source: "routes" }],
  "w3d:mesh+stretch": ["gate", "mesh", "stretch"],
  "w3e:areas-keys": ["plan", "areas", { group: "keys" }],
  "w3e:confluent+stretch": ["gate", "confluent", "stretch"],
  "w3e:crossbars+stretch": ["gate", "crossbars", "stretch"],
  "w3e:frechet+stretch": ["gate", "frechet", "stretch"],
  "w3e:frechet-e0.5": ["plan", "frechet", { eps: 0.5 }],
  "w3e:mlseb+stretch": ["gate", "mlseb", "stretch"],
  "w3e:mlseb-a0": ["plan", "mlseb", { angleWeight: 0 }],
  "w3e:mlseb-parabola": ["plan", "mlseb", { fit: "parabola" }],
  "w3e:mlseb-routes": ["plan", "mlseb", { source: "routes" }],
  "w3f:p-hub-a0.2": ["plan", "p-hub", { alpha: 0.2 }],
  "w3f:spectral-c0.3": ["plan", "spectral", { c0: 0.3 }],
  "w3f:territories-r2": ["plan", "territories", { radius: 2 }],
};

const GATES = { stretch: stretchGate, breakeven: breakEvenGate, ambiguity: ambiguityGate } as const;

/** This function gives a highway strategy with no options: it runs `run`. As in the screen, `follow` then gets no way options. */
function fixedHighway(name: string, run: (input: HighwayInput) => HighwayPlan): Strategy<"highway", object> {
  return defineStrategy({ step: "highway", name, describe: `The member ${name} of the portfolio router.`, defaults: {}, schema: {}, maxNodes: 10_000, run });
}

/** This function gives a router strategy with no options: it runs `route`. */
function fixedRouter(name: string, route: (graph: Graph) => Result): Strategy<"router", object> {
  return defineStrategy({ step: "router", name, describe: `The member ${name} of the portfolio router.`, defaults: {}, schema: {}, maxNodes: 10_000, run: (graph: Graph) => route(graph) });
}

/** This function gives the router strategy of a member form, with the name `name`. */
export function memberStrategy(name: string, form: MemberForm): Strategy<"router", object> {
  const highway = (h: Strategy<"highway", object>): Strategy<"router", object> => {
    const r = highwayRouterStrategy(h);
    return defineStrategy({ step: "router", name, describe: r.describe, defaults: r.defaults, ...(r.schema === undefined ? {} : { schema: r.schema }), maxNodes: r.maxNodes ?? 10_000, run: r.run });
  };
  switch (form[0]) {
    case "shared": {
      const o = form[1];
      return fixedRouter(name, (g) => sharedRouter({ ...o, rule: byCollection, name }).route(g));
    }
    case "trunks": {
      const o = form[1];
      return fixedRouter(name, (g) => trunksRouter({ ...o, rule: byCollection, name }).route(g));
    }
    case "corners": {
      const o = form[1];
      return fixedRouter(name, (g) => cornersRouter({ ...o, name }).route(g));
    }
    case "highway":
      return highway(form[1] === "shared-ways-all" ? sharedWaysAll : (highwayStrategies[form[1]] as Strategy<"highway", object>));
    case "gate": {
      const gated = gateStrategy(highwayStrategies[form[1]] as Strategy<"highway", object>, GATES[form[2]] as Parameters<typeof gateStrategy>[1]);
      const budget = form[3];
      if (budget === undefined) return highway(gated);
      const options = { ...gated.defaults, budget };
      return highway(fixedHighway(name, (input) => gated.run(input, options)));
    }
    case "plan": {
      const base = highwayStrategies[form[1]] as Strategy<"highway", object>;
      const options = { ...base.defaults, ...form[2] };
      return highway(fixedHighway(name, (input) => base.run(input, options)));
    }
  }
}

const cache = new Map<string, Strategy<"router", object>>();

/** This function gives the member with the name `name`, or `undefined` for a name without a form in `MEMBER_FORMS`. */
export function portfolioMember(name: string): Strategy<"router", object> | undefined {
  const form = MEMBER_FORMS[name];
  if (form === undefined) return undefined;
  if (!cache.has(name)) cache.set(name, memberStrategy(name, form));
  return cache.get(name);
}
