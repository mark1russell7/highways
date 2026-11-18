import type { Edge, Graph, Result, Router, RouterSession } from "./model.ts";

/** The message of the error that a session throws for a route after `dispose`. */
export const DISPOSED = "The session is disposed. Make a new session.";

/**
 * This function gives a session with no kept work. Each `route(edges)` is one whole `router.route({ ...graph, edges })`.
 * `routerSession` gives it for a router without the method `session`. A router gives it for a copy that has a different `route`.
 */
export function plainSession(router: Router, graph: Graph): RouterSession {
  let held: { readonly router: Router; readonly graph: Graph } | undefined = { router, graph };
  return {
    route(edges: readonly Edge[]): Result {
      if (held === undefined) throw new Error(DISPOSED);
      return held.router.route({ ...held.graph, edges });
    },
    dispose(): void {
      held = undefined;
    },
  };
}

/**
 * This function gives a session of the router on the nodes of the graph.
 * A caller that routes a few edges among the same nodes many times makes one session, and routes each set of edges with it.
 *
 * - A router with the method `session` gives its own session. The router `corners` keeps its obstacles and its corner graph there.
 * - Each other router gets a session with no kept work: each `route(edges)` is one whole `router.route({ ...graph, edges })`.
 *
 * `session.route(edges)` gives the same result as `router.route({ ...graph, edges })` for each router.
 * The session holds a snapshot of the nodes. A change of a node, for example of its box, needs a new session.
 */
export function routerSession(router: Router, graph: Graph): RouterSession {
  return router.session === undefined ? plainSession(router, graph) : router.session(graph);
}
