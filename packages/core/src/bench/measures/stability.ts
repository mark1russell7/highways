import { frechet, inflate, type Box } from "../../geom.ts";
import { rng } from "../../fixtures.ts";
import type { Edge, Graph, Node, Result } from "../../model.ts";
import { measureStability } from "../quality.ts";
import { boardUnit } from "./routes.ts";

/** A small change of a graph, for the stability measures Z10 and G9 of MEAS0. */
export interface GraphChange {
  /** The graph after the change. It keeps the order of the nodes. */
  readonly graph: Graph;
  /** The node that moved by one unit, if a free place was found. */
  readonly moved?: string;
  /** The new edge, if the graph has two nodes without an edge between them. */
  readonly added?: string;
  /** The edge that the change removed. */
  readonly removed?: string;
}

/**
 * This function makes a seeded small change of a graph: one node moves by `boardUnit`, one edge goes and one new edge comes.
 * The moved box keeps a gap of 4 units to the other boxes. The same graph and the same seed give the same change.
 * With `edges: false`, the change only moves the node (Z11). The moved node is the node of the full change with the same seed.
 */
export function changeGraph(graph: Graph, seed: number, options: { readonly edges?: boolean } = {}): GraphChange {
  const R = rng(seed * 2654435761 + 97);
  const n = graph.nodes.length;
  const u = boardUnit(graph);
  let nodes: readonly Node[] = graph.nodes;
  let moved: string | undefined;
  if (n > 0) {
    const i = Math.floor(R() * n);
    const v = graph.nodes[i]!;
    const free = (b: Box): boolean => {
      const g = inflate(b, 4);
      return graph.nodes.every((o, j) => j === i || o.box.x >= g.x + g.w || g.x >= o.box.x + o.box.w || o.box.y >= g.y + g.h || g.y >= o.box.y + o.box.h);
    };
    const start = Math.floor(R() * 4);
    for (let k = 0; k < 4 && moved === undefined; k++) {
      const [dx, dy] = [
        [u, 0],
        [0, u],
        [-u, 0],
        [0, -u],
      ][(start + k) % 4]!;
      const box = { ...v.box, x: v.box.x + dx!, y: v.box.y + dy! };
      if (free(box)) {
        nodes = graph.nodes.map((o, j) => (j === i ? { ...o, box } : o));
        moved = v.id;
      }
    }
  }
  let edges: Edge[] = [...graph.edges];
  let removed: string | undefined;
  let added: string | undefined;
  if (edges.length > 1 && options.edges !== false) {
    const j = Math.floor(R() * edges.length);
    const gone = edges[j]!;
    removed = gone.id;
    edges.splice(j, 1);
    const linked = new Set(graph.edges.flatMap((e) => [`${e.source.node}\u0000${e.target.node}`, `${e.target.node}\u0000${e.source.node}`]));
    for (let t = 0; t < 64 && added === undefined && n > 1; t++) {
      const a = graph.nodes[Math.floor(R() * n)]!.id;
      const b = graph.nodes[Math.floor(R() * n)]!.id;
      if (a === b || linked.has(`${a}\u0000${b}`)) continue;
      added = `${gone.id}~`;
      edges = [...edges, { id: added, source: { node: a }, target: { node: b }, ...(gone.data ? { data: gone.data } : {}) }];
    }
  }
  return { graph: { nodes, edges }, ...(moved ? { moved } : {}), ...(added ? { added } : {}), ...(removed ? { removed } : {}) };
}

/** The route stability of a router (Z10 of MEAS0). */
export interface RouteStability {
  /** The mean Fréchet distance between the two routes of an edge, divided by the unit of the board. */
  readonly mean: number;
  /** The largest Fréchet distance, divided by the unit of the board. */
  readonly max: number;
  /** The share of the routes that moved more than 1 unit of length. */
  readonly moved: number;
}

/** The options of `routeStability`. */
export interface RouteStabilityOptions {
  /** Above this number of routes, a seeded sample of this size serves. The default is 2000. */
  readonly sample?: number;
  readonly seed?: number;
}

/**
 * This function measures the route stability of a router (Z10 of MEAS0) with `measureStability`.
 * It compares the routes of the edges that both results have. Each distance is divided by the unit of the board.
 * The cost is quadratic for each route, so a seeded sample serves above `sample` routes.
 */
export function routeStability(graph: Graph, before: Result, after: Result, options: RouteStabilityOptions = {}): RouteStability {
  const max = options.sample ?? 2000;
  const prev = new Set(before.routes.map((r) => r.edge));
  let routes = after.routes.filter((r) => prev.has(r.edge));
  if (routes.length > max) {
    const R = rng(options.seed ?? 1);
    routes = Array.from({ length: max }, () => routes[Math.floor(R() * routes.length)]!);
  }
  const s = measureStability(before, { routes });
  const u = boardUnit(graph);
  return { mean: s.mean / u, max: s.max / u, moved: s.moved };
}

/** The move response of a router (Z11 of MEAS0): the routes after a change that only moves one node by one unit of the board. */
export interface MoveResponse {
  /**
   * The sum of the Fréchet distances of the routes, divided by the unit of the board and by the degree of the moved node (at least 1).
   * The edges of the moved node move by approximately one unit, so 1 is a local response. A larger value tells that other routes also move.
   */
  readonly gain: number;
  /** The share of the other routes that move more than 1 unit of length, as `moved` of Z10. An other route has no end at the moved node. */
  readonly spill: number;
}

/**
 * This function measures the move response of a router (Z11 of MEAS0). `change` is a change of `changeGraph` with `edges: false`.
 * It gives `undefined` when no node moved. Above `sample` routes, a seeded sample serves, and the sum scales to all the routes.
 */
export function moveResponse(graph: Graph, change: GraphChange, before: Result, after: Result, options: RouteStabilityOptions = {}): MoveResponse | undefined {
  const node = change.moved;
  if (node === undefined) return undefined;
  const max = options.sample ?? 2000;
  const prev = new Map(before.routes.map((r) => [r.edge, r.points] as const));
  const ends = new Map(graph.edges.map((e) => [e.id, e.source.node === node || e.target.node === node] as const));
  let routes = after.routes.filter((r) => prev.has(r.edge));
  const all = routes.length;
  if (routes.length > max) {
    const R = rng(options.seed ?? 1);
    routes = Array.from({ length: max }, () => routes[Math.floor(R() * routes.length)]!);
  }
  const u = boardUnit(graph);
  const degree = graph.edges.filter((e) => ends.get(e.id) === true).length;
  let sum = 0;
  let far = 0;
  let spilled = 0;
  for (const r of routes) {
    const f = frechet(prev.get(r.edge)!, r.points);
    sum += f;
    if (ends.get(r.edge) === true) continue;
    far++;
    if (f > 1) spilled++;
  }
  const scale = routes.length > 0 ? all / routes.length : 0;
  return { gain: (sum * scale) / u / Math.max(1, degree), spill: far > 0 ? spilled / far : 0 };
}
