import { center, dist, type Point } from "../geom.ts";
import { nodeIndex, type Edge, type Graph, type GroupRule, type Result, type Route, type Router, type SharedRun } from "../model.ts";
import { channelWidth } from "../channels.ts";
import { orderRun } from "../lane-order.ts";
import { stretchLaneOrders, type LaneStretchOrder } from "../lane-orders/stretch/index.ts";
import { byText } from "../compare.ts";
import { placePlug, type Plug } from "../plugs.ts";
import { buildSections, type Section } from "../sections.ts";
import { orderLanes, type RunOrder } from "../segments.ts";
import { WayFinder, type WayOptions } from "../ways.ts";
import { snellMerges } from "./snell.ts";
import { groupRuleOf, type GroupRuleName } from "./trunks.ts";

/** The cost of a link that edges of one key share: a fixed discount, or the flow cost `len * f^alpha` (EDA-029). */
export type ShareCost = "fixed" | "flow";

/** The order of the edges of one key: the longest first, the shortest first, the most load first, or the order of the input (NAT-024). */
export type ShareOrder = "span" | "shortest" | "load" | "input";

/** The place where a route joins or leaves a run: at a corner of the graph, or at the Snell angle (NAT-035). */
export type ShareMerge = "corner" | "snell";

/** The options of the router with shared ways. */
export interface SharedOptions extends WayOptions {
  /** The name in the benchmark. */
  readonly name: string;
  /**
   * The edges with one key share their ways. The option takes a rule or the name of a built-in rule (`GROUP_RULE_NAMES`).
   * Without a rule, or with `all`, all edges share. An edge without a key shares with no edge.
   */
  readonly rule?: GroupRule | GroupRuleName;
  /** The cost of a link that an edge with the same key uses already, as a share of its length. The default is 0.5. */
  readonly discount?: number;
  /** The lane order of the runs. With `bundle`, the default, two edges keep one order on each run of their common stretch. With `run`, each run gets its order alone. */
  readonly laneOrder?: RunOrder;
  /**
   * The lane order of each stretch of runs (LANE-STRETCH). With `none`, the default, each run gets its order alone.
   * With `consensus`, `periphery` or `sifting`, the runs that follow each other on the routes share one order. Only the lane order `bundle` reads it.
   */
  readonly stretchOrder?: LaneStretchOrder;
  /** The number of passes of the stretch order `sifting`, from 1 to 4. The default is 2. */
  readonly siftPasses?: number;
  /**
   * The cost of a shared link. With `fixed`, the default, a link that the key uses already costs `discount` times its length.
   * With `flow`, one more edge on a link with `f` edges costs `len * ((f + 1)^alpha - f^alpha)` (EDA-029).
   */
  readonly cost?: ShareCost;
  /** The exponent of the flow cost, from 0.1 to 1. A smaller value gives more sharing. The default is 0.6. Only the cost `flow` uses it. */
  readonly alpha?: number;
  /** The number of passes. In each pass after the first, each edge leaves its links and finds its way again with the others fixed (HWY-039). The default is 1. */
  readonly passes?: number;
  /**
   * The order of the edges of one key. With `span`, the default, the longest edge goes first. With `shortest`, the shortest edge goes first.
   * With `load`, the edge with the most edges between its two sections goes first. With `input`, the edges keep the order of the graph (NAT-024).
   */
  readonly order?: ShareOrder;
  /**
   * The place where a route joins or leaves a run. With `corner`, the default, it is a corner of the graph.
   * With `snell`, the route meets the run at the angle `acos(d)`, with `d` the cost share of the run for the route (NAT-035).
   */
  readonly merge?: ShareMerge;
  /**
   * The pull of the busy links of the pass before (HWY-005, Winding Roads). With a value above 0 and two passes or more, each later pass routes each edge again from no ways.
   * A link then costs `len / (1 + reuse * u)^reuseExponent`, with `u` the edges of the key on it in the pass before. The default is 0: the later passes are rip-up passes.
   */
  readonly reuse?: number;
  /** The exponent of the pull of `reuse`. The default is 1. */
  readonly reuseExponent?: number;
  /**
   * The cost of a lane that does not fit in its channel (HWY-016). One more edge on a link with `f` edges of the key costs `capacity * max(0, (f + 1) * laneWidth - width)` more.
   * `width` is the free space across the link (`channelWidth`). The default is 0: the router does not read the channels.
   */
  readonly capacity?: number;
  /** The width of one lane, for `capacity`. The default is 4. */
  readonly laneWidth?: number;
  /** The benchmark skips a fixture with more nodes. */
  readonly maxNodes?: number;
}

/** A way of one edge through the corner graph. */
export interface Way {
  readonly edge: Edge;
  readonly key: string;
  readonly ps: Plug;
  readonly pt: Plug;
  /** The way through the corner graph, from the point out of the source plug to the point out of the target plug. */
  seq: Point[];
  /** The index of each point of `seq` in the corner graph. The two ends get an index after the corners, one for each place. */
  ids: number[];
  found: boolean;
}

interface Run {
  readonly key: string;
  readonly first: number;
  readonly last: number;
  /** The points from the corner `first` to the corner `last`, without the needless corners. */
  readonly points: Point[];
  readonly ways: Way[];
}

/** The angle, from -π to π, of the turn at `base` from the direction `from` → `base` to the point `to`. */
function turn(from: Point, base: Point, to: Point): number {
  const dx = base.x - from.x;
  const dy = base.y - from.y;
  const vx = to.x - base.x;
  const vy = to.y - base.y;
  return Math.atan2(dx * vy - dy * vx, dx * vx + dy * vy);
}

/**
 * This function makes a router where edges share their ways (after Pupyrev, Nachmanson, Bereg and Holroyd, "Edge routing with ordered bundles").
 * The edges go one by one through the corner graph. A link that an edge with the same key uses already costs less.
 * Thus the edges of a key come together on common ways. Each stretch that several edges share has the same points in each route.
 * The result gives each stretch as a run, with the order of its lanes.
 */
export function sharedRouter(options: SharedOptions): Router {
  const discount = Math.min(1, Math.max(0.05, options.discount ?? 0.5));
  const flow = options.cost === "flow";
  const alpha = Math.min(1, Math.max(0.1, options.alpha ?? 0.6));
  // The cost share of a link for one more edge, when `f` edges of the key use it already. The share falls when `f` grows.
  const share = (f: number): number => (f <= 0 ? 1 : flow ? (f + 1) ** alpha - f ** alpha : discount);
  const passes = Math.max(1, Math.floor(options.passes ?? 1));
  const reuse = Math.max(0, options.reuse ?? 0);
  const reuseExponent = Math.max(0, options.reuseExponent ?? 1);
  const capacity = Math.max(0, options.capacity ?? 0);
  const laneWidth = Math.max(0, options.laneWidth ?? 4);
  // The name `all` is the same as no rule.
  const rule = options.rule === undefined || options.rule === "all" ? undefined : groupRuleOf(options.rule);
  const keyOf = (e: Edge): string => {
    if (!rule) return "*";
    return rule(e) ?? `\u0000${e.id}`;
  };
  const router: Router = {
    name: options.name,
    route(graph: Graph): Result {
      const byId = nodeIndex(graph);
      const ways = new WayFinder(graph.nodes, options);
      const corners = ways.corners;
      const index = new Map<Point, number>();
      corners.points.forEach((p, i) => index.set(p, i));
      const M = corners.points.length + 1;
      const link = (i: number, j: number): number => (i < j ? i * M + j : j * M + i);
      const ends = new Map<string, number>();
      const endId = (p: Point): number => {
        const k = `${p.x},${p.y}`;
        let id = ends.get(k);
        if (id === undefined) ends.set(k, (id = corners.points.length + ends.size));
        return id;
      };

      const all: Way[] = [];
      for (const e of graph.edges) {
        const s = byId.get(e.source.node);
        const t = byId.get(e.target.node);
        if (!s || !t) continue;
        const ps = placePlug(s, e.source, center(t.box));
        const pt = placePlug(t, e.target, center(s.box));
        all.push({ edge: e, key: keyOf(e), ps, pt, seq: [], ids: [], found: false });
      }

      // The edges of one key go one after the other, by default the longest first, so that the short edges join the long ways.
      const discounted = new Map<string, Map<number, string[]>>();
      const order = orderWays(all, options.order ?? "span", graph);
      // The largest number of edges on one link of each key. The cost share of that number is the floor of the search.
      const top = new Map<string, number>();
      // The width of the channel of each link, for the option `capacity`. Each link gets its width at its first use.
      const widths = new Map<number, number>();
      const widthOf = (i: number, j: number): number => {
        const k = link(i, j);
        let wd = widths.get(k);
        if (wd === undefined) widths.set(k, (wd = channelWidth(ways.obstacles, corners.points[i]!, corners.points[j]!)));
        return wd;
      };
      /** This function routes one way. `before` holds the edges of the key on each link in the pass before, for the option `reuse`. */
      const route = (w: Way, before?: ReadonlyMap<number, number>): void => {
        let used = discounted.get(w.key);
        if (!used) discounted.set(w.key, (used = new Map()));
        const mine = used;
        let floor = flow ? share(top.get(w.key) ?? 0) : discount;
        let cost = flow
          ? (i: number, j: number, d: number): number => d * share(mine.get(link(i, j))?.length ?? 0)
          : (i: number, j: number, d: number): number => (mine.has(link(i, j)) ? d * discount : d);
        if (capacity > 0) {
          const plain = cost;
          cost = (i, j, d) => plain(i, j, d) + capacity * Math.max(0, ((mine.get(link(i, j))?.length ?? 0) + 1) * laneWidth - widthOf(i, j));
        }
        if (before !== undefined) {
          const plain = cost;
          let most = 0;
          for (const u of before.values()) most = Math.max(most, u);
          cost = (i, j, d) => plain(i, j, d) / (1 + reuse * (before.get(link(i, j)) ?? 0)) ** reuseExponent;
          floor /= (1 + reuse * most) ** reuseExponent;
        }
        const way = corners.path(ways.out(w.ps), ways.out(w.pt), cost, floor);
        if (!way) return;
        w.found = true;
        w.seq = way;
        w.ids = way.map((p, i) => (i === 0 || i === way.length - 1 ? endId(p) : index.get(p)!));
        for (let i = 1; i < w.ids.length; i++) {
          const a = w.ids[i - 1]!;
          const b = w.ids[i]!;
          if (a >= corners.points.length || b >= corners.points.length) continue;
          const list = mine.get(link(a, b));
          if (list) list.push(w.edge.id);
          else mine.set(link(a, b), [w.edge.id]);
          if (flow) top.set(w.key, Math.max(top.get(w.key) ?? 0, mine.get(link(a, b))!.length));
        }
      };
      for (const w of order) route(w);
      // Each later pass takes each edge off its links and finds its way again, with the ways of the other edges fixed.
      for (let pass = 1; pass < passes; pass++) {
        if (reuse > 0) {
          // Winding Roads (HWY-005): each edge finds its way again from no ways, and the busy links of the pass before pull it.
          const before = new Map<string, Map<number, number>>();
          for (const [key, links] of discounted) before.set(key, new Map([...links].map(([k, list]) => [k, list.length])));
          discounted.clear();
          top.clear();
          for (const w of order) {
            w.found = false;
            w.seq = [];
            w.ids = [];
          }
          for (const w of order) route(w, before.get(w.key) ?? new Map());
          continue;
        }
        for (const w of order) {
          if (!w.found) continue;
          const mine = discounted.get(w.key)!;
          for (let i = 1; i < w.ids.length; i++) {
            const a = w.ids[i - 1]!;
            const b = w.ids[i]!;
            if (a >= corners.points.length || b >= corners.points.length) continue;
            const k = link(a, b);
            const list = mine.get(k);
            if (!list) continue;
            const at = list.indexOf(w.edge.id);
            if (at >= 0) list.splice(at, 1);
            if (list.length === 0) mine.delete(k);
          }
          w.found = false;
          w.seq = [];
          w.ids = [];
          route(w);
        }
      }

      // With `merge: snell`, each route that joins or leaves a run moves its merge point along the run to the Snell angle.
      if (options.merge === "snell") {
        const pad = ways.margin / 2;
        snellMerges(order, corners.points.length + ends.size, (a, b) => ways.obstacles.clear(a, b, pad), (f) => Math.min(0.95, share(f)));
      }

      // The users of each link, with the links to the ends. Two edges from one plug share the link from it.
      const N = corners.points.length + ends.size + 1;
      const pairOf = (a: number, b: number): number => (a < b ? a * N + b : b * N + a);
      const users = new Map<string, Map<number, string[]>>();
      for (const w of order) {
        if (!w.found) continue;
        let mine = users.get(w.key);
        if (!mine) users.set(w.key, (mine = new Map()));
        for (let i = 1; i < w.ids.length; i++) {
          const k = pairOf(w.ids[i - 1]!, w.ids[i]!);
          const list = mine.get(k);
          if (list) list.push(w.edge.id);
          else mine.set(k, [w.edge.id]);
        }
      }
      // The signature of each link (ROUTE-SCALE): 0 for a link with fewer than 2 users, else the number of the sorted list of its users.
      // Each link gets its signature one time. Two links get the same number only when they have the same sorted list, so the runs do not change.
      const texts = new Map<string, number>();
      const sigs = new Map<string, Map<number, number>>();
      for (const [key, mine] of users) {
        const own = new Map<number, number>();
        for (const [k, list] of mine) {
          if (list.length < 2) {
            own.set(k, 0);
            continue;
          }
          const text = [...list].sort(byText).join("\u0001");
          let n = texts.get(text);
          if (n === undefined) texts.set(text, (n = texts.size + 1));
          own.set(k, n);
        }
        sigs.set(key, own);
      }

      // Each way breaks into stretches where the set of edges on the links stays the same.
      // A shared stretch loses its needless corners one time, so it has the same points in each of its routes.
      const runs = new Map<string, Run>();
      const points = new Map<string, Point[]>();
      for (const w of all) {
        if (!w.found) continue;
        const own = sigs.get(w.key)!;
        const sig = (i: number): number => own.get(pairOf(w.ids[i]!, w.ids[i + 1]!))!;
        const out: Point[] = [w.ps.point];
        const append = (piece: readonly Point[]): void => {
          for (const p of piece) if (dist(p, out[out.length - 1]!) > 1e-9) out.push(p);
        };
        let start = 0;
        for (let i = 0; i < w.seq.length - 1; i++) {
          const s = sig(i);
          if (i + 1 < w.seq.length - 1 && sig(i + 1) === s) continue;
          const raw = w.seq.slice(start, i + 2);
          if (s === 0) append(corners.pull(raw));
          else {
            const a = w.ids[start]!;
            const b = w.ids[i + 1]!;
            const id = `${s}\u0002${Math.min(a, b)}\u0002${Math.max(a, b)}`;
            let run = runs.get(id);
            if (!run) {
              run = { key: w.key, first: Math.min(a, b), last: Math.max(a, b), points: corners.pull(a < b ? raw : [...raw].reverse()), ways: [] };
              runs.set(id, run);
            }
            run.ways.push(w);
            append(a < b ? run.points : [...run.points].reverse());
          }
          start = i + 1;
        }
        append([w.pt.point]);
        points.set(w.edge.id, out);
      }

      const routes: Route[] = [];
      for (const w of all) routes.push({ edge: w.edge.id, points: points.get(w.edge.id) ?? [w.ps.point, w.pt.point] });
      const shared: SharedRun[] = [];
      const routeOf = new Map(routes.map((r) => [r.edge, r]));
      const list = [...runs.values()];
      const routesOf = (run: Run): Route[] => run.ways.map((w) => routeOf.get(w.edge.id)!);
      // With a stretch order, the runs that follow each other on the routes share one lane order (LANE-STRETCH).
      const method = options.laneOrder === "run" ? "none" : (options.stretchOrder ?? "none");
      const stretch = method === "none" ? undefined : stretchLaneOrders(list.map((run) => ({ points: run.points, routes: routesOf(run) })), { method, passes: options.siftPasses ?? 2 });
      list.forEach((run, i) => {
        const edges = options.laneOrder === "run" ? laneOrderOfRun(run) : (stretch?.[i] ?? orderLanes(run.points, routesOf(run), "bundle"));
        shared.push({ id: `r${shared.length}`, key: run.key, points: run.points, edges });
      });
      return { routes, runs: shared };
    },
  };
  return options.maxNodes === undefined ? router : { ...router, maxNodes: options.maxNodes };
}

/**
 * This function gives the order of the ways for the router `shared`. The ways of one key stay together, in the order of the keys.
 * In a key, the order is `order`, and the edge id breaks each tie. The order `load` counts the edges of the key between the same two sections.
 */
function orderWays(all: readonly Way[], order: ShareOrder, graph: Graph): Way[] {
  const span = (w: Way): number => dist(w.ps.point, w.pt.point);
  if (order === "input") {
    const at = new Map(all.map((w, i) => [w, i]));
    return [...all].sort((p, q) => byText(p.key, q.key) || at.get(p)! - at.get(q)!);
  }
  if (order === "shortest") return [...all].sort((p, q) => byText(p.key, q.key) || span(p) - span(q) || byText(p.edge.id, q.edge.id));
  if (order === "span") return [...all].sort((p, q) => byText(p.key, q.key) || span(q) - span(p) || byText(p.edge.id, q.edge.id));
  // The leaf section of each node, then the number of edges of each key between each pair of leaves.
  const leafOf = new Map<string, string>();
  const walk = (s: Section): void => {
    if (s.children.length === 0) for (const i of s.nodes) leafOf.set(graph.nodes[i]!.id, s.id);
    for (const c of s.children) walk(c);
  };
  walk(buildSections(graph.nodes));
  const pair = (w: Way): string => {
    const a = leafOf.get(w.edge.source.node) ?? "";
    const b = leafOf.get(w.edge.target.node) ?? "";
    return `${w.key}\u0000${a < b ? a : b}\u0000${a < b ? b : a}`;
  };
  const load = new Map<string, number>();
  for (const w of all) load.set(pair(w), (load.get(pair(w)) ?? 0) + 1);
  return [...all].sort((p, q) => byText(p.key, q.key) || load.get(pair(q))! - load.get(pair(p))! || span(q) - span(p) || byText(p.edge.id, q.edge.id));
}

/**
 * This function gives the lane order of a run with the option `laneOrder: "run"` (metro-line order). Two edges of the run go together past its last corner
 * until they part. The edge that turns more to the left there gets the lane more to the left.
 * Two edges can part only before the first corner. Then the edge that comes from more to the left gets the lane more to the left.
 */
function laneOrderOfRun(run: Run): string[] {
  const oriented = new Map<Way, { seq: Point[]; ids: number[]; s: number; e: number }>();
  for (const w of run.ways) {
    const s0 = w.ids.indexOf(run.first);
    const e0 = w.ids.indexOf(run.last);
    if (s0 < e0) oriented.set(w, { seq: w.seq, ids: w.ids, s: s0, e: e0 });
    else oriented.set(w, { seq: [...w.seq].reverse(), ids: [...w.ids].reverse(), s: w.seq.length - 1 - s0, e: w.seq.length - 1 - e0 });
  }
  const compare = (p: Way, q: Way): number => {
    const P = oriented.get(p)!;
    const Q = oriented.get(q)!;
    for (let j = 1; ; j++) {
      const a = P.seq[P.e + j];
      const b = Q.seq[Q.e + j];
      if (a === undefined || b === undefined) break;
      if (P.ids[P.e + j] !== Q.ids[Q.e + j]) {
        const d = turn(P.seq[P.e + j - 2]!, P.seq[P.e + j - 1]!, a) - turn(P.seq[P.e + j - 2]!, P.seq[P.e + j - 1]!, b);
        if (d !== 0) return d;
        break;
      }
    }
    for (let j = 1; ; j++) {
      const a = P.seq[P.s - j];
      const b = Q.seq[Q.s - j];
      if (a === undefined || b === undefined) break;
      if (P.ids[P.s - j] !== Q.ids[Q.s - j]) {
        // Seen backward, the left side is the right side. Thus the order turns around.
        const d = turn(P.seq[P.s - j + 2]!, P.seq[P.s - j + 1]!, b) - turn(P.seq[P.s - j + 2]!, P.seq[P.s - j + 1]!, a);
        if (d !== 0) return d;
        break;
      }
    }
    return byText(p.edge.id, q.edge.id);
  };
  // This relation is not transitive, so the merge sort of the package gives the same order on each engine (LANE-ORDER).
  return orderRun(run.ways, compare).map((w) => w.edge.id);
}
