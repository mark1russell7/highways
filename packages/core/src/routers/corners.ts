import { center, type Point } from "../geom.ts";
import { nodeIndex, fixedPortPoint, resolvePorts, type Edge, type Graph, type Node, type Result, type Route, type Router } from "../model.ts";
import { placePlug, type Plug } from "../plugs.ts";
import { justifyPlugs } from "../plugs/justify.ts";
import { sidePlugs } from "../plugs/side.ts";
import type { PlugPair, Strategy } from "../strategies/model.ts";
import { WayFinder, type WayOptions } from "../ways.ts";

/** The ways to place a free plug of the corner router. */
export type PlugPlace = "facing" | "side";

/** The options of the corner router. */
export interface CornersOptions extends WayOptions {
  /** The name in the benchmark. */
  readonly name: string;
  /** The benchmark skips a fixture with more nodes. */
  readonly maxNodes?: number;
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
 */
export function cornersRouter(options: CornersOptions): Router {
  const router: Router = {
    name: options.name,
    route(input: Graph): Result {
      const graph = resolvePorts(input);
      const byId = nodeIndex(graph);
      const ways = new WayFinder(graph.nodes, options);
      const routes: Route[] = [];
      if (!options.plug && (options.plugs ?? "facing") === "facing" && !((options.plugGap ?? 0) > 0)) {
        for (const e of graph.edges) {
          const s = byId.get(e.source.node);
          const t = byId.get(e.target.node);
          if (!s || !t) continue;
          const ps = placePlug(s, e.source, center(t.box));
          const pt = placePlug(t, e.target, center(s.box));
          routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
        }
        return { routes };
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
      return { routes };
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

/**
 * This function moves the free plugs of each side of each node, so that two of them are at least `gap` apart (`justifyPlugs`).
 * The plugs keep their order on the side. Two plugs at one place take the order of their other ends. A fixed plug does not move.
 */
function spacePlugs(ends: [Edge, Node, Node, Plug, Plug][], gap: number): void {
  const inset = 6;
  // The free plugs of each side: the index of the edge, the end (3 for the source, 4 for the target) and the point of the other end.
  const sides = new Map<string, { node: Node; normal: Point; items: [number, 3 | 4, Point][] }>();
  ends.forEach(([e, s, t, ps, pt], i) => {
    for (const [end, node, plug, other, k] of [
      [e.source, s, ps, pt, 3],
      [e.target, t, pt, ps, 4],
    ] as const) {
      if (fixedPortPoint(node, end) !== undefined) continue;
      const key = JSON.stringify([node.id, plug.normal.x, plug.normal.y]);
      let side = sides.get(key);
      if (!side) sides.set(key, (side = { node, normal: plug.normal, items: [] }));
      side.items.push([i, k, other.point]);
    }
  });
  for (const { node, normal, items } of sides.values()) {
    if (items.length < 2) continue;
    const along = normal.x !== 0 ? "y" : "x";
    const b = node.box;
    const start = along === "y" ? b.y : b.x;
    const len = along === "y" ? b.h : b.w;
    const m = Math.min(inset, len / 4);
    const ideal = items.map(([i, k]) => ends[i]![k].point[along]);
    const placed = justifyPlugs(ideal, start + m, start + len - m, gap, (j) => items[j]![2][along]);
    items.forEach(([i, k], j) => {
      const old = ends[i]![k];
      ends[i]![k] = { point: along === "y" ? { x: old.point.x, y: placed[j]! } : { x: placed[j]!, y: old.point.y }, normal: old.normal };
    });
  }
}
