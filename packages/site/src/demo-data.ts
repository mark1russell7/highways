import {
  asRouter,
  fixtureGroupOptions,
  getStrategy,
  highwayRouterStrategy,
  listOptions,
  listStrategies,
  openGaps,
  roomLinks,
  STEPS,
  STRATEGIES,
  type Graph,
  type Registry,
  type Result,
  type Step,
  type Strategy,
} from "@mark1russell7/highways";

/** The option values of the demo, by step, then by the name of the strategy, then by the key of the option. */
export type DemoOptions = Readonly<Partial<Record<Step, Readonly<Record<string, Readonly<Record<string, number | boolean | string>>>>>>>;

/** What the demo routes: a router or a highway plan, a grouping rule, a room strategy and the options of each one. */
export interface DemoPick {
  readonly router: string;
  /** The highway strategy. With it, the plan of the strategy and `follow` give the routes, not the router. */
  readonly highway?: string;
  /** The grouping rule of a router that reads one, for example `sections`. */
  readonly group?: string;
  /** The room strategy. With it, the demo opens the gaps of the board before the routes. */
  readonly room?: string;
  readonly options?: DemoOptions;
}

/** One picker of the demo: the strategies of one step, from the registry. */
export interface DemoPicker {
  readonly step: Step;
  /** The names of the strategies, in the order of the registry. */
  readonly names: readonly string[];
  /** The text of the choice "none", for a step that the demo can skip. */
  readonly none?: string;
}

/** The text of the choice "none" of each step that the demo can skip. */
const NONE: Readonly<Partial<Record<Step, string>>> = { highway: "None: the router routes", room: "None: the board as it is" };

/**
 * This function gives a picker for each step of `STEPS`, with each strategy of the registry.
 * The demo builds its controls from these pickers, so a new strategy or step shows up with no edit of the page.
 */
export function demoPickers(registry: Registry = STRATEGIES): DemoPicker[] {
  return STEPS.map((step) => ({ step, names: listStrategies(registry, step).map((s) => s.name), ...(NONE[step] ? { none: NONE[step] } : {}) }));
}

/** This function tells if a router reads a grouping rule: its schema has an option of the type `strategy` of the step `group`. */
export function groupKey(router: Strategy<"router">): string | undefined {
  return listOptions(router).find((o) => o.declaration.type === "strategy" && o.declaration.step === "group")?.key;
}

/** The output of `demoRoute`: the board that the routes go on, and the routes. */
export interface DemoRoute {
  /** The board: the graph, or the graph with the gaps that the room strategy opened. */
  readonly graph: Graph;
  readonly result: Result;
}

/**
 * This function routes one board as the demo picks it. The room strategy opens the gaps of the board first (`openGaps`).
 * A highway strategy makes its plan, and `follow` routes the plan. Otherwise the router routes, with the grouping rule if the router reads one.
 * It throws an error for a board with more nodes than the `maxNodes` of the strategy.
 */
export function demoRoute(graph: Graph, pick: DemoPick, registry: Registry = STRATEGIES): DemoRoute {
  const own = <S extends Step>(step: S, name: string): Readonly<Record<string, number | boolean | string>> | undefined => pick.options?.[step]?.[name];
  let board = graph;
  if (pick.room) {
    const room = getStrategy(registry, "room", pick.room);
    board = { nodes: openGaps(graph.nodes, room.run({ items: graph.nodes, links: roomLinks(graph) }, own("room", room.name))), edges: graph.edges };
  }
  let router: Strategy<"router">;
  let options: object | undefined;
  if (pick.highway) {
    const highway = getStrategy(registry, "highway", pick.highway);
    router = highwayRouterStrategy(highway) as Strategy<"router">;
    options = own("highway", highway.name);
  } else {
    router = getStrategy(registry, "router", pick.router);
    const key = groupKey(router);
    const group = key && pick.group ? getStrategy(registry, "group", pick.group) : undefined;
    options = group ? { ...own("router", router.name), [key!]: group, groupOptions: { ...fixtureGroupOptions(group.name, board), ...own("group", group.name) } } : own("router", router.name);
  }
  if (board.nodes.length > (router.maxNodes ?? Infinity)) throw new Error(`The strategy ${router.name} takes at most ${router.maxNodes} nodes.`);
  return { graph: board, result: asRouter(router, options).route(board) };
}
