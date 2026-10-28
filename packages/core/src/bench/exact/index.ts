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

/**
 * This function gives the largest stretch of routes as the exact model counts it: the length of a route without its two plug ends,
 * divided by the shortest way in the network of the model. The cap of the model is a limit on this value.
 * An edge without a route or without a way in the network does not count. Without such an edge, the value is 1.
 */
export function exactStretch(graph: Graph, routes: readonly Route[], o: Readonly<WayOptions> = {}): number {
  const { adj, ends, margin } = exactNetwork(graph, o);
  const byEdge = new Map(routes.map((r) => [r.edge, r]));
  let max = 1;
  for (const e of ends) {
    const r = byEdge.get(e.edge.id);
    if (!r || r.points.length < 2 || e.a === e.b) continue;
    const best = distances(adj, e.a)[e.b]!;
    if (!Number.isFinite(best) || best <= 1) continue;
    max = Math.max(max, (polylineLength(r.points) - 2 * margin) / best);
  }
  return max;
}
