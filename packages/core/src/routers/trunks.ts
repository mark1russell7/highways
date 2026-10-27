import { center, dist, type Point } from "../geom.ts";
import { nodeIndex, type Bundle, type Edge, type Graph, type GroupRule, type Node, type Result, type Route, type Router } from "../model.ts";
import { placePlug, type Plug } from "../plugs.ts";
import { orderLanes, type RunOrder } from "../segments.ts";
import { WayFinder, type WayOptions } from "../ways.ts";

/** The options of the trunk router. */
export interface TrunksOptions extends WayOptions {
  /** The name in the benchmark. */
  readonly name: string;
  /** The grouping rule. The edges from one plug with one key share a trunk. */
  readonly rule: GroupRule;
  /** The split point is at this share of the way to the center of the targets. The default is 0.5. */
  readonly split?: number;
  /** A group with fewer edges stays unbundled. The default is 2. */
  readonly minSize?: number;
  /** The lane order of a trunk. With `bundle`, the default, the branches part in lane order. With `run`, the first leg of each branch tells the order. */
  readonly laneOrder?: RunOrder;
  /** The benchmark skips a fixture with more nodes. */
  readonly maxNodes?: number;
}

/** The rule that groups the edges by the collection of their target, in `data.collection`. */
export const byCollection: GroupRule = (e) => {
  const c = e.data?.["collection"];
  return typeof c === "string" ? c : undefined;
};

/**
 * This function groups the edges by their source plug and their key. Each group keeps the order of the edges.
 * A group with fewer than `minSize` edges does not appear.
 */
export function groupEdges(edges: readonly Edge[], rule: GroupRule, minSize = 2): Map<string, Edge[]> {
  const all = new Map<string, Edge[]>();
  for (const e of edges) {
    const key = rule(e);
    if (key === undefined) continue;
    const id = `${e.source.node}\u0000${e.source.port ?? ""}\u0000${key}`;
    const list = all.get(id);
    if (list) list.push(e);
    else all.set(id, [e]);
  }
  for (const [id, list] of all) if (list.length < minSize) all.delete(id);
  return all;
}

/**
 * This function gives the lane order of the branches that leave the split point `from`, with the trunk along `dir`.
 * Lane 0 turns most to the left, in a frame with the y axis down. Thus two lanes do not cross at the split.
 */
export function laneOrder(dir: Point, from: Point, branches: readonly { readonly edge: string; readonly next: Point }[]): string[] {
  const angle = (p: Point): number => {
    const vx = p.x - from.x;
    const vy = p.y - from.y;
    return Math.atan2(dir.x * vy - dir.y * vx, dir.x * vx + dir.y * vy);
  };
  return branches
    .map((b) => ({ edge: b.edge, a: angle(b.next) }))
    .sort((p, q) => p.a - q.a || (p.edge < q.edge ? -1 : p.edge > q.edge ? 1 : 0))
    .map((x) => x.edge);
}

/**
 * This function gives the split point of a bundle, on the line from `start` to the center of the targets.
 * The point is at `split` of the way, but at most half of the way to the nearest target. It moves back toward `start` out of the boxes.
 */
export function splitPoint(start: Point, targets: readonly Point[], split: number, free: (p: Point) => boolean, step: number): Point {
  if (targets.length === 0) return start;
  const c = { x: targets.reduce((s, p) => s + p.x, 0) / targets.length, y: targets.reduce((s, p) => s + p.y, 0) / targets.length };
  const L = dist(start, c);
  if (L === 0) return start;
  let d = Math.min(split * L, 0.5 * Math.min(...targets.map((p) => dist(start, p))));
  const at = (t: number): Point => ({ x: start.x + ((c.x - start.x) * t) / L, y: start.y + ((c.y - start.y) * t) / L });
  while (d > 0 && !free(at(d))) d -= step;
  return d > 0 ? at(d) : start;
}

const dedupe = (p: readonly Point[]): Point[] => p.filter((q, i) => i === 0 || dist(q, p[i - 1]!) > 1e-9);

/**
 * This function makes a router that bundles the edges by a rule. The edges of a group share one plug and one trunk
 * to a split point. From there, each edge goes its own way. The router gives the bundles with their lane order.
 * The edges outside the groups go as in the corner router.
 */
export function trunksRouter(options: TrunksOptions): Router {
  const router: Router = {
    name: options.name,
    route(graph: Graph): Result {
      const byId = nodeIndex(graph);
      const ways = new WayFinder(graph.nodes, options);
      const points = new Map<string, Point[]>();
      const bundles: Bundle[] = [];
      for (const [id, group] of groupEdges(graph.edges, options.rule, options.minSize ?? 2)) {
        const first = group[0]!;
        const s = byId.get(first.source.node);
        const targets = group.map((e) => byId.get(e.target.node));
        if (!s || targets.some((t) => !t)) continue;
        const centers = targets.map((t) => center(t!.box));
        const c = { x: centers.reduce((a, p) => a + p.x, 0) / centers.length, y: centers.reduce((a, p) => a + p.y, 0) / centers.length };
        const plug: Plug = placePlug(s, first.source, c);
        const start = ways.out(plug);
        const split = splitPoint(start, centers, options.split ?? 0.5, (p) => !ways.obstacles.inside(p, ways.margin), ways.margin);
        const way = ways.fromPlug(plug, split);
        if (!way) continue;
        const trunk = dedupe(way);
        const end = trunk[trunk.length - 1]!;
        const prev = trunk.length >= 2 ? trunk[trunk.length - 2]! : plug.point;
        const len = dist(prev, end);
        const dir = len > 0 ? { x: (end.x - prev.x) / len, y: (end.y - prev.y) / len } : plug.normal;
        const branches: { edge: string; next: Point }[] = [];
        const own: Route[] = [];
        group.forEach((e, i) => {
          const pt = placePlug(targets[i]!, e.target, end);
          const branch = dedupe(ways.toPlug(end, pt) ?? [end, pt.point]);
          const p = dedupe([...trunk, ...branch.slice(1)]);
          points.set(e.id, p);
          own.push({ edge: e.id, points: p });
          branches.push({ edge: e.id, next: branch[1] ?? pt.point });
        });
        const edges = options.laneOrder === "run" || trunk.length < 2 ? laneOrder(dir, end, branches) : orderLanes(trunk, own, "bundle");
        bundles.push({ id: `b${bundles.length}`, key: id.split("\u0000")[2]!, node: s.id, edges, trunk });
      }
      const routes: Route[] = [];
      for (const e of graph.edges) {
        const s = byId.get(e.source.node);
        const t = byId.get(e.target.node);
        if (!s || !t) continue;
        const known = points.get(e.id);
        if (known) {
          routes.push({ edge: e.id, points: known });
          continue;
        }
        const ps = placePlug(s, e.source, center(t.box));
        const pt = placePlug(t, e.target, center(s.box));
        routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
      }
      return { routes, bundles };
    },
  };
  return options.maxNodes === undefined ? router : { ...router, maxNodes: options.maxNodes };
}
