import { dist, polylineLength, type Point } from "../../geom.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../../highways/stretches.ts";
import type { HighwayPlan } from "../../highways/model.ts";
import type { Edge, Graph, Route } from "../../model.ts";
import { byCollection } from "../../routers/trunks.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";

/** The edges that can share a link: all the edges, or only the edges of one collection, as with the rule `byCollection`. */
export type ExactRule = "all" | "collection";

/** The options of the exact model of fixed-charge network design (HWY-040). */
export interface ExactOptions extends WayOptions {
  /** The way of each edge is this value times its shortest way or shorter. */
  readonly stretch: number;
  /** The edges that can share a link. */
  readonly rule: ExactRule;
  /** The cost of each unit of length of each way, as a share of the cost of the ink. A small value removes needless loops. The default is 0.001. */
  readonly epsilon?: number;
}

/** A model of fixed-charge network design as the text of a mixed integer program (CPLEX LP format), and the function that reads its solution. */
export interface ExactModel {
  /** The text of the program in the CPLEX LP format. */
  readonly lp: string;
  /** The number of binary variables. */
  readonly columns: number;
  /** The number of constraints. */
  readonly rows: number;
  /** The number of edges in the model. An edge without a way in the stretch limit is not in the model. */
  readonly edges: number;
  /** The length of the arc or the link of each binary variable, by its name. A name `x…` is an arc of an edge, and a name `y…` is a link of a key. */
  readonly lengths: ReadonlyMap<string, number>;
  /** This function gives the plan of a solution. `value` gives the value of a variable by its name. */
  decode(value: (name: string) => number): HighwayPlan;
}

interface Arc {
  readonly from: number;
  readonly to: number;
  readonly link: number;
  readonly len: number;
}

/** This function gives the shortest distance from `start` to each node, with Dijkstra on an adjacency list. */
function distances(adj: readonly (readonly { to: number; len: number }[])[], start: number): Float64Array {
  const d = new Float64Array(adj.length).fill(Infinity);
  d[start] = 0;
  const done = new Uint8Array(adj.length);
  // The boards of the model are small, so a scan for the smallest open node is fast enough.
  for (;;) {
    let u = -1;
    for (let i = 0; i < adj.length; i++) if (!done[i] && d[i]! < Infinity && (u < 0 || d[i]! < d[u]!)) u = i;
    if (u < 0) return d;
    done[u] = 1;
    for (const { to, len } of adj[u]!) if (d[u]! + len < d[to]!) d[to] = d[u]! + len;
  }
}

/** The network of the exact model: the corner graph, plus the point out of each plug of each edge. */
interface ExactNetwork {
  readonly points: readonly Point[];
  readonly links: readonly { readonly u: number; readonly v: number; readonly len: number }[];
  readonly adj: readonly (readonly { to: number; len: number }[])[];
  /** The two end points of each edge: the points out of its plugs. */
  readonly ends: readonly { readonly edge: Edge; readonly a: number; readonly b: number }[];
  /** The distance from a plug to the point out of it. */
  readonly margin: number;
}

/** This function makes the network of the exact model for the edges of a graph. */
function exactNetwork(graph: Graph, o: Readonly<WayOptions>): ExactNetwork {
  const finder = new WayFinder(graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const corners = finder.corners;
  const k = o.k ?? 8;
  const pad = finder.margin / 2;
  const points: Point[] = [...corners.points];
  const ids = new Map<string, number>();
  const nodeOf = (p: Point): number => {
    const key = `${p.x},${p.y}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = points.length;
      points.push(p);
      ids.set(key, id);
    }
    return id;
  };
  corners.points.forEach((p, i) => ids.set(`${p.x},${p.y}`, i));
  const plugs = edgePlugs(graph);
  const ends = plugs.map(({ edge, ps, pt }) => ({ edge, a: nodeOf(finder.out(ps)), b: nodeOf(finder.out(pt)) }));

  // The links: each corner to its k nearest visible corners, as in the corner graph, and each end point to its 2k nearest visible corners.
  const linkIds = new Map<string, number>();
  const links: { u: number; v: number; len: number }[] = [];
  const addLink = (u: number, v: number): void => {
    if (u === v) return;
    const key = u < v ? `${u},${v}` : `${v},${u}`;
    if (linkIds.has(key)) return;
    linkIds.set(key, links.length);
    links.push({ u: Math.min(u, v), v: Math.max(u, v), len: dist(points[u]!, points[v]!) });
  };
  for (let i = 0; i < corners.points.length; i++) for (const j of corners.nearestVisible(corners.points[i]!, k, i)) addLink(i, j);
  for (let t = corners.points.length; t < points.length; t++) for (const j of corners.nearestVisible(points[t]!, 2 * k)) addLink(t, j);
  for (const e of ends) if (finder.obstacles.clear(points[e.a]!, points[e.b]!, pad)) addLink(e.a, e.b);
  const adj: { to: number; len: number }[][] = points.map(() => []);
  for (const l of links) {
    adj[l.u]!.push({ to: l.v, len: l.len });
    adj[l.v]!.push({ to: l.u, len: l.len });
  }
  return { points, links, adj, ends, margin: finder.margin };
}

/**
 * This function gives the model of fixed-charge network design (Magnanti and Wong 1984) for the edges of a graph (HWY-040).
 * The network is the corner graph, plus the point out of each plug. Each link costs its length once for each key that uses it.
 * Each edge goes one way between the points out of its two plugs. The way is `stretch` times its shortest way or shorter.
 * The optimum has the least ink for the stretch limit. The ways of the solution give highways with `sharedStretches`.
 */
export function exactModel(graph: Graph, o: Readonly<ExactOptions>): ExactModel {
  const { points, links, adj, ends: outs } = exactNetwork(graph, o);
  const ends = outs.map((e) => ({ edge: e.edge.id, key: o.rule === "all" ? "*" : (byCollection(e.edge) ?? `\u0000${e.edge.id}`), a: e.a, b: e.b }));

  // The arcs of each edge: the arcs on some way within the stretch limit.
  const eps = o.epsilon ?? 0.001;
  const objective: string[] = [];
  const rows: string[] = [];
  const binaries: string[] = [];
  const lengths = new Map<string, number>();
  const keys = [...new Set(ends.map((e) => e.key))];
  const used = new Map<string, Set<number>>();
  const arcsOf: { e: number; arcs: Arc[] }[] = [];
  ends.forEach((e, ei) => {
    const da = distances(adj, e.a);
    const db = distances(adj, e.b);
    const best = da[e.b]!;
    if (!Number.isFinite(best) || e.a === e.b) return;
    const limit = o.stretch * best + 1e-9;
    const arcs: Arc[] = [];
    links.forEach((l, li) => {
      if (da[l.u]! + l.len + db[l.v]! <= limit) arcs.push({ from: l.u, to: l.v, link: li, len: l.len });
      if (da[l.v]! + l.len + db[l.u]! <= limit) arcs.push({ from: l.v, to: l.u, link: li, len: l.len });
    });
    arcsOf.push({ e: ei, arcs });
    let set = used.get(e.key);
    if (!set) used.set(e.key, (set = new Set()));
    for (const a of arcs) set.add(a.link);
    // Flow: one unit leaves `a` and arrives at `b`.
    const flow = new Map<number, string[]>();
    const term = (n: number, s: string): void => {
      const list = flow.get(n);
      if (list) list.push(s);
      else flow.set(n, [s]);
    };
    const stretch: string[] = [];
    for (const a of arcs) {
      const x = `x${ei}_${a.link}_${a.from < a.to ? 0 : 1}`;
      binaries.push(x);
      lengths.set(x, a.len);
      objective.push(`${(eps * a.len).toFixed(6)} ${x}`);
      term(a.from, `+ ${x}`);
      term(a.to, `- ${x}`);
      stretch.push(`${a.len.toFixed(6)} ${x}`);
    }
    for (const [n, list] of flow) rows.push(`f${ei}_${n}: ${list.join(" ")} = ${n === e.a ? 1 : n === e.b ? -1 : 0}`);
    rows.push(`s${ei}: ${stretch.join(" + ")} <= ${limit.toFixed(6)}`);
    // An arc needs its link open for the key of the edge.
    const byLink = new Map<number, string[]>();
    for (const a of arcs) {
      const list = byLink.get(a.link);
      const x = `x${ei}_${a.link}_${a.from < a.to ? 0 : 1}`;
      if (list) list.push(x);
      else byLink.set(a.link, [x]);
    }
    const ki = keys.indexOf(e.key);
    for (const [li, xs] of byLink) rows.push(`o${ei}_${li}: ${xs.join(" + ")} - y${ki}_${li} <= 0`);
  });
  keys.forEach((key, ki) => {
    for (const li of used.get(key) ?? []) {
      const y = `y${ki}_${li}`;
      binaries.push(y);
      lengths.set(y, links[li]!.len);
      objective.push(`${links[li]!.len.toFixed(6)} ${y}`);
    }
  });
  const wrap = (terms: readonly string[]): string => {
    const out: string[] = [];
    for (let i = 0; i < terms.length; i += 8) out.push(terms.slice(i, i + 8).join(" + "));
    return out.join("\n + ");
  };
  const lp = [
    "Minimize",
    ` obj: ${objective.length > 0 ? wrap(objective) : "0 dummy"}`,
    "Subject To",
    ...rows.map((r) => ` ${r.replace(/((?:\S+\s+){24})/g, "$1\n ")}`),
    "Binary",
    ...Array.from({ length: Math.ceil(binaries.length / 8) }, (_, i) => ` ${binaries.slice(i * 8, i * 8 + 8).join(" ")}`),
    "End",
    "",
  ].join("\n");

  const decode = (value: (name: string) => number): HighwayPlan => {
    const ways: KeyedWay[] = [];
    for (const { e: ei, arcs } of arcsOf) {
      const e = ends[ei]!;
      const next = new Map<number, number>();
      for (const a of arcs) if (value(`x${ei}_${a.link}_${a.from < a.to ? 0 : 1}`) > 0.5) next.set(a.from, a.to);
      const seq: Point[] = [points[e.a]!];
      let at = e.a;
      for (let guard = 0; at !== e.b && guard <= points.length; guard++) {
        const to = next.get(at);
        if (to === undefined) break;
        seq.push(points[to]!);
        at = to;
      }
      if (at === e.b) ways.push({ edge: e.edge, key: e.key, points: seq });
    }
    return sharedStretches(ways, { minSize: 2 });
  };
  return { lp, columns: binaries.length, rows: rows.length, edges: arcsOf.length, lengths, decode };
}

/** A binary heap of node indexes by a key, smallest first. A node can be in the heap more than one time. The search skips an old entry. */
class NodeHeap {
  #key: Float64Array = new Float64Array(64);
  #node: Int32Array = new Int32Array(64);
  size = 0;

  push(key: number, node: number): void {
    if (this.size === this.#key.length) {
      const k = new Float64Array(2 * this.size);
      k.set(this.#key);
      this.#key = k;
      const n = new Int32Array(2 * this.size);
      n.set(this.#node);
      this.#node = n;
    }
    const keys = this.#key;
    const nodes = this.#node;
    let i = this.size++;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (keys[up]! <= key) break;
      keys[i] = keys[up]!;
      nodes[i] = nodes[up]!;
      i = up;
    }
    keys[i] = key;
    nodes[i] = node;
  }

  /** This method removes the node with the smallest key, and gives it. */
  pop(): number {
    const keys = this.#key;
    const nodes = this.#node;
    const top = nodes[0]!;
    const n = --this.size;
    const key = keys[n]!;
    const node = nodes[n]!;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && keys[c + 1]! < keys[c]!) c++;
      if (keys[c]! >= key) break;
      keys[i] = keys[c]!;
      nodes[i] = nodes[c]!;
      i = c;
    }
    keys[i] = key;
    nodes[i] = node;
    return top;
  }
}

/**
 * This function gives the shortest distance from `start` to each node of `targets` (A*). The search stops when it has each target.
 * The guide is the straight distance to the nearest target. Each link is a straight line, so the guide is not above the true distance at any time.
 * Thus the distances are the distances of Dijkstra. Only the order of the search changes.
 * A target that the search cannot reach gets `Infinity`.
 */
function distancesTo(points: readonly Point[], adj: readonly (readonly { to: number; len: number }[])[], start: number, targets: readonly number[]): Map<number, number> {
  const d = new Float64Array(adj.length).fill(Infinity);
  const done = new Uint8Array(adj.length);
  const goal = new Set(targets);
  const ends = targets.map((t) => points[t]!);
  const guide = (v: number): number => {
    let h = Infinity;
    for (const t of ends) h = Math.min(h, dist(points[v]!, t));
    return h;
  };
  const heap = new NodeHeap();
  d[start] = 0;
  heap.push(guide(start), start);
  let left = goal.size;
  while (heap.size > 0 && left > 0) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    if (goal.has(u)) left--;
    for (const { to, len } of adj[u]!) {
      const nd = d[u]! + len;
      if (nd < d[to]!) {
        d[to] = nd;
        // A rounding error can make the guide a little too large. Then a node opens again, so its distance stays the least.
        done[to] = 0;
        heap.push(nd + guide(to), to);
      }
    }
  }
  return new Map(targets.map((t) => [t, d[t]!]));
}

/**
 * This function gives the shortest distance in the network between the two end points of each edge, by the pair `a,b` of the end points.
 * The distance does not depend on the direction, so one search serves each edge between the same two points.
 * An end point of many edges starts one search to all its other end points. The function starts the searches from the end points with the most edges first.
 */
function pairDistances(network: ExactNetwork): Map<string, number> {
  const pairKey = (a: number, b: number): string => (a < b ? `${a},${b}` : `${b},${a}`);
  const partners = new Map<number, Set<number>>();
  const open = new Set<string>();
  for (const e of network.ends) {
    if (e.a === e.b) continue;
    const k = pairKey(e.a, e.b);
    if (open.has(k)) continue;
    open.add(k);
    for (const [u, v] of [
      [e.a, e.b],
      [e.b, e.a],
    ] as const) {
      if (!partners.has(u)) partners.set(u, new Set());
      partners.get(u)!.add(v);
    }
  }
  const out = new Map<string, number>();
  const order = [...partners.keys()].sort((u, v) => partners.get(v)!.size - partners.get(u)!.size || u - v);
  for (const u of order) {
    const targets = [...partners.get(u)!].filter((v) => open.has(pairKey(u, v)));
    if (targets.length === 0) continue;
    for (const [v, len] of distancesTo(network.points, network.adj, u, targets)) {
      const k = pairKey(u, v);
      out.set(k, len);
      open.delete(k);
    }
  }
  return out;
}

/** This function gives the function of the stretch of each route of the graph, from the network and the shortest distance of each edge. */
function stretchesOf(network: ExactNetwork, best: (e: ExactNetwork["ends"][number]) => number): (routes: readonly Route[]) => Map<string, number> {
  return (routes) => {
    const byEdge = new Map(routes.map((r) => [r.edge, r]));
    const out = new Map<string, number>();
    for (const e of network.ends) {
      const r = byEdge.get(e.edge.id);
      if (!r || r.points.length < 2 || e.a === e.b) continue;
      const b = best(e);
      if (!Number.isFinite(b) || b <= 1) continue;
      out.set(e.edge.id, (polylineLength(r.points) - 2 * network.margin) / b);
    }
    return out;
  };
}

/**
 * This function gives the stretch of each route as the exact model counts it, by the edge id.
 * The stretch of a route is its length without its two plug ends, divided by the shortest way in the network of the model.
 * The function builds the network one time. The result function then measures each list of routes of the graph, so a portfolio pays for the network once.
 * The first call finds the shortest ways with one A* search for each end point with edges (PORTFOLIO-SPEED). The later calls use them again.
 * An edge without a route or without a way in the network has no value.
 */
export function exactStretches(graph: Graph, o: Readonly<WayOptions> = {}): (routes: readonly Route[]) => Map<string, number> {
  const network = exactNetwork(graph, o);
  let best: Map<string, number> | undefined;
  return stretchesOf(network, (e) => {
    best ??= pairDistances(network);
    return best.get(e.a < e.b ? `${e.a},${e.b}` : `${e.b},${e.a}`) ?? Infinity;
  });
}

/**
 * This function gives the same values as `exactStretches` with the search of the first version. That search is one full Dijkstra with a scan, from the first end point of each edge.
 * It is slow on large boards. The tests and the check `portfolio:time --check-stretch` compare the two functions.
 */
export function exactStretchesReference(graph: Graph, o: Readonly<WayOptions> = {}): (routes: readonly Route[]) => Map<string, number> {
  const network = exactNetwork(graph, o);
  const best = new Map<number, Float64Array>();
  const from = (a: number): Float64Array => {
    if (!best.has(a)) best.set(a, distances(network.adj, a));
    return best.get(a)!;
  };
  return stretchesOf(network, (e) => from(e.a)[e.b]!);
}

/**
 * This function gives the largest stretch of routes as the exact model counts it (`exactStretches`).
 * The cap of the model is a limit on this value.
 * An edge without a route or without a way in the network does not count. Without such an edge, the value is 1.
 */
export function exactStretch(graph: Graph, routes: readonly Route[], o: Readonly<WayOptions> = {}): number {
  let max = 1;
  for (const v of exactStretches(graph, o)(routes).values()) max = Math.max(max, v);
  return max;
}
