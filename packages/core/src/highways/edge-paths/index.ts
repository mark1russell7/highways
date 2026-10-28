import { center, dist, type Point } from "../../geom.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";

/** The options of the highway strategy `edge-paths` (HWY-012 of the note on highways). */
export interface EdgePathOptions extends Pick<WayOptions, "margin" | "k"> {
  /** An edge takes a path of other edges only when the path is this many times its own length or less. The default is 2. */
  readonly distortion: number;
  /** The weight of a link in the search is its length to this power. A larger power prefers paths of many short links. The default is 2. */
  readonly power: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `edge-paths`. */
export const EDGE_PATH_DEFAULTS: Readonly<Required<Omit<EdgePathOptions, "margin" | "k">>> = Object.freeze({ distortion: 2, power: 2, minSize: 2 });

/** One step of the path of an edge: the edge of the step and `true` when the path goes from its target to its source. */
export interface PathStep {
  readonly edge: string;
  readonly back: boolean;
}

/**
 * This function gives the edge paths of the graph (Wallinger and others 2022). The edges go in the order of their lengths, the longest first.
 * An edge looks for the shortest path of other edges between its nodes, with the weight `length ^ power`. A path is good when its length is `distortion` times the length of the edge or less.
 * The edges of a good path lock: they keep their own ways. An edge with a good path leaves the graph of the search. The map holds the path of each such edge.
 */
export function edgePaths(input: HighwayInput, o: Readonly<Pick<EdgePathOptions, "distortion" | "power">>): Map<string, PathStep[]> {
  const nodes = new Map(input.graph.nodes.map((n) => [n.id, center(n.box)] as const));
  const links = input.graph.edges
    .filter((e) => e.source.node !== e.target.node && nodes.has(e.source.node) && nodes.has(e.target.node))
    .map((e) => ({ id: e.id, s: e.source.node, t: e.target.node, len: dist(nodes.get(e.source.node)!, nodes.get(e.target.node)!) }));
  const around = new Map<string, number[]>();
  links.forEach((l, i) => {
    for (const n of [l.s, l.t]) {
      const list = around.get(n);
      if (list) list.push(i);
      else around.set(n, [i]);
    }
  });
  const order = links.map((_, i) => i).sort((a, b) => links[b]!.len - links[a]!.len || (links[a]!.id < links[b]!.id ? -1 : 1));
  const skip = new Uint8Array(links.length);
  const lock = new Uint8Array(links.length);
  const paths = new Map<string, PathStep[]>();
  for (const i of order) {
    if (lock[i]) continue;
    const e = links[i]!;
    skip[i] = 1;
    const path = shortest(e.s, e.t, links, around, skip, o.power, o.distortion * e.len);
    if (!path) {
      skip[i] = 0;
      continue;
    }
    for (const step of path) lock[step.index] = 1;
    paths.set(e.id, path.map((step) => ({ edge: links[step.index]!.id, back: step.back })));
  }
  return paths;
}

/** This function gives the shortest path (Dijkstra) from the node `from` to the node `to` over the links that do not skip. It gives `undefined` when the length is more than `limit`. */
function shortest(
  from: string,
  to: string,
  links: readonly { s: string; t: string; len: number }[],
  around: ReadonlyMap<string, readonly number[]>,
  skip: Uint8Array,
  power: number,
  limit: number,
): { index: number; back: boolean }[] | undefined {
  const cost = new Map<string, number>([[from, 0]]);
  const via = new Map<string, { index: number; back: boolean; prev: string }>();
  const done = new Set<string>();
  const open: { node: string; c: number }[] = [{ node: from, c: 0 }];
  while (open.length > 0) {
    let k = 0;
    for (let j = 1; j < open.length; j++) if (open[j]!.c < open[k]!.c || (open[j]!.c === open[k]!.c && open[j]!.node < open[k]!.node)) k = j;
    const { node } = open.splice(k, 1)[0]!;
    if (done.has(node)) continue;
    done.add(node);
    if (node === to) break;
    for (const index of around.get(node) ?? []) {
      if (skip[index]) continue;
      const l = links[index]!;
      const back = l.t === node;
      const next = back ? l.s : l.t;
      if (done.has(next)) continue;
      const c = cost.get(node)! + Math.pow(Math.max(l.len, 1e-9), power);
      if (c < (cost.get(next) ?? Infinity)) {
        cost.set(next, c);
        via.set(next, { index, back, prev: node });
        open.push({ node: next, c });
      }
    }
  }
  if (!via.has(to)) return undefined;
  const out: { index: number; back: boolean }[] = [];
  let length = 0;
  for (let n = to; n !== from; ) {
    const v = via.get(n)!;
    out.push({ index: v.index, back: v.back });
    length += links[v.index]!.len;
    n = v.prev;
  }
  if (length > limit) return undefined;
  return out.reverse();
}

/**
 * This function gives the highways of the edge paths (HWY-012). An edge with a good path follows the ways of the edges of its path.
 * Each edge of the path keeps its own way through the corner graph. So the ways share their links, and each shared stretch is a highway.
 */
export function edgePathPlan(input: HighwayInput, o: Readonly<EdgePathOptions>): HighwayPlan {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const corners = finder.corners;
  const plugs = edgePlugs(input.graph);
  const own = new Map<string, Point[]>();
  for (const { edge, ps, pt } of plugs) {
    const a = finder.out(ps);
    const b = finder.out(pt);
    own.set(edge.id, corners.path(a, b) ?? [a, b]);
  }
  const paths = edgePaths(input, o);
  const ways: KeyedWay[] = [];
  for (const { edge, ps, pt } of plugs) {
    const path = paths.get(edge.id);
    if (!path) {
      ways.push({ edge: edge.id, key: "", points: own.get(edge.id)! });
      continue;
    }
    const points: Point[] = [];
    const join = (to: Point): void => {
      const last = points[points.length - 1];
      if (!last) {
        points.push(to);
        return;
      }
      if (dist(last, to) <= 1e-9) return;
      const link = corners.path(last, to) ?? [last, to];
      points.push(...link.slice(1));
    };
    join(finder.out(ps));
    for (const step of path) {
      const way = own.get(step.edge) ?? [];
      const along = step.back ? [...way].reverse() : way;
      if (along.length === 0) continue;
      join(along[0]!);
      points.push(...along.slice(1));
    }
    join(finder.out(pt));
    ways.push({ edge: edge.id, key: "", points });
  }
  return sharedStretches(ways, { minSize: o.minSize, pull: (p) => corners.pull(p) });
}
