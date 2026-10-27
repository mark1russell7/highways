import { polylineLength } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import type { OptionSchema } from "../../strategies/options.ts";
import type { WayOptions } from "../../ways.ts";
import { follow } from "../follow.ts";
import type { Highway, HighwayInput, HighwayMember, HighwayPlan } from "../model.ts";
import { wayOptionsOf } from "../router.ts";

/**
 * A gate: a rule that keeps, drops or changes the highways of a plan. `gateStrategy` puts a gate after a highway strategy.
 * A gate does not move a spine. It takes members out of a highway, drops a highway or changes the id of a highway.
 */
export interface Gate<G extends object> {
  /** The name of the gate. The strategy of a gate has the name `<strategy>+<gate>`. */
  readonly name: string;
  /** One or two sentences that tell what the gate does. */
  readonly describe: string;
  /** The values of the options of the gate. Their keys must not be keys of the options of the strategy before the gate. */
  readonly defaults: G;
  readonly schema: OptionSchema<G>;
  /** This function gives the plan after the gate. `way` holds the options of the way finder of the strategy. */
  apply(input: HighwayInput, plan: HighwayPlan, options: Readonly<G>, way: WayOptions): HighwayPlan;
}

/**
 * This function puts a gate after a highway strategy. The new strategy has the name `<strategy>+<gate>`, and the options of both.
 * The strategy gets its own options, and the gate gets the plan of the strategy and the options of the gate.
 * Thus a gate can follow each plan, for example `corridors+breakeven` or `shared-ways+stretch`. Gates can follow gates.
 */
export function gateStrategy<O extends object, G extends object>(strategy: Strategy<"highway", O>, gate: Gate<G>): Strategy<"highway", O & G> {
  const keys = Object.keys(gate.defaults);
  for (const k of keys) if (k in strategy.defaults) throw new Error(`The gate "${gate.name}" has the option "${k}", and the strategy "${strategy.name}" has it too.`);
  return defineStrategy<"highway", O & G>({
    step: "highway",
    name: `${strategy.name}+${gate.name}`,
    describe: `${strategy.describe} ${gate.describe}`,
    defaults: { ...strategy.defaults, ...gate.defaults } as O & G,
    schema: { ...(strategy.schema ?? {}), ...gate.schema } as OptionSchema<O & G>,
    ...(strategy.maxNodes === undefined ? {} : { maxNodes: strategy.maxNodes }),
    run: (input: HighwayInput, options: Readonly<O & G>): HighwayPlan => {
      const own: Record<string, unknown> = {};
      const mine: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(options)) (keys.includes(k) ? mine : own)[k] = v;
      return gate.apply(input, strategy.run(input, own as Partial<O>), mine as G, wayOptionsOf(options));
    },
  });
}

/**
 * This function gives the plan with only the members that `keep` accepts. A highway with fewer than two members goes away.
 * The lanes keep their order, and each highway keeps its id, its key and its spine.
 */
export function keepMembers(plan: HighwayPlan, keep: (h: Highway, m: HighwayMember) => boolean): HighwayPlan {
  const highways: Highway[] = [];
  for (const h of plan.highways) {
    const members = h.members.filter((m) => keep(h, m));
    if (members.length < 2) continue;
    if (members.length === h.members.length) {
      highways.push(h);
      continue;
    }
    const stay = new Set(members.map((m) => m.edge));
    highways.push({ ...h, lanes: h.lanes.filter((e) => stay.has(e)), members });
  }
  return { highways };
}

/** The lengths of the route of one edge of a plan. */
export interface EdgeLengths {
  /** The length of the route along the plan, after `follow`. */
  readonly route: number;
  /** The length of the route without a highway: the route of the router `corners`. */
  readonly alone: number;
}

/**
 * This function gives the length of the route of each edge of a plan, along the plan and alone. `follow` routes each edge of a plan on its own.
 * Thus the route of an edge does not change when another edge leaves the plan.
 */
export function edgeLengths(graph: Graph, plan: HighwayPlan, way: WayOptions): Map<string, EdgeLengths> {
  const edges = new Set(plan.highways.flatMap((h) => h.members.map((m) => m.edge)));
  const sub: Graph = { nodes: graph.nodes, edges: graph.edges.filter((e) => edges.has(e.id)) };
  const along = follow(sub, plan, way);
  const alone = follow(sub, { highways: [] }, way);
  const lengthOf = new Map(alone.routes.map((r) => [r.edge, polylineLength(r.points)]));
  return new Map(along.routes.map((r) => [r.edge, { route: polylineLength(r.points), alone: lengthOf.get(r.edge) ?? 0 }]));
}

/** This function gives the ids of the edges that both graphs have. */
export function commonEdges(a: Graph, b: Graph): Set<string> {
  const ids = new Set(b.edges.map((e) => e.id));
  return new Set(a.edges.map((e) => e.id).filter((id) => ids.has(id)));
}

/** This function gives the Jaccard index of two sets of edges: the common edges over all edges. Two empty sets give 0. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let common = 0;
  for (const x of a) if (b.has(x)) common++;
  const all = a.size + b.size - common;
  return all === 0 ? 0 : common / all;
}

/**
 * This function matches the highways of a plan with the highways of an earlier plan. It pairs the highways with the largest Jaccard index of their edges first.
 * A pair needs an index of `min` or more. Each highway is in one pair at most. The result maps the index of a new highway to the index of its old highway.
 * Only the edges of `edges` count, when this set is present: for example the edges of both graphs.
 */
export function matchHighways(before: HighwayPlan, after: HighwayPlan, min: number, edges?: ReadonlySet<string>): Map<number, number> {
  const setOf = (h: Highway): Set<string> => new Set(h.members.map((m) => m.edge).filter((e) => edges?.has(e) ?? true));
  const old = before.highways.map(setOf);
  const now = after.highways.map(setOf);
  const pairs: [j: number, i: number, i0: number][] = [];
  now.forEach((a, i) =>
    old.forEach((b, i0) => {
      const j = jaccard(a, b);
      if (j >= min && j > 0) pairs.push([j, i, i0]);
    }),
  );
  pairs.sort((p, q) => q[0] - p[0] || p[1] - q[1] || p[2] - q[2]);
  const out = new Map<number, number>();
  const used = new Set<number>();
  for (const [, i, i0] of pairs) {
    if (out.has(i) || used.has(i0)) continue;
    out.set(i, i0);
    used.add(i0);
  }
  return out;
}
