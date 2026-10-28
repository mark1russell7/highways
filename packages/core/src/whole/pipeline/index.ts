import { highwayRouterStrategy } from "../../highways/router.ts";
import type { Graph } from "../../model.ts";
import { openGaps, roomLinks } from "../../room/index.ts";
import { asRouter, type Step, type Strategy, type WholeOutput } from "../../strategies/model.ts";
import { listOptions } from "../../strategies/options.ts";

/**
 * The options of the whole strategy `pipeline`: one strategy of each step, and the options of each one.
 * A rule of the steps `group`, `plugs` and `levels` acts only on a router that reads a rule of that step (`strategyKey`).
 */
export interface PipelineOptions {
  /** The router. A highway plan takes its place. */
  readonly router: Strategy<"router">;
  /** The options of the router. */
  readonly routerOptions?: object;
  /** The highway strategy. With it, the plan of the strategy and `follow` give the routes, not the router. */
  readonly highway?: Strategy<"highway">;
  /** The options of the highway strategy. */
  readonly highwayOptions?: object;
  /** The grouping rule of a router that reads one, for example `sections`. */
  readonly group?: Strategy<"group">;
  /** The options of the grouping rule. */
  readonly groupOptions?: object;
  /** The plug rule of a router that reads one, for example `corners`. */
  readonly plugs?: Strategy<"plugs">;
  /** The options of the plug rule. */
  readonly plugOptions?: object;
  /** The level rule of a router that reads one, for example `sections`. */
  readonly levels?: Strategy<"levels">;
  /** The options of the level rule. */
  readonly levelOptions?: object;
  /** The room strategy. With it, the pipeline opens the gaps of the board before the routes (`openGaps`). */
  readonly room?: Strategy<"room">;
  /** The options of the room strategy. */
  readonly roomOptions?: object;
}

/**
 * This function gives the key of the option of a router that takes a strategy of one step.
 * It gives `undefined` when the router has no such option.
 * The schema of the router declares the option with the type `strategy` and the step. The options of that strategy have the key `<key>Options`.
 */
export function strategyKey(router: Strategy<"router">, step: Step): string | undefined {
  return listOptions(router).find((o) => o.declaration.type === "strategy" && o.declaration.step === step)?.key;
}

/**
 * This function runs the whole strategy `pipeline` on one graph. The room strategy opens the gaps of the board first.
 * A highway strategy makes its plan, and `follow` routes the plan. Otherwise the router routes, with each rule of the steps `group`, `plugs` and `levels` that it reads.
 * The output has the board and the routes. The function does not examine the `maxNodes` of the router.
 */
export function runPipeline(graph: Graph, options: PipelineOptions): WholeOutput {
  const board = options.room ? { nodes: openGaps(graph.nodes, options.room.run({ items: graph.nodes, links: roomLinks(graph) }, options.roomOptions)), edges: graph.edges } : graph;
  if (options.highway) return { graph: board, result: asRouter(highwayRouterStrategy(options.highway) as Strategy<"router">, options.highwayOptions).route(board) };
  let routerOptions = options.routerOptions;
  const rules: readonly [Step, Strategy<Step> | undefined, object | undefined][] = [
    ["group", options.group, options.groupOptions],
    ["plugs", options.plugs, options.plugOptions],
    ["levels", options.levels, options.levelOptions],
  ];
  for (const [step, rule, own] of rules) {
    const key = rule && strategyKey(options.router, step);
    if (key) routerOptions = { ...routerOptions, [key]: rule, [`${key}Options`]: own };
  }
  return { graph: board, result: asRouter(options.router, routerOptions).route(board) };
}
