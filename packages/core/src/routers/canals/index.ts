import type { Graph, GroupRule, Result, Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { sharedRouter, type SharedSearch, type Way } from "../shared.ts";
import { byCollection } from "../trunks.ts";

/** The options of the router `canals` (NAT-004: canalization feeder trees to hubs). */
export interface CanalOptions {
  /** The exponent `mu` of the flux in the growth of a conductance, from 1 to 3 in steps of 0.5. A value above 1 gives a tree. The default is 2. */
  readonly mu: number;
  /** The largest number of updates of the conductances, from 30 to 150. The updates stop when the ways do not change for 3 updates. The default is 60. */
  readonly steps: number;
  /** The decay `r` of a conductance, from 0.5 to 2. The default is 1. */
  readonly decay: number;
  /** A hub has this number of edges of one key or more, from 2 to 8. The default is 3. */
  readonly minMembers: number;
}

/** The default options of the router `canals`. */
export const CANAL_DEFAULTS: Readonly<CanalOptions> = Object.freeze({ mu: 2, steps: 60, decay: 1, minMembers: 3 });

/** The declarations of the options of the router `canals` (NAT-004). */
export const CANAL_SCHEMA: OptionSchema<CanalOptions> = {
  mu: { type: "number", min: 1, max: 3, step: 0.5, marks: [1, 2, 3], default: 2, describe: "The exponent of the flux in the growth of a conductance. A value above 1 gives a tree." },
  steps: { type: "integer", min: 30, max: 150, step: 10, marks: [30, 60, 150], default: 60, describe: "The largest number of updates of the conductances." },
  decay: { type: "number", min: 0.5, max: 2, step: 0.25, marks: [0.5, 1, 2], default: 1, describe: "The decay of a conductance." },
  minMembers: { type: "integer", min: 2, max: 8, step: 1, marks: [2, 3, 5, 8], default: 3, describe: "A hub has this number of edges of one key or more." },
};

/** The time step of one update of the conductances. */
const DT = 0.5;

/** The gain of a conductance in the cost of a link: a link with the conductance `D` costs `d / (1 + GAIN × D)`. */
const GAIN = 4;

/** The cost share of a link that another way of the key uses, as the default `discount` of `shared`. */
const SHARE = 0.5;

/** The updates with no change of a way, after which the updates stop. */
const PATIENCE = 3;

/**
 * This function gives `x^mu` for `x` from 0 to 1 and `mu` in steps of 0.5, with only `*` and `Math.sqrt`.
 * These operations are exact to the last bit on each platform, so a decision does not depend on the engine.
 */
export function halfPower(x: number, mu: number): number {
  const twice = Math.max(2, Math.min(6, Math.round(mu * 2)));
  let out = 1;
  for (let i = 0; i < Math.floor(twice / 2); i++) out *= x;
  return twice % 2 === 1 ? out * Math.sqrt(x) : out;
}

/** A hub: a node, the key of its edges, and the ways of those edges. */
export interface CanalHub {
  readonly node: string;
  readonly key: string;
  readonly ways: readonly Way[];
}

/**
 * This function gives the hubs of the ways. In each key, the node with the most ends is a hub when it has `minMembers` edges or more.
 * Its edges leave the key, and the next hub of the key comes from the edges that stay. A tie goes to the smaller node id.
 * An edge with no key is in no hub.
 */
export function canalHubs(ways: readonly Way[], minMembers: number): CanalHub[] {
  const byKey = new Map<string, Way[]>();
  for (const w of ways) {
    if (!w.found || w.ids.length < 2 || w.key.startsWith("\u0000")) continue;
    const list = byKey.get(w.key);
    if (list) list.push(w);
    else byKey.set(w.key, [w]);
  }
  const out: CanalHub[] = [];
  for (const key of [...byKey.keys()].sort()) {
    let left = byKey.get(key)!;
    for (;;) {
      const count = new Map<string, number>();
      for (const w of left) for (const n of new Set([w.edge.source.node, w.edge.target.node])) count.set(n, (count.get(n) ?? 0) + 1);
      let node: string | undefined;
      let most = 0;
      for (const [n, c] of count) if (c > most || (c === most && node !== undefined && n < node)) [node, most] = [n, c];
      if (node === undefined || most < Math.max(2, minMembers)) break;
      const hub = node;
      const members = left.filter((w) => w.edge.source.node === hub || w.edge.target.node === hub);
      out.push({ node: hub, key, ways: [...members].sort((a, b) => (a.edge.id < b.edge.id ? -1 : a.edge.id > b.edge.id ? 1 : 0)) });
      left = left.filter((w) => !members.includes(w));
    }
  }
  return out;
}

/**
 * This function grows a feeder tree to each hub (NAT-004, after the canalization of Sachs 1981 and Mitchison 1980).
 * Each member edge is a source of one unit of flux, and the hub is the sink. The flux of a link is the share of the members whose ways use it.
 * At each update, each conductance changes by `DT × (flux^mu - decay × D)`, and each member finds its way again with the cost `d / (1 + GAIN × D)`.
 * A link that another way of the key uses costs half, as in `shared`.
 * With `mu` above 1, a link with more flux grows faster, so the ways gather into one tree. The updates stop after `steps`, or when no way changes for 3 updates.
 */
export function canalWays(ways: readonly Way[], search: SharedSearch, options: Partial<CanalOptions> = {}): void {
  const o = { ...CANAL_DEFAULTS, ...options };
  const n = search.corners;
  const linksOf = (w: Way): number[] => {
    const out = new Set<number>();
    for (let i = 1; i < w.ids.length; i++) if (w.ids[i - 1]! < n && w.ids[i]! < n) out.add(search.link(w.ids[i - 1]!, w.ids[i]!));
    return [...out];
  };
  // The number of ways of each key on each link, so a link that another way of the key uses keeps the share of `shared`.
  const usage = new Map<string, Map<number, number>>();
  const use = (w: Way, add: number): void => {
    let m = usage.get(w.key);
    if (!m) usage.set(w.key, (m = new Map()));
    for (const k of linksOf(w)) m.set(k, (m.get(k) ?? 0) + add);
  };
  for (const w of ways) if (w.found) use(w, 1);
  for (const hub of canalHubs(ways, Math.floor(o.minMembers))) {
    const members = hub.ways;
    const used = usage.get(hub.key)!;
    const conductance = new Map<number, number>();
    let calm = 0;
    for (let step = 0; step < Math.max(1, Math.floor(o.steps)); step++) {
      const flux = new Map<number, number>();
      for (const w of members) {
        const seen = new Set<number>();
        for (let i = 1; i < w.ids.length; i++) {
          const a = w.ids[i - 1]!;
          const b = w.ids[i]!;
          if (a >= n || b >= n) continue;
          const k = search.link(a, b);
          if (seen.has(k)) continue;
          seen.add(k);
          flux.set(k, (flux.get(k) ?? 0) + 1);
        }
      }
      for (const k of new Set([...conductance.keys(), ...flux.keys()])) {
        const phi = (flux.get(k) ?? 0) / members.length;
        const d = conductance.get(k) ?? 0;
        const next = d + DT * (halfPower(phi, o.mu) - o.decay * d);
        if (next > 1e-6) conductance.set(k, next);
        else conductance.delete(k);
      }
      let top = 0;
      for (const d of conductance.values()) top = Math.max(top, d);
      const floor = SHARE / (1 + GAIN * top);
      let changed = 0;
      for (const w of members) {
        use(w, -1);
        const next = search.find(
          w,
          (i, j, d) => {
            const k = search.link(i, j);
            return ((used.get(k) ?? 0) > 0 ? SHARE * d : d) / (1 + GAIN * (conductance.get(k) ?? 0));
          },
          floor,
        );
        if (next) {
          if (next.ids.length !== w.ids.length || next.ids.some((id, i) => id !== w.ids[i])) changed++;
          w.seq = next.seq;
          w.ids = next.ids;
        }
        use(w, 1);
      }
      calm = changed === 0 ? calm + 1 : 0;
      if (calm >= PATIENCE) break;
    }
  }
}

/**
 * This function makes the router `canals` (NAT-004). It is the router `shared`, then the feeder trees of `canalWays` to the hubs of each key.
 * The runs and the bundles come from the ways after the trees.
 */
export function canalRouter(options: Partial<CanalOptions> & { readonly name: string; readonly rule?: GroupRule; readonly maxNodes?: number }): Router {
  const o = { ...CANAL_DEFAULTS, ...options };
  return sharedRouter({ name: o.name, ...(o.rule === undefined ? {} : { rule: o.rule }), ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }) }, undefined, {
    refine: (ways, search) => canalWays(ways, search, o),
  });
}

/**
 * The router strategy `canals` (NAT-004), with the rule `byCollection` of `shared`. It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const canalStrategy: Strategy<"router", CanalOptions> = defineStrategy({
  step: "router",
  name: "canals",
  describe: "Canalization feeder trees (NAT-004). The members of a hub are sources of flux, and the links with more flux get cheaper until the ways make one tree.",
  defaults: { ...CANAL_DEFAULTS },
  schema: CANAL_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<CanalOptions>): Result => canalRouter({ ...o, name: "canals", rule: byCollection }).route(graph),
});
