import { center, dist, type Point } from "../geom.ts";
import { nodeIndex, type Edge, type Graph, type GroupRule, type Result, type Route, type Router, type SharedRun } from "../model.ts";
import { placePlug, type Plug } from "../plugs.ts";
import { WayFinder, type WayOptions } from "../ways.ts";

/** The options of the router with shared ways. */
export interface SharedOptions extends WayOptions {
  /** The name in the benchmark. */
  readonly name: string;
  /** The edges with one key share their ways. Without a rule, all edges share. An edge without a key shares with no edge. */
  readonly rule?: GroupRule;
  /** The cost of a link that an edge with the same key uses already, as a share of its length. The default is 0.5. */
  readonly discount?: number;
  /** The benchmark skips a fixture with more nodes. */
  readonly maxNodes?: number;
}

interface Way {
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

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
  const keyOf = (e: Edge): string => {
    if (!options.rule) return "*";
    return options.rule(e) ?? `\u0000${e.id}`;
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

      // The edges of one key go one after the other, the longest first, so that the short edges join the long ways.
      const discounted = new Map<string, Map<number, string[]>>();
      const order = [...all].sort(
        (p, q) => byText(p.key, q.key) || dist(q.ps.point, q.pt.point) - dist(p.ps.point, p.pt.point) || byText(p.edge.id, q.edge.id),
      );
      for (const w of order) {
        let used = discounted.get(w.key);
        if (!used) discounted.set(w.key, (used = new Map()));
        const mine = used;
        const way = corners.path(ways.out(w.ps), ways.out(w.pt), (i, j, d) => (mine.has(link(i, j)) ? d * discount : d), discount);
        if (!way) continue;
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
        }
      }

      // The users of each link, with the links to the ends. Two edges from one plug share the link from it.
      const users = new Map<string, Map<string, string[]>>();
      for (const w of order) {
        if (!w.found) continue;
        let mine = users.get(w.key);
        if (!mine) users.set(w.key, (mine = new Map()));
        for (let i = 1; i < w.ids.length; i++) {
          const a = w.ids[i - 1]!;
          const b = w.ids[i]!;
          const k = a < b ? `${a}:${b}` : `${b}:${a}`;
          const list = mine.get(k);
          if (list) list.push(w.edge.id);
          else mine.set(k, [w.edge.id]);
        }
      }

      // Each way breaks into stretches where the set of edges on the links stays the same.
      // A shared stretch loses its needless corners one time, so it has the same points in each of its routes.
      const runs = new Map<string, Run>();
      const points = new Map<string, Point[]>();
      for (const w of all) {
        if (!w.found) continue;
        const used = users.get(w.key)!;
        const sig = (i: number): string => {
          const a = w.ids[i]!;
          const b = w.ids[i + 1]!;
          const list = used.get(a < b ? `${a}:${b}` : `${b}:${a}`)!;
          return list.length < 2 ? "" : [...list].sort(byText).join("\u0001");
        };
        const out: Point[] = [w.ps.point];
        const append = (piece: readonly Point[]): void => {
          for (const p of piece) if (dist(p, out[out.length - 1]!) > 1e-9) out.push(p);
        };
        let start = 0;
        for (let i = 0; i < w.seq.length - 1; i++) {
          const s = sig(i);
          if (i + 1 < w.seq.length - 1 && sig(i + 1) === s) continue;
          const raw = w.seq.slice(start, i + 2);
          if (s === "") append(corners.pull(raw));
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
      for (const run of runs.values()) {
        shared.push({ id: `r${shared.length}`, key: run.key, points: run.points, edges: laneOrderOfRun(run) });
      }
      return { routes, runs: shared };
    },
  };
  return options.maxNodes === undefined ? router : { ...router, maxNodes: options.maxNodes };
}

/**
 * This function gives the lane order of a run (metro-line order). Two edges of the run go together past its last corner
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
  return [...run.ways].sort(compare).map((w) => w.edge.id);
}
