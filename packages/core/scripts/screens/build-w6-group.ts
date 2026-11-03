// The group settings of the screen of BUILD-W6: the termite hubs of NAT-010.
// Start: `pnpm screen --step group --strategy termites,quadtree --module scripts/screens/build-w6-group.ts`. The baseline is `quadtree`.
import { TERMITE_DEFAULTS, termiteGroups, type TermiteOptions } from "../../src/groups/termites/index.ts";
import { defineStrategy, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a group strategy of `termites` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<TermiteOptions>): Strategy<"group", object> {
  const o = { ...TERMITE_DEFAULTS, ...options };
  return defineStrategy({ step: "group", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, run: (graph) => termiteGroups(graph, o) });
}

// NAT-010: a wide spacing of the peaks, a long growth, and larger cells.
export const termitesR8 = variant("termites-r8", { radius: 8 });
export const termitesS100 = variant("termites-s100", { steps: 100 });
export const termitesC2 = variant("termites-c2", { cell: 2 });
