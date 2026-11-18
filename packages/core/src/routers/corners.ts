import { center } from "../geom.ts";
import { checkParents, nodeIndex, resolvePorts, splitFrames, type Edge, type Graph, type InnerEdge, type Node, type Result, type Route, type Router, type RouterSession } from "../model.ts";
import { placePlug, type Plug } from "../plugs.ts";
import { spacePlugs } from "../plugs/justify.ts";
import { sidePlugs } from "../plugs/side.ts";
import { DISPOSED, plainSession } from "../session.ts";
import type { PlugPair, Strategy } from "../strategies/model.ts";
import { joinNote, markThrough } from "../through.ts";
import { WayFinder } from "../ways.ts";
import { frameRoutes, type FrameOptions } from "./frames.ts";

/** The ways to place a free plug of the corner router. */
export type PlugPlace = "facing" | "side";

/** The options of the corner router. */
export interface CornersOptions extends FrameOptions {
  /** The name in the benchmark. */
  readonly name: string;
  /** The benchmark skips a fixture with more nodes. */
  readonly maxNodes?: number;
  /** The limit of the work that joins the parts of the corner graph. `CornerGraphOptions.joinWork` tells more. */
  readonly joinWork?: number;
  /** With `false`, the join does not label the free regions. `CornerGraphOptions.joinRegions` tells more. */
  readonly joinRegions?: boolean;
  /**
   * The place of a free plug. The default is `facing`: the plug faces the other end (`placePlug`).
   * With `side`, the search starts from the whole free side, and the plug goes where the way leaves the side (`sidePlugs`, WILD-001).
   */
  readonly plugs?: PlugPlace;
  /**
   * The least gap between two free plugs of one side. The default is 0: each plug stays where it is.
   * Above 0, the free plugs of each side keep their order and move the least distance (`justifyPlugs`, WILD-002).
   */
  readonly plugGap?: number;
  /**
   * The plug rule: a strategy of the step `plugs` that places the plugs of each edge. It takes the place of the option `plugs`.
   * Without it, the router places the plugs with the option `plugs`. An edge without plugs from the strategy gets the plugs of `facing`.
   */
  readonly plug?: Strategy<"plugs">;
  /** The options of the strategy `plug`. The strategy gets its `defaults` for each option that this object does not give. */
  readonly plugOptions?: object;
}

/**
 * This function makes a router that goes around the nodes.
 * Each edge leaves its plug along the normal of the side. It goes a shortest way (A*) through a sparse visibility graph
 * of the box corners, without the needless corners. It enters the target plug along its normal.
 * An inner edge (`splitFrames`) gets an inner route in the bounds of its frame (`frameRoutes`), after the outer routes.
 *
 * The method `session` of the router keeps the obstacles and the corner graph of the nodes of a graph.
 * Each `route(edges)` of that session then makes only the ways of its edges, so a few edges among many nodes take a short time.
 */
export function cornersRouter(options: CornersOptions): Router {
  // The routes of the edges of `graph`. The index `byId` and the ways `ways` are those of the nodes of `graph`.
  const routeOn = (graph: Graph, inner: readonly InnerEdge[], byId: ReadonlyMap<string, Node>, ways: WayFinder): Result => {
    const routes: Route[] = [];
    // The inner routes come after the outer routes.
    const done = (): Result => {
      const outer = markThrough(graph, routes, ways.obstacles);
      return { routes: inner.length > 0 ? [...outer, ...frameRoutes(graph, inner, options)] : outer, ...joinNote(ways) };
    };
    if (!options.plug && (options.plugs ?? "facing") === "facing" && !((options.plugGap ?? 0) > 0)) {
      for (const e of graph.edges) {
        const s = byId.get(e.source.node);
        const t = byId.get(e.target.node);
        if (!s || !t) continue;
        const ps = placePlug(s, e.source, center(t.box));
        const pt = placePlug(t, e.target, center(s.box));
        routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
      }
      return done();
    }
    // First the plugs of each edge, then the gaps of the plugs of each side, then the ways between the plugs.
    const ends: [Edge, Node, Node, Plug, Plug][] = [];
    const placed = options.plug ? plugsByEdge(options.plug.run({ graph, ways }, options.plugOptions)) : undefined;
    for (const e of graph.edges) {
      const s = byId.get(e.source.node);
      const t = byId.get(e.target.node);
      if (!s || !t) continue;
      const own = placed?.get(e.id)?.shift();
      const [ps, pt]: [Plug, Plug] = own
        ? [own.source, own.target]
        : options.plugs === "side" && !placed
          ? sidePlugs(ways, s, e.source, t, e.target)
          : [placePlug(s, e.source, center(t.box)), placePlug(t, e.target, center(s.box))];
      ends.push([e, s, t, ps, pt]);
    }
    if ((options.plugGap ?? 0) > 0) spacePlugs(ends, options.plugGap!);
    for (const [e, s, t, ps, pt] of ends) routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
    return done();
  };
  const router: Router = {
    name: options.name,
    route(input: Graph): Result {
      const { graph, inner } = splitFrames(resolvePorts(input));
      return routeOn(graph, inner, nodeIndex(graph), new WayFinder(graph.nodes, options));
    },
    // The session keeps the parts of `route` that read only the nodes: the plugs of `resolvePorts`, the index of the nodes and the ways.
    // The split of the inner edges, the plugs, the marks of `through` and the inner routes read the edges, so each route makes them again.
    session(this: Router | undefined, input: Graph): RouterSession {
      // A copy of this router with a different `route` gives other results. Its session routes with the `route` of the copy.
      if (this !== undefined && this.route !== router.route) return plainSession(this, input);
      const resolved = resolvePorts(input);
      const byId = nodeIndex(resolved);
      // A bad parent throws here, as it does in `route`.
      checkParents(resolved, byId);
      let kept: { readonly resolved: Graph; readonly byId: ReadonlyMap<string, Node>; readonly ways: WayFinder } | undefined = { resolved, byId, ways: new WayFinder(resolved.nodes, options) };
      return {
        route(edges: readonly Edge[]): Result {
          if (kept === undefined) throw new Error(DISPOSED);
          const { graph, inner } = splitFrames({ ...kept.resolved, edges });
          // The counts of the lower steps start at 0, as in the new ways of `route`. The other state of the ways changes no result.
          kept.ways.lowerWays.fill(0);
          return routeOn(graph, inner, kept.byId, kept.ways);
        },
        dispose(): void {
          kept = undefined;
        },
      };
    },
  };
  return options.maxNodes === undefined ? router : { ...router, maxNodes: options.maxNodes };
}

/** This function gives the plugs of a plug strategy by the edge id. Two edges with one id take the entries of that id in order. */
function plugsByEdge(list: readonly PlugPair[]): Map<string, PlugPair[]> {
  const out = new Map<string, PlugPair[]>();
  for (const p of list) {
    const own = out.get(p.edge);
    if (own) own.push(p);
    else out.set(p.edge, [p]);
  }
  return out;
}
