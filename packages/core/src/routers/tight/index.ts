import { byText } from "../../compare.ts";
import { dist, polylineLength } from "../../geom.ts";
import type { Graph, GroupRule, Result, Router } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import { sharedRouter, type SharedSearch, type Way } from "../shared.ts";
import { byCollection } from "../trunks.ts";

/** The edges that go first: the edges with few good ways (`tight`), or the edges with many good ways (`loose`). */
export type TightFirst = "tight" | "loose";

/** The values of `TightFirst`. */
export const TIGHT_FIRSTS: readonly TightFirst[] = Object.freeze(["tight", "loose"]);

/** The order of two edges with the same slack: by the edge id, or the longer edge first. */
export type TightTies = "id" | "length";

/** The values of `TightTies`. */
export const TIGHT_TIES: readonly TightTies[] = Object.freeze(["id", "length"]);

/** The options of the router `tight` (WILD-023: tight edges first, after list scheduling by slack). */
export interface TightOptions {
  /** The cost factor of the links of the first way in the search of the second way, from 2 to 10. The default is 3. */
  readonly penalty: number;
  /**
   * The edges that go first. With `tight`, the default, an edge whose second way costs much more than its first way goes first.
   * With `loose`, the order turns around: the formula of the record, with the rising slack.
   */
  readonly first: TightFirst;
  /** The order of two edges with the same slack. The default is `length`: the longer edge first, as in `shared`. */
  readonly ties: TightTies;
}

/** The default options of the router `tight`. */
export const TIGHT_DEFAULTS: Readonly<TightOptions> = Object.freeze({ penalty: 3, first: "tight", ties: "length" });

/** The declarations of the options of the router `tight` (WILD-023). */
export const TIGHT_SCHEMA: OptionSchema<TightOptions> = {
  penalty: { type: "number", min: 2, max: 10, step: 0.5, marks: [2, 3, 5], default: 3, describe: "The cost factor of the links of the first way in the search of the second way." },
  first: { type: "enum", values: ["tight", "loose"], default: "tight", describe: "The edges that go first: the edges with few good ways, or the edges with many good ways." },
  ties: { type: "enum", values: ["id", "length"], default: "length", describe: "The order of two edges with the same slack: by the edge id, or the longer edge first." },
};

/**
 * This function gives the slack of each way (WILD-023): `L2 / L1 - 1`. `L1` is the length of the shortest way.
 * `L2` is the cost of the shortest way when each link of the first way costs `penalty` times its length.
 * A way with no second way has the slack `penalty - 1`. A way with a second way of near-equal length has a slack near 0.
 */
export function waySlacks(ways: readonly Way[], search: SharedSearch, penalty: number): Map<Way, number> {
  const out = new Map<Way, number>();
  const n = search.corners;
  for (const w of ways) {
    const first = search.find(w);
    if (!first) {
      out.set(w, 0);
      continue;
    }
    const l1 = polylineLength(first.seq);
    const own = new Set<number>();
    for (let i = 1; i < first.ids.length; i++) {
      const a = first.ids[i - 1]!;
      const b = first.ids[i]!;
      if (a < n && b < n) own.add(search.link(a, b));
    }
    const cost = (i: number, j: number, d: number): number => (own.has(search.link(i, j)) ? d * penalty : d);
    const second = search.find(w, cost, 1);
    let l2 = l1;
    if (second) {
      l2 = 0;
      for (let i = 1; i < second.ids.length; i++) {
        const a = second.ids[i - 1]!;
        const b = second.ids[i]!;
        const d = dist(second.seq[i - 1]!, second.seq[i]!);
        l2 += a < n && b < n ? cost(a, b, d) : d;
      }
    }
    out.set(w, l1 > 1e-9 ? l2 / l1 - 1 : 0);
  }
  return out;
}

/**
 * This function makes the router `tight` (WILD-023). It is the router `shared` with another order of the edges of each key.
 * With `first: tight`, the edges with the largest slack value go first: their second way costs much more, so they have few good ways.
 * The edges with many ways of near-equal cost go last. The keys keep the order of `shared`.
 */
export function tightRouter(options: Partial<TightOptions> & { readonly name: string; readonly rule?: GroupRule; readonly maxNodes?: number }): Router {
  const o = { ...TIGHT_DEFAULTS, ...options };
  const penalty = Math.min(10, Math.max(1, o.penalty));
  const sign = o.first === "loose" ? 1 : -1;
  return sharedRouter(
    { name: o.name, ...(o.rule === undefined ? {} : { rule: o.rule }), ...(o.maxNodes === undefined ? {} : { maxNodes: o.maxNodes }) },
    undefined,
    {
      order: (ways, search) => {
        const slack = waySlacks(ways, search, penalty);
        const span = (w: Way): number => dist(w.ps.point, w.pt.point);
        return [...ways].sort(
          (p, q) =>
            byText(p.key, q.key) ||
            sign * (slack.get(p)! - slack.get(q)!) ||
            (o.ties === "length" ? span(q) - span(p) : 0) ||
            byText(p.edge.id, q.edge.id),
        );
      },
    },
  );
}

/**
 * The router strategy `tight` (WILD-023), with the rule `byCollection` of `shared`. It is not a built-in router, so the benchmark and the hashes of `ROUTERS` do not change.
 * A screen module or a consumer adds it to a registry.
 */
export const tightStrategy: Strategy<"router", TightOptions> = defineStrategy({
  step: "router",
  name: "tight",
  describe: "Tight edges first (WILD-023). The router `shared` routes first the edges whose second way costs much more than their first way.",
  defaults: { ...TIGHT_DEFAULTS },
  schema: TIGHT_SCHEMA,
  maxNodes: 10_000,
  run: (graph: Graph, o: Readonly<TightOptions>): Result => tightRouter({ ...o, name: "tight", rule: byCollection }).route(graph),
});
