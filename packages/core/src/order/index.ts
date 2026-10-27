import { fnv1a32 } from "../bench/screen/hash.ts";
import { rng } from "../fixtures.ts";
import type { Edge, Graph, Result, Router } from "../model.ts";
import { defineStrategy, type Strategy } from "../strategies/model.ts";

/** This function compares two edges by the hash of their ids, and then by their ids. Thus the order of two edges does not depend on the input. */
function byHash(a: { readonly h: number; readonly e: Edge }, b: { readonly h: number; readonly e: Edge }): number {
  if (a.h !== b.h) return a.h - b.h;
  return a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0;
}

/**
 * This function gives the graph with its edges in the stable order of WILD-053: by the FNV-1a hash of the id, then by the id.
 * The nodes and the edges do not change. Two orders of the same edges give the same graph.
 * The hash spreads the edges, so the stable order does not favor the edges of one node or one collection.
 */
export function stableOrder(graph: Graph): Graph {
  const edges = graph.edges.map((e) => ({ h: fnv1a32(e.id), e })).sort(byHash).map((x) => x.e);
  return { ...graph, edges };
}

/** This function gives the graph with its edges in a random order of the seed. The same graph and seed always give the same order. */
export function shuffleEdges(graph: Graph, seed: number): Graph {
  const edges = [...graph.edges];
  const r = rng(seed);
  for (let i = edges.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [edges[i], edges[j]] = [edges[j]!, edges[i]!];
  }
  return { ...graph, edges };
}

/**
 * This function routes the graph in the stable order of `stableOrder`, with the function `route`.
 * The routes come back in the order of the input edges, so the caller sees no change of order.
 * The bundles, the runs and the levels come from the stable order. Thus each order of the input gives the same data.
 */
export function routeInStableOrder(graph: Graph, route: (graph: Graph) => Result): Result {
  const result = route(stableOrder(graph));
  const index = new Map(graph.edges.map((e, i) => [e.id, i] as const));
  const at = (edge: string): number => index.get(edge) ?? Number.MAX_SAFE_INTEGER;
  const routes = [...result.routes].sort((a, b) => at(a.edge) - at(b.edge));
  return { ...result, routes };
}

/** This function gives a router that routes each graph in the stable order of WILD-053. It keeps the name and the `maxNodes` of the router. */
export function withStableOrder(router: Router): Router {
  return { ...router, route: (graph: Graph): Result => routeInStableOrder(graph, (g) => router.route(g)) };
}

/**
 * This function gives a router strategy that runs `strategy` in the stable order of WILD-053. The output does not depend on the order of the input edges.
 * The new strategy has the name `<name>+stable`, and the options and the schema of `strategy`. The strategy `strategy` does not change.
 */
export function stableOrderStrategy<O extends object>(strategy: Strategy<"router", O>): Strategy<"router", O> {
  return defineStrategy<"router", O>({
    step: "router",
    name: `${strategy.name}+stable`,
    describe: `${strategy.describe} The edges go in a stable order: by a hash of their ids.`,
    defaults: { ...strategy.defaults } as O,
    ...(strategy.schema === undefined ? {} : { schema: strategy.schema }),
    ...(strategy.maxNodes === undefined ? {} : { maxNodes: strategy.maxNodes }),
    run: (graph: Graph, options: Readonly<O>): Result => routeInStableOrder(graph, (g) => strategy.run(g, options)),
  });
}
