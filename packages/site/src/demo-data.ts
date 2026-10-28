import {
  fixtureGroupOptions,
  getStrategy,
  highwayRouterStrategy,
  listStrategies,
  STEPS,
  STRATEGIES,
  strategyKey,
  wholeStrategies,
  type Graph,
  type Registry,
  type Result,
  type Step,
  type Strategy,
} from "@mark1russell7/highways";

/** The option values of the demo, by step, then by the name of the strategy, then by the key of the option. */
export type DemoOptions = Readonly<Partial<Record<Step, Readonly<Record<string, Readonly<Record<string, number | boolean | string>>>>>>>;

/** What the demo routes: a router or a highway plan, its rules, a room strategy and the whole strategy, each with its options. */
export interface DemoPick {
  readonly router: string;
  /** The highway strategy. With it, the plan of the strategy and `follow` give the routes, not the router. */
  readonly highway?: string;
  /** The grouping rule of a router that reads one, for example `sections`. */
  readonly group?: string;
  /** The plug rule of a router that reads one, for example `corners`. Without it, the router places its plugs. */
  readonly plugs?: string;
  /** The level rule of a router that reads one, for example `sections`. Without it, the router makes its zoom levels. */
  readonly levels?: string;
  /** The room strategy. With it, the demo opens the gaps of the board before the routes. */
  readonly room?: string;
  /** The whole strategy that runs the other steps. The default is `pipeline`. */
  readonly whole?: string;
  readonly options?: DemoOptions;
}

/** The label of the picker of each step in the demo. */
export const PICK_LABELS: Readonly<Record<Step, string>> = {
  group: "Grouping rule",
  plugs: "Plug rule",
  router: "Router",
  highway: "Highway plan",
  levels: "Level rule",
  curve: "Curve",
  room: "Room",
  whole: "Whole",
};

/** One picker of the demo: the strategies of one step, from the registry. */
export interface DemoPicker {
  readonly step: Step;
  /** The names of the strategies, in the order of the registry. */
  readonly names: readonly string[];
  /** The text of the choice "none", for a step that the demo can skip. */
  readonly none?: string;
}

/** The text of the choice "none" of each step that the demo can skip. */
const NONE: Readonly<Partial<Record<Step, string>>> = {
  plugs: "None: the plugs of the router",
  highway: "None: the router routes",
  levels: "None: the levels of the router",
  room: "None: the board as it is",
};

/**
 * This function gives a picker for each step of `STEPS`, with each strategy of the registry.
 * The demo builds its controls from these pickers, so a new strategy or step shows up with no edit of the page.
 */
export function demoPickers(registry: Registry = STRATEGIES): DemoPicker[] {
  return STEPS.map((step) => ({ step, names: listStrategies(registry, step).map((s) => s.name), ...(NONE[step] ? { none: NONE[step] } : {}) }));
}

/** This function tells if a router reads a grouping rule: its schema has an option of the type `strategy` of the step `group`. */
export function groupKey(router: Strategy<"router">): string | undefined {
  return strategyKey(router, "group");
}

/** The output of `demoRoute`: the board that the routes go on, and the routes. */
export interface DemoRoute {
  /** The board: the graph, or the graph with the gaps that the room strategy opened. */
  readonly graph: Graph;
  readonly result: Result;
}

/**
 * This function routes one board as the demo picks it, with the whole strategy of the pick (`pipeline` by default).
 * The room strategy opens the gaps of the board first (`openGaps`). A highway strategy makes its plan, and `follow` routes the plan.
 * Otherwise the router routes, with each rule of the steps `group`, `plugs` and `levels` that the router reads.
 * It throws an error for a board with more nodes than the `maxNodes` of the router or the highway strategy.
 */
export function demoRoute(graph: Graph, pick: DemoPick, registry: Registry = STRATEGIES): DemoRoute {
  const own = <S extends Step>(step: S, name: string): Readonly<Record<string, number | boolean | string>> | undefined => pick.options?.[step]?.[name];
  const router = getStrategy(registry, "router", pick.router);
  const highway = pick.highway ? getStrategy(registry, "highway", pick.highway) : undefined;
  const room = pick.room ? getStrategy(registry, "room", pick.room) : undefined;
  const group = pick.group ? getStrategy(registry, "group", pick.group) : undefined;
  const plugs = pick.plugs ? getStrategy(registry, "plugs", pick.plugs) : undefined;
  const levels = pick.levels ? getStrategy(registry, "levels", pick.levels) : undefined;
  const whole = pick.whole ? getStrategy(registry, "whole", pick.whole) : wholeStrategies.pipeline;
  const maxNodes = highway ? highwayRouterStrategy(highway).maxNodes : router.maxNodes;
  const name = highway?.name ?? router.name;
  if (graph.nodes.length > (maxNodes ?? Infinity)) throw new Error(`The strategy ${name} takes at most ${maxNodes} nodes.`);
  // The room strategy does not change the number of the nodes, so the grouping options of the fixture fit the open board.
  const options = {
    router,
    ...(own("router", router.name) ? { routerOptions: own("router", router.name) } : {}),
    ...(highway ? { highway, highwayOptions: own("highway", highway.name) } : {}),
    ...(group ? { group, groupOptions: { ...fixtureGroupOptions(group.name, graph), ...own("group", group.name) } } : {}),
    ...(plugs ? { plugs, plugOptions: own("plugs", plugs.name) } : {}),
    ...(levels ? { levels, levelOptions: own("levels", levels.name) } : {}),
    ...(room ? { room, roomOptions: own("room", room.name) } : {}),
    ...own("whole", whole.name),
  };
  return whole.run(graph, options);
}
