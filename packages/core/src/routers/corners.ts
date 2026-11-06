import { center, dist, type Point } from "../geom.ts";
import { framesOf, nodeIndex, resolvePorts, splitFrames, type Edge, type Graph, type Node, type Result, type Route, type Router } from "../model.ts";
import { placePlug, type Plug } from "../plugs.ts";
import { spacePlugs } from "../plugs/justify.ts";
import { sidePlugs } from "../plugs/side.ts";
import type { PlugPair, Strategy } from "../strategies/model.ts";
import { joinNote, markRoute, markThrough } from "../through.ts";
import { WayFinder } from "../ways.ts";
import { frameRouteList, frameRoutes, type FrameItem, type FrameOptions } from "./frames.ts";

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
 * An edge with an end in a frame and no common frame gets three legs (`crossRoutes`, CROSS-FRAME-ROUTE).
 */
export function cornersRouter(options: CornersOptions): Router {
  const router: Router = {
    name: options.name,
    route(input: Graph): Result {
      const { graph, inner } = splitFrames(resolvePorts(input));
      const byId = nodeIndex(graph);
      const ways = new WayFinder(graph.nodes, options);
      const lifts = liftsOf(byId, graph.edges);
      const routes: Route[] = [];
      const routed: Edge[] = [];
      // The inner routes come after the outer routes. An edge between frames keeps its place among the outer routes.
      const done = (): Result => {
        const marked = markThrough(graph, routes, ways.obstacles);
        if (lifts.size === 0) return { routes: inner.length > 0 ? [...marked, ...frameRoutes(graph, inner, options)] : marked, ...joinNote(ways) };
        const { cross, innerRoutes } = crossRoutes(graph, lifts, inner, ways, options);
        const at = new Map(routed.map((e, i) => [e, marked[i]!] as const));
        const outer = graph.edges.flatMap((e) => at.get(e) ?? cross.get(e) ?? []);
        return { routes: [...outer, ...innerRoutes], ...joinNote(ways) };
      };
      if (!options.plug && (options.plugs ?? "facing") === "facing" && !((options.plugGap ?? 0) > 0)) {
        for (const e of graph.edges) {
          if (lifts.has(e)) continue;
          const s = byId.get(e.source.node);
          const t = byId.get(e.target.node);
          if (!s || !t) continue;
          const ps = placePlug(s, e.source, center(t.box));
          const pt = placePlug(t, e.target, center(s.box));
          routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
          routed.push(e);
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
        if (lifts.has(e)) continue;
        const [ps, pt]: [Plug, Plug] = own
          ? [own.source, own.target]
          : options.plugs === "side" && !placed
            ? sidePlugs(ways, s, e.source, t, e.target)
            : [placePlug(s, e.source, center(t.box)), placePlug(t, e.target, center(s.box))];
        ends.push([e, s, t, ps, pt]);
      }
      if ((options.plugGap ?? 0) > 0) spacePlugs(ends, options.plugGap!);
      for (const [e, s, t, ps, pt] of ends) {
        routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
        routed.push(e);
      }
      return done();
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

/** The ends of an edge between frames, and the top node that holds each end. An end at the top level is its own top node. */
interface Lift {
  readonly s: Node;
  readonly t: Node;
  readonly topS: Node;
  readonly topT: Node;
}

/**
 * This function gives the edges between frames of an outer graph (CROSS-FRAME-ROUTE). Such an edge has an end in a frame, and no frame holds its two ends.
 * The function gives the top node that holds each end. An edge whose two ends have the same top node is not an edge between frames.
 */
function liftsOf(byId: ReadonlyMap<string, Node>, edges: readonly Edge[]): Map<Edge, Lift> {
  const out = new Map<Edge, Lift>();
  for (const e of edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t || (s.parent === undefined && t.parent === undefined)) continue;
    const topS = byId.get(framesOf(byId, s.id).at(-1) ?? s.id)!;
    const topT = byId.get(framesOf(byId, t.id).at(-1) ?? t.id)!;
    if (topS !== topT) out.set(e, { s, t, topS, topT });
  }
  return out;
}

/**
 * This function gives the routes of the edges between frames, and the inner routes of `inner`. Each edge between frames gets three legs.
 * The first leg goes from the source to a plug of the wall of its top frame. The outer leg goes from that plug to a plug of the top frame of the target.
 * It goes around the other top nodes. The last leg goes from that plug to the target. An end at the top level has no inner leg.
 * The inner legs and the inner edges route together, so that they share the rooms. When a leg has no route, the edge gets the outer way between its two ends.
 */
function crossRoutes(
  graph: Graph,
  lifts: ReadonlyMap<Edge, Lift>,
  inner: readonly FrameItem[],
  ways: WayFinder,
  options: CornersOptions,
): { readonly cross: Map<Edge, Route>; readonly innerRoutes: Route[] } {
  const items: FrameItem[] = [...inner];
  const leg = (e: Edge, top: Node, end: Edge["source"], wall: Plug): number =>
    items.push({ edge: { ...e, source: { node: top.id }, target: end }, frame: top.id, plug: "source", wall }) - 1;
  const plan: { e: Edge; lift: Lift; ps: Plug; pt: Plug; from: number | undefined; to: number | undefined }[] = [];
  for (const [e, lift] of lifts) {
    const { s, t, topS, topT } = lift;
    const ps = s === topS ? placePlug(s, e.source, center(topT.box)) : placePlug(topS, { node: topS.id }, center(topT.box));
    const pt = t === topT ? placePlug(t, e.target, center(topS.box)) : placePlug(topT, { node: topT.id }, center(topS.box));
    plan.push({ e, lift, ps, pt, from: s === topS ? undefined : leg(e, topS, e.source, ps), to: t === topT ? undefined : leg(e, topT, e.target, pt) });
  }
  const list = frameRouteList(graph, items, options);
  const cross = new Map<Edge, Route>();
  for (const { e, lift, ps, pt, from, to } of plan) {
    const first = from === undefined ? undefined : list[from];
    const last = to === undefined ? undefined : list[to];
    if ((from !== undefined && !first) || (to !== undefined && !last)) {
      // A leg with no route: the outer way between the two ends, as before CROSS-FRAME-ROUTE.
      const a = placePlug(lift.s, e.source, center(lift.t.box));
      const b = placePlug(lift.t, e.target, center(lift.s.box));
      const ends = (id: string): boolean => id === lift.s.id || id === lift.t.id;
      cross.set(e, markRoute({ edge: e.id, points: ways.between(a, b, new Set<Node>([lift.s, lift.t])) }, ways.obstacles, ends));
      continue;
    }
    const tops = (id: string): boolean => id === lift.topS.id || id === lift.topT.id;
    const outer = markRoute({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([lift.topS, lift.topT])) }, ways.obstacles, tops);
    const points = joinPoints([...(first ? [...first.points].reverse() : []), ...outer.points, ...(last ? last.points : [])]);
    const through = [...new Set([...(first?.through ?? []), ...(outer.through ?? []), ...(last?.through ?? [])])].sort();
    cross.set(e, { edge: e.id, points, ...(through.length > 0 ? { through } : {}) });
  }
  return { cross, innerRoutes: list.slice(0, inner.length).filter((r): r is Route => r !== undefined) };
}

/**
 * This function joins the legs of a route. It removes each point that is equal to the point before it, so that the legs meet in one point.
 * It also removes each inner stop on a straight line between its two neighbours, because that stop is not a bend. A turn back stays.
 */
function joinPoints(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    if (out.length > 0 && dist(p, out.at(-1)!) === 0) continue;
    if (out.length >= 2 && onLine(out.at(-2)!, out.at(-1)!, p)) out.pop();
    out.push(p);
  }
  return out;
}

/** This function tells if b is a stop on the straight line from a to c, in the same direction. */
function onLine(a: Point, b: Point, c: Point): boolean {
  const [ux, uy, vx, vy] = [b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y];
  // The test |u × v| ≤ 1e-9·|u|·|v| with squares on both sides, so it needs no square root.
  const cross = ux * vy - uy * vx;
  return cross * cross <= 1e-18 * (ux * ux + uy * uy) * (vx * vx + vy * vy) && ux * vx + uy * vy > 0;
}
