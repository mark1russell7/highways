import { dist, pointBoxDistance, polylineLength, type Point } from "../../geom.ts";
import { levelLinks, type ItemPair } from "../../levels.ts";
import { nodeIndex } from "../../model.ts";
import { buildSections, levelCut } from "../../sections.ts";
import { WayFinder } from "../../ways.ts";
import { basePlan, firstRoutes, tidyPlan, type HighwayBase } from "../base.ts";
import { memberAt, type Highway, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";

/** The options of the highway strategy `level-links` (HWY-056 with WILD-034 of the notes). */
export interface LevelHighwayOptions {
  /** The plan of the edges that do not ride a level link. The default is `shared-ways`. */
  readonly from: HighwayBase;
  /** The depth of the level in the tree of sections. Depth 1 is the level below the root. The default is 1. */
  readonly depth: number;
  /** A level link becomes a highway when this number of edges or more ride it. The default is 2. */
  readonly minSize: number;
  /** An edge rides the link only when its way along the link is this many times its first route, or shorter. The default is 1.5. */
  readonly stretch: number;
}

/** The default options of the strategy `level-links`. */
export const LEVEL_HIGHWAY_DEFAULTS: Readonly<LevelHighwayOptions> = Object.freeze({ from: "shared-ways", depth: 1, minSize: 2, stretch: 1.5 });

/** This function gives the stretch of a polyline from the length `from` to the length `to`, along the polyline. */
function cut(p: readonly Point[], from: number, to: number): Point[] {
  const out: Point[] = [];
  let walked = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const len = dist(a, b);
    const s = Math.max(from, walked);
    const e = Math.min(to, walked + len);
    if (e > s && len > 0) {
      const at = (l: number): Point => ({ x: a.x + ((b.x - a.x) * (l - walked)) / len, y: a.y + ((b.y - a.y) * (l - walked)) / len });
      if (out.length === 0) out.push(at(s));
      out.push(at(e));
    }
    walked += len;
  }
  return out;
}

/**
 * This function gives a highway for each link of a zoom level, with the edges between its two items (HWY-056, WILD-034).
 * The level is the cut of the tree of sections at `depth`. The link goes around the boxes of the other items (`levelLinks`).
 * The spine is the link without a margin at each end, so it stays off the boxes of the two items. It must stay out of each box.
 * The edges between the two items, in each direction, ride the spine. The ramps go through the corner graph inside the items.
 *
 * An edge rides only when the ramps (as straight lines) and the spine are `stretch` times its first route, or shorter.
 * A link with fewer than `minSize` such edges is not a highway. The other edges keep their highways of the plan `from`.
 * Thus a zoom from the level to the routes shows the same lines, which open into lanes.
 */
export function levelHighwayPlan(input: HighwayInput, o: Readonly<LevelHighwayOptions>): HighwayPlan {
  const graph = input.graph;
  const base = basePlan(input, o.from);
  if (graph.nodes.length === 0) return base;
  const byId = nodeIndex(graph);
  const root = buildSections(graph.nodes);
  const { items, owner } = levelCut(graph.nodes, root, Math.max(0, Math.round(o.depth)));
  const indexOfNode = new Map(graph.nodes.map((n, i) => [n.id, i]));
  // The edges between each pair of items, by the pair in the order of the items.
  const between = new Map<string, { a: number; b: number; edges: { edge: string; forward: boolean }[] }>();
  for (const e of graph.edges) {
    const iu = indexOfNode.get(e.source.node);
    const iv = indexOfNode.get(e.target.node);
    if (iu === undefined || iv === undefined) continue;
    const x = owner[iu]!;
    const y = owner[iv]!;
    if (x === y) continue;
    const [a, b] = x < y ? [x, y] : [y, x];
    const key = `${a}\u0000${b}`;
    const pair = between.get(key) ?? { a, b, edges: [] };
    pair.edges.push({ edge: e.id, forward: x === a });
    between.set(key, pair);
  }
  const pairs = [...between.values()].filter((p) => p.edges.length >= Math.max(2, o.minSize));
  if (pairs.length === 0) return base;
  const itemPairs: ItemPair[] = pairs.map((p) => ({ source: items[p.a]!.id, target: items[p.b]!.id, count: p.edges.length }));
  const links = levelLinks(items, itemPairs);
  const linkOf = new Map(links.map((l) => [`${l.source}\u0000${l.target}`, l.points]));
  const ways = new WayFinder(graph.nodes);
  const first = firstRoutes(input);
  const edgeOf = new Map(graph.edges.map((e) => [e.id, e]));
  const added: Highway[] = [];
  const riders = new Set<string>();
  for (const p of pairs) {
    const points = linkOf.get(`${items[p.a]!.id}\u0000${items[p.b]!.id}`);
    if (!points || points.length < 2) continue;
    const length = polylineLength(points);
    if (length <= 4 * ways.margin) continue;
    const spine = cut(points, ways.margin, length - ways.margin);
    if (spine.length < 2 || !ways.obstacles.clearPath(spine, 1)) continue;
    const head = spine[0]!;
    const tail = spine[spine.length - 1]!;
    const along = polylineLength(spine);
    const members: HighwayMember[] = [];
    for (const { edge, forward } of p.edges) {
      const e = edgeOf.get(edge)!;
      const s = byId.get(e.source.node)!;
      const t = byId.get(e.target.node)!;
      const [enter, leave] = forward ? [head, tail] : [tail, head];
      const way = pointBoxDistance(enter, s.box) + along + pointBoxDistance(leave, t.box);
      const own = polylineLength(first.get(edge) ?? []);
      if (own > 0 && way > o.stretch * own) continue;
      members.push(forward ? memberAt(spine, edge, 0, spine.length - 1) : memberAt(spine, edge, spine.length - 1, 0));
    }
    if (members.length < Math.max(2, o.minSize)) continue;
    for (const m of members) riders.add(m.edge);
    added.push({ id: "", key: `level${o.depth}:${items[p.a]!.id}:${items[p.b]!.id}`, spine, lanes: members.map((m) => m.edge), members });
  }
  const rest = base.highways.map((h) => ({ ...h, members: h.members.filter((m) => !riders.has(m.edge)) }));
  return tidyPlan({ highways: [...rest, ...added] });
}
