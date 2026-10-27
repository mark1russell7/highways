import type { Graph, Result, Router } from "../model.ts";
import { defineStrategy, type Strategy } from "../strategies/model.ts";
import type { WayOptions } from "../ways.ts";
import { follow, type FollowOptions } from "./follow.ts";

/** This function gives the options of the way finder in the options of a strategy: `margin` and `k`, when they are present. */
export function wayOptionsOf(options: object): WayOptions {
  const o = options as { margin?: unknown; k?: unknown };
  return { ...(typeof o.margin === "number" ? { margin: o.margin } : {}), ...(typeof o.k === "number" ? { k: o.k } : {}) };
}

/**
 * This function gives a router that runs a highway strategy and then `follow`. The strategy gets the graph without first routes.
 * The way finder of `follow` takes `margin` and `k` from the options of the strategy, and then from `followOptions`.
 * The router keeps the name and the `maxNodes` of the strategy.
 */
export function highwayRouter<O extends object>(strategy: Strategy<"highway", O>, options?: Partial<O>, followOptions: FollowOptions = {}): Router {
  return {
    name: strategy.name,
    ...(strategy.maxNodes === undefined ? {} : { maxNodes: strategy.maxNodes }),
    route: (graph: Graph): Result => follow(graph, strategy.run({ graph }, options), { ...followOptions, ...wayOptionsOf({ ...strategy.defaults, ...options }) }),
  };
}

/**
 * This function gives a router strategy that runs a highway strategy and then `follow`.
 * The router strategy has the name, the options and the schema of the highway strategy.
 * The benchmark and the screen race such a router with the other routers.
 */
export function highwayRouterStrategy<O extends object>(strategy: Strategy<"highway", O>): Strategy<"router", O> {
  return defineStrategy<"router", O>({
    step: "router",
    name: strategy.name,
    describe: strategy.describe,
    defaults: strategy.defaults as O,
    ...(strategy.schema === undefined ? {} : { schema: strategy.schema }),
    ...(strategy.maxNodes === undefined ? {} : { maxNodes: strategy.maxNodes }),
    run: (graph: Graph, options: Readonly<O>): Result => follow(graph, strategy.run({ graph }, options), wayOptionsOf(options)),
  });
}
