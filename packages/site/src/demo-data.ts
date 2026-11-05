import {
  BASELINE_STRATEGIES,
  fixtureGroupOptions,
  getStrategy,
  highwayRouterStrategy,
  KEYED_STRATEGIES,
  keyOfStrategy,
  listStrategies,
  STEPS,
  strategyKey,
  UNSCREENED_STRATEGIES,
  wholeStrategies,
  type AnyStrategy,
  type Graph,
  type Registry,
  type Result,
  type Step,
  type Strategy,
} from "@mark1russell7/highways";
import { COMPARE_STRATEGIES } from "./opt-in.ts";
import { controlOptions, textOptions } from "./options.ts";

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
export function demoPickers(registry: Registry = COMPARE_STRATEGIES): DemoPicker[] {
  return STEPS.map((step) => ({ step, names: listStrategies(registry, step).map((s) => s.name), ...(NONE[step] ? { none: NONE[step] } : {}) }));
}

/** The share of the strategies and options of the registry that the pages list. */
export interface PageCoverage {
  /** The number of keyed strategies. */
  readonly strategies: number;
  /** The keys of the strategies that the lists of the demo leave out. */
  readonly leftByDemo: readonly string[];
  /** The keys of the strategies that the demo and the compare page both leave out. */
  readonly leftByPages: readonly string[];
  /** The options of the strategies of the demo with a control. */
  readonly controls: number;
  /** The options of the strategies of the demo that show as fixed text, because they have no range. */
  readonly fixed: number;
}

/** This function counts what the demo and the compare page show from `keyed`. The demo reads `shown`, and the compare page reads `compare`. */
export function pageCoverage(keyed: Registry = KEYED_STRATEGIES, shown: Registry = COMPARE_STRATEGIES, compare: Registry = COMPARE_STRATEGIES): PageCoverage {
  const keys = (registry: Registry): AnyStrategy[] => STEPS.flatMap((step) => listStrategies(registry, step) as readonly AnyStrategy[]);
  const demo = new Set(demoPickers(shown).flatMap((p) => p.names.map((name) => `${p.step}/${name}`)));
  const both = new Set([...demo, ...keys(compare).map(keyOfStrategy)]);
  const all = keys(keyed);
  const listed = all.filter((s) => demo.has(keyOfStrategy(s))) as Strategy<Step, object>[];
  return {
    strategies: all.length,
    leftByDemo: all.map(keyOfStrategy).filter((k) => !demo.has(k)),
    leftByPages: all.map(keyOfStrategy).filter((k) => !both.has(k)),
    controls: listed.reduce((n, s) => n + controlOptions(s).length, 0),
    fixed: listed.reduce((n, s) => n + textOptions(s).length, 0),
  };
}

/** This function tells if the demo lists each strategy that no ruling keeps off the page: the baselines and the strategies with no screen. */
export function demoComplete(coverage: PageCoverage): boolean {
  const ruled = new Set([...BASELINE_STRATEGIES, ...UNSCREENED_STRATEGIES].map(keyOfStrategy));
  return coverage.leftByDemo.every((key) => ruled.has(key));
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
export function demoRoute(graph: Graph, pick: DemoPick, registry: Registry = COMPARE_STRATEGIES): DemoRoute {
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
