import type { CurveSegment } from "../curves/model.ts";
import type { CurveSpace } from "../curves/space.ts";
import type { Point } from "../geom.ts";
import type { HighwayInput, HighwayPlan } from "../highways/model.ts";
import type { Graph, Result, Router } from "../model.ts";
import type { Boxed, Gap, RoomLink } from "../room/index.ts";
import type { Section } from "../sections.ts";
import type { SegmentGraph } from "../segments.ts";
import type { OptionSchema } from "./options.ts";

/** The input of a curve strategy: one polyline and the context of its route. */
export interface CurveInput {
  /** These points are the polyline: a route of a router, a lane of `laneRoutes` or a link of a zoom level. */
  readonly points: readonly Point[];
  /** The curve leaves the first point along this outward normal of its plug, if the strategy reads it. */
  readonly startNormal?: Point;
  /** The curve comes into the last point against this outward normal of its plug, if the strategy reads it. */
  readonly endNormal?: Point;
  /** The boxes that the curve must not go through, from `curveSpace`. */
  readonly space?: CurveSpace;
  /**
   * The lane of the polyline on its board, for a strategy that bends the lanes of a bundle as one. Then `points` is the route of `laneRoutes` with the index `index`.
   * The other strategies do not read it.
   */
  readonly lane?: { readonly board: LaneBoard; readonly index: number };
}

/** The lanes of the bundles of one board: the input of `laneRoutes` and `highwayCurves`. */
export interface LaneBoard {
  /** The shared segments and the paths of the routes, from `segmentsOf`. */
  readonly graph: SegmentGraph;
  /** The keys of the open segments, from `runKey`. Each edge of an open segment gets its own lane. */
  readonly open: ReadonlySet<string>;
  /** The distance between two lanes of an open segment. */
  readonly width: number;
  /** The largest width of an open segment, from its outer lane to its outer lane. The default is `Infinity`. */
  readonly maxWidth?: number;
}

/** The input of a room strategy: the boxes of a board and the links between them. */
export interface RoomInput {
  readonly items: readonly Boxed[];
  readonly links: readonly RoomLink[];
  /**
   * The tree of sections of the items, for a strategy that gives room to each zoom level. The indices of its nodes are the indices of `items`.
   * Without it, such a strategy makes the quadtree of `buildSections`. The other strategies do not read it.
   */
  readonly sections?: Section;
}

/**
 * The steps that have strategies, with the fixed input and output type of each step.
 *
 * - `group`: a graph in, the tree of sections out. The router `sections` makes its hubs and its zoom levels from this tree.
 * - `router`: a graph in, the routes (and the `levels`, `bundles` and `runs`) out.
 * - `highway`: a graph and optionally its first routes in, a highway plan out. `follow` routes the edges along the plan.
 * - `curve`: a polyline in, the segments of a curve out.
 * - `room`: the boxes and links of a board in, the gaps of the board with their need out.
 */
export interface StepTypes {
  readonly group: { readonly input: Graph; readonly output: Section };
  readonly router: { readonly input: Graph; readonly output: Result };
  readonly highway: { readonly input: HighwayInput; readonly output: HighwayPlan };
  readonly curve: { readonly input: CurveInput; readonly output: CurveSegment[] };
  readonly room: { readonly input: RoomInput; readonly output: Gap[] };
}

/** The name of a step that has strategies. */
export type Step = keyof StepTypes;

/** The input type of a step. */
export type StepInput<S extends Step> = StepTypes[S]["input"];

/** The output type of a step. */
export type StepOutput<S extends Step> = StepTypes[S]["output"];

/** The steps that have strategies, in the order of the pipeline. */
export const STEPS: readonly Step[] = ["group", "router", "highway", "curve", "room"];

/**
 * A strategy: one way to do one step, with a name and a description.
 * The same input and the same options must give the same output.
 */
export interface Strategy<S extends Step = Step, O extends object = object> {
  /** The step of the strategy. It fixes the input and the output type. */
  readonly step: S;
  /** The name of the strategy. Each name is unique in its step of a registry. */
  readonly name: string;
  /** One or two sentences that tell what the strategy does. The site and the documents show them. */
  readonly describe: string;
  /** The values of the options when the caller gives no value. */
  readonly defaults: Readonly<O>;
  /** The declarations of the options: the type, the range, the step and the meaning of each one. A strategy without it declares nothing. */
  readonly schema?: OptionSchema<O>;
  /** The benchmark skips an input with more nodes than this. Without it, the strategy takes each input. */
  readonly maxNodes?: number;
  /** This method does the step. Each option that `options` does not give gets its value from `defaults`. */
  run(input: StepInput<S>, options?: Partial<O>): StepOutput<S>;
}

/** A strategy of any step. A registry holds a list of these. */
export type AnyStrategy = { [S in Step]: Strategy<S> }[Step];

/** The definition of a strategy, for `defineStrategy`. */
export interface StrategyDefinition<S extends Step, O extends object> {
  readonly step: S;
  readonly name: string;
  readonly describe: string;
  /** These values are the options when the caller gives no value. Give `{}` for a strategy without options. */
  readonly defaults: O;
  /** These declarations tell the type, the range, the step and the meaning of each option. `checkSchema` examines them. */
  readonly schema?: NoInfer<OptionSchema<O>>;
  readonly maxNodes?: number;
  /** This function does the step. It gets each option, from the caller or from `defaults`. */
  run(input: StepInput<S>, options: Readonly<O>): StepOutput<S>;
}

/** This function gives a frozen copy of a schema, with each declaration frozen. */
function freezeSchema<O>(schema: OptionSchema<O>): OptionSchema<O> {
  const out: Record<string, unknown> = {};
  for (const [key, d] of Object.entries(schema)) out[key] = Object.freeze({ ...(d as object) });
  return Object.freeze(out) as OptionSchema<O>;
}

/**
 * This function makes a strategy from its definition. The strategy fills the missing options from `defaults`.
 * When the caller gives no option, the definition gets the `defaults` object itself.
 */
export function defineStrategy<S extends Step, O extends object>(definition: StrategyDefinition<S, O>): Strategy<S, O> {
  const { step, name, describe, defaults, schema, maxNodes } = definition;
  if (name.length === 0) throw new Error(`A strategy of the step "${step}" has no name.`);
  const strategy: Strategy<S, O> = {
    step,
    name,
    describe,
    defaults: Object.freeze({ ...defaults }),
    ...(schema === undefined ? {} : { schema: freezeSchema(schema) }),
    ...(maxNodes === undefined ? {} : { maxNodes }),
    run(input: StepInput<S>, options?: Partial<O>): StepOutput<S> {
      const all = options === undefined || Object.keys(options).length === 0 ? strategy.defaults : { ...strategy.defaults, ...options };
      return definition.run(input, all as Readonly<O>);
    },
  };
  return Object.freeze(strategy);
}

/**
 * A registry: the strategies of each step, in order. A registry is data. No import changes it.
 * A consumer makes its own registry with `createRegistry`, and adds a strategy with `register`.
 * The lists `group` and `highway` are optional in the type, so a registry from version 0.1.5 or 0.3.0 stays a registry. `createRegistry` always gives them.
 */
export type Registry = { readonly [S in Exclude<Step, "group" | "highway">]: readonly Strategy<S>[] } & {
  readonly group?: readonly Strategy<"group">[];
  readonly highway?: readonly Strategy<"highway">[];
};

/** This function makes a registry from a list of strategies. It keeps their order. Two strategies with one step and one name are an error. */
export function createRegistry(strategies: readonly AnyStrategy[]): Registry {
  const out: { [S in Step]: Strategy<S>[] } = { group: [], router: [], highway: [], curve: [], room: [] };
  for (const s of strategies) {
    const list = out[s.step] as AnyStrategy[] | undefined;
    if (!list) throw new Error(`There is no step "${String(s.step)}". The steps are ${STEPS.join(", ")}.`);
    if (list.some((t) => t.name === s.name)) throw new Error(`The step "${s.step}" has two strategies with the name "${s.name}".`);
    list.push(s);
  }
  return Object.freeze({
    group: Object.freeze(out.group),
    router: Object.freeze(out.router),
    highway: Object.freeze(out.highway),
    curve: Object.freeze(out.curve),
    room: Object.freeze(out.room),
  });
}

/** This function gives a new registry with the strategies of `registry` and then `strategies`. It does not change `registry`. */
export function register(registry: Registry, ...strategies: readonly AnyStrategy[]): Registry {
  return createRegistry([...(registry.group ?? []), ...registry.router, ...(registry.highway ?? []), ...registry.curve, ...registry.room, ...strategies]);
}

/** This function gives the strategies of one step of a registry, in order. */
export function listStrategies<S extends Step>(registry: Registry, step: S): readonly Strategy<S>[] {
  return (registry[step] ?? []) as readonly Strategy<S>[];
}

/** This function gives the strategy of one step with a name, or `undefined` when the registry has no such strategy. */
export function findStrategy<S extends Step>(registry: Registry, step: S, name: string): Strategy<S> | undefined {
  return listStrategies(registry, step).find((s) => s.name === name);
}

/** This function gives the strategy of one step with a name. When the registry has no such strategy, the function throws an error. */
export function getStrategy<S extends Step>(registry: Registry, step: S, name: string): Strategy<S> {
  const s = findStrategy(registry, step, name);
  if (!s) throw new Error(`There is no ${step} "${name}". The registry has ${listStrategies(registry, step).map((t) => t.name).join(", ")}.`);
  return s;
}

/** This function gives a `Router` that runs a router strategy with the options. The router keeps the name and the `maxNodes` of the strategy. */
export function asRouter<O extends object>(strategy: Strategy<"router", O>, options?: Partial<O>): Router {
  return {
    name: strategy.name,
    ...(strategy.maxNodes === undefined ? {} : { maxNodes: strategy.maxNodes }),
    route: (graph: Graph): Result => strategy.run(graph, options),
  };
}

/** This function gives the router strategies of a registry as `Router` objects, in order. The benchmark races them. */
export function routersOf(registry: Registry): Router[] {
  return listStrategies(registry, "router").map((s) => asRouter(s));
}
