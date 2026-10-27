import { center, dist, type Point } from "../geom.ts";
import { nodeIndex, type Bundle, type Edge, type Graph, type GroupRule, type Node, type Result, type Route, type Router, type SharedRun } from "../model.ts";
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
  /**
   * The place where each lane leaves the trunk. With `part`, the default, a lane leaves where its way parts from the ways of the other lanes.
   * A lane that turns back over the trunk leaves at an earlier point of the trunk. With `split`, each lane leaves at the split point, as in version 0.2.0.
   */
  readonly leave?: TrunkLeave;
  /** The benchmark skips a fixture with more nodes. */
  readonly maxNodes?: number;
}

/** The place where the lanes of a trunk leave it: where their ways part, or at the split point. */
export type TrunkLeave = "part" | "split";

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

/** The place where a branch leaves its trunk. */
export interface TrunkExit {
  /** The place along the trunk: the index of a point of the trunk, plus the share of the next leg. Point `i` of the trunk is at `i`. */
  readonly at: number;
  /** The point where the branch leaves the trunk. */
  readonly point: Point;
  /** The branch past `point`, to the plug of the target. */
  readonly rest: readonly Point[];
}

/**
 * This function gives the place where a branch leaves its trunk. The branch starts at the last point of the trunk and ends at the plug of the target.
 *
 * A branch that turns back over the trunk, by more than 90 degrees, leaves at the point of the trunk before.
 * It does so when it goes back along the trunk to that point. It also does so when `clear` tells that the line from that point is free.
 * The first two legs of the trunk stay. When the branch still turns back, it leaves the last leg at the foot of its next point, if the line from there is free.
 * Each step makes the route shorter or keeps its length.
 *
 * The function gives `undefined` when the foot on the second leg of the trunk is less than `min` past the start of that leg.
 * Then the target is behind or beside the plug, and the edge does not go well in the bundle.
 */
export function leaveTrunk(trunk: readonly Point[], branch: readonly Point[], clear: (a: Point, b: Point) => boolean, min = 0): TrunkExit | undefined {
  const back = (a: Point, b: Point, q: Point): boolean => (b.x - a.x) * (q.x - b.x) + (b.y - a.y) * (q.y - b.y) < 0;
  let at = trunk.length - 1;
  let rest = branch.slice(1);
  while (at >= 3 && rest.length >= 2) {
    const a = trunk[at - 1]!;
    if (!back(a, trunk[at]!, rest[0]!)) break;
    const next = dist(rest[0]!, a) <= 1e-9 ? rest.slice(1) : rest;
    if (next === rest && !clear(a, rest[0]!)) break;
    rest = next;
    at -= 1;
  }
  const exit: TrunkExit = { at, point: trunk[at]!, rest };
  if (at < 1 || rest.length < 2 || !back(trunk[at - 1]!, trunk[at]!, rest[0]!)) return exit;
  const a = trunk[at - 1]!;
  const b = trunk[at]!;
  const q = rest[0]!;
  const u = ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  if (at <= 2 ? u * Math.hypot(b.x - a.x, b.y - a.y) < min : u <= 0) return at <= 2 ? undefined : exit;
  const foot = { x: a.x + u * (b.x - a.x), y: a.y + u * (b.y - a.y) };
  return at >= 2 && clear(foot, q) ? { at: at - 1 + u, point: foot, rest } : exit;
}

/** This function gives the number of points at the start of each route that all the routes share. */
function commonStart(routes: readonly Route[], from: number): number {
  const first = routes[0]!.points;
  let n = from;
  while (n < first.length && routes.every((r) => n < r.points.length && dist(r.points[n]!, first[n]!) <= 1e-9)) n++;
  return n;
}

/**
 * This function gives the shared ways of the routes of one bundle past the trunk. The routes share their first `from` points.
 * At the last of these points, the routes part. The routes that go on to one next point share a way to the point where they part again.
 * Each shared way has two edges or more, in the order of the routes.
 */
export function sharedWays(routes: readonly Route[], from: number): { points: Point[]; edges: string[] }[] {
  const out: { points: Point[]; edges: string[] }[] = [];
  const next = new Map<string, Route[]>();
  for (const r of routes) {
    const q = r.points[from];
    if (!q) continue;
    const key = `${q.x},${q.y}`;
    const list = next.get(key);
    if (list) list.push(r);
    else next.set(key, [r]);
  }
  for (const list of next.values()) {
    if (list.length < 2) continue;
    const end = commonStart(list, from);
    out.push({ points: list[0]!.points.slice(from - 1, end), edges: list.map((r) => r.edge) });
    out.push(...sharedWays(list, end));
  }
  return out;
}

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
      const points = new Map<string, readonly Point[]>();
      const bundles: Bundle[] = [];
      const runs: SharedRun[] = [];
      const part = (options.leave ?? "part") === "part";
      // A branch leaves the trunk early only on a line that keeps out of the boxes as far as the corner graph does.
      const clear = (a: Point, b: Point): boolean => ways.obstacles.clear(a, b, ways.margin / 2);
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
        const exits: { edge: string; exit: TrunkExit }[] = [];
        group.forEach((e, i) => {
          const pt = placePlug(targets[i]!, e.target, end);
          const branch = dedupe(ways.toPlug(end, pt) ?? [end, pt.point]);
          if (!part) {
            own.push({ edge: e.id, points: dedupe([...trunk, ...branch.slice(1)]) });
            branches.push({ edge: e.id, next: branch[1] ?? pt.point });
            return;
          }
          // An edge whose target is behind the plug goes alone, as an edge outside the groups.
          const exit = leaveTrunk(trunk, branch, clear, 2 * ways.margin);
          if (exit) exits.push({ edge: e.id, exit });
        });
        const key = id.split("\u0000")[2]!;
        if (!part) {
          for (const r of own) points.set(r.edge, r.points);
          const edges = options.laneOrder === "run" || trunk.length < 2 ? laneOrder(dir, end, branches) : orderLanes(trunk, own, "bundle");
          bundles.push({ id: `b${bundles.length}`, key, node: s.id, edges, trunk });
          continue;
        }
        // A group that keeps fewer than `minSize` edges stays unbundled.
        if (exits.length < (options.minSize ?? 2)) continue;
        // The trunk gets a point at each place where a branch leaves it. Thus each route holds the points of the trunk up to its exit.
        const stops = new Map<number, Point>(trunk.map((p, i) => [i, p]));
        for (const { exit } of exits) if (!stops.has(exit.at)) stops.set(exit.at, exit.point);
        const line = [...stops].sort((x, y) => x[0] - y[0]);
        for (const { edge, exit } of exits) {
          const p = dedupe([...line.filter(([at]) => at <= exit.at).map(([, q]) => q), ...exit.rest]);
          points.set(edge, p);
          own.push({ edge, points: p });
        }
        // The bundle keeps the points that all the routes share. Past them, the routes that go on together share a run.
        const order = options.laneOrder ?? "bundle";
        const common = own[0]!.points.slice(0, commonStart(own, 0));
        bundles.push({ id: `b${bundles.length}`, key, node: s.id, edges: orderLanes(common, own, order), trunk: common });
        for (const way of sharedWays(own, common.length)) {
          const users = own.filter((r) => way.edges.includes(r.edge));
          runs.push({ id: `r${runs.length}`, key, points: way.points, edges: orderLanes(way.points, users, order) });
        }
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
      return runs.length > 0 ? { routes, bundles, runs } : { routes, bundles };
    },
  };
  return options.maxNodes === undefined ? router : { ...router, maxNodes: options.maxNodes };
}
