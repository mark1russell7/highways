import { BACKTRACK_MIN, goesOutAndBack } from "../bench/links.ts";
import { center, dist, pointSegmentDistance, polylineLength, type Box, type Point } from "../geom.ts";
import { levelLinks, type ItemPair } from "../levels.ts";
import { nodeIndex, type Graph, type Level, type LevelItem, type Node, type Result, type Route, type Router, type SharedRun } from "../model.ts";
import { placePlug } from "../plugs.ts";
import { allSections, buildSections, treeDepth, type Section, type SectionOptions } from "../sections.ts";
import { orderLanes } from "../segments.ts";
import { WayFinder, type WayOptions } from "../ways.ts";

/** The options of the router with sections. */
export interface SectionsOptions extends WayOptions, SectionOptions {
  /** The name in the benchmark. */
  readonly name: string;
  /**
   * The number of hubs on each side of the lowest common section that a way passes. A smaller number gives shorter ways
   * and fewer shared ways. Without it, a way passes each hub from its node up.
   */
  readonly hubs?: number;
  /** A way through the hubs can be at most this many times as long as the line between its plugs. Else the edge goes directly. The default is 2. */
  readonly stretch?: number;
  /** The benchmark skips a fixture with more nodes. */
  readonly maxNodes?: number;
}

const dedupe = (p: readonly Point[]): Point[] => p.filter((q, i) => i === 0 || dist(q, p[i - 1]!) > 1e-9);

/**
 * A hub can be this many units farther from the target than the nearest approach of the way before it.
 * A hub farther away goes out and back, so the way skips it.
 */
const HUB_SLACK = 2 * BACKTRACK_MIN;

/**
 * This function makes a router with a tree of sections. Each section has a hub: the free corner nearest to the center of its nodes.
 * An edge goes from its node up the hubs of its sections to the lowest common section, across, and down to the other node.
 * Each way from hub to hub is found one time, so all the edges on it share its points.
 * The edges in one section of the lowest level go straight around the nodes.
 *
 * An edge skips a hub that takes it away from its target. A way that still goes out and back gives way to the direct way.
 *
 * The result gives one zoom level for each depth of the tree.
 * A link of a level goes from the boundary of one item to the boundary of the other, around the other items.
 */
export function sectionsRouter(options: SectionsOptions): Router {
  const router: Router = {
    name: options.name,
    route(graph: Graph): Result {
      const stretch = options.stretch ?? 2;
      const byId = nodeIndex(graph);
      const indexOfNode = new Map(graph.nodes.map((n, i) => [n.id, i]));
      const ways = new WayFinder(graph.nodes, options);
      const corners = ways.corners;
      const root = buildSections(graph.nodes, options);
      const parent = new Map<Section, Section>();
      const leafOf: Section[] = [];
      for (const s of allSections(root)) {
        for (const c of s.children) parent.set(c, s);
        if (s.children.length === 0) for (const i of s.nodes) leafOf[i] = s;
      }
      const hubs = new Map<Section, Point>();
      const hub = (s: Section): Point => {
        let h = hubs.get(s);
        if (!h) {
          let x = 0;
          let y = 0;
          for (const i of s.nodes) {
            const c = center(graph.nodes[i]!.box);
            x += c.x;
            y += c.y;
          }
          const c = { x: x / Math.max(1, s.nodes.length), y: y / Math.max(1, s.nodes.length) };
          const j = corners.nearest(c);
          h = j >= 0 ? corners.points[j]! : c;
          hubs.set(s, h);
        }
        return h;
      };
      // The sections of the chain whose hubs do not take the way away from its target. The test uses the straight lines from hub to hub.
      const forward = (list: readonly Section[], from: Point, to: Point): Section[] => {
        const kept: Section[] = [];
        let near = dist(from, to);
        let last = from;
        for (const c of list) {
          const h = hub(c);
          if (dist(h, to) > near + HUB_SLACK) continue;
          near = Math.min(near, pointSegmentDistance(to, last, h));
          last = h;
          kept.push(c);
        }
        return kept;
      };
      const up = (s: Section): Section[] => {
        const out: Section[] = [];
        for (let x: Section | undefined = s; x; x = parent.get(x)) out.push(x);
        return out;
      };

      // The ways between two places, found one time. A place is a hub or a free point.
      const pieces = new Map<string, Point[]>();
      const users = new Map<string, string[]>();
      const piece = (ka: string, a: Point, kb: string, b: Point, used: string[]): Point[] => {
        const forward = ka <= kb;
        const key = forward ? `${ka}>${kb}` : `${kb}>${ka}`;
        let p = pieces.get(key);
        if (!p) {
          const [from, to] = forward ? [a, b] : [b, a];
          const way = corners.path(from, to);
          p = dedupe(way ? corners.pull(way) : [from, to]);
          pieces.set(key, p);
        }
        if (!used.includes(key)) used.push(key);
        return forward ? p : [...p].reverse();
      };
      const at = (p: Point): string => `${p.x},${p.y}`;

      const routes: Route[] = [];
      for (const e of graph.edges) {
        const s = byId.get(e.source.node);
        const t = byId.get(e.target.node);
        const iu = indexOfNode.get(e.source.node);
        const iv = indexOfNode.get(e.target.node);
        if (!s || !t || iu === undefined || iv === undefined) continue;
        const ps = placePlug(s, e.source, center(t.box));
        const pt = placePlug(t, e.target, center(s.box));
        const lu = leafOf[iu]!;
        const lv = leafOf[iv]!;
        if (lu === lv) {
          routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
          continue;
        }
        const a = up(lu);
        const b = up(lv);
        const common = new Set(b);
        const lca = a.find((x) => common.has(x))!;
        const keep = options.hubs ?? Infinity;
        const side = (list: Section[]): Section[] => list.slice(Math.max(0, list.indexOf(lca) - keep), list.indexOf(lca));
        const end = ways.out(pt);
        const start = ways.out(ps);
        const chain = forward([...side(a), ...side(b).reverse()], start, pt.point);
        if (chain.length === 0) {
          routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
          continue;
        }
        const out: Point[] = [ps.point];
        const append = (p: readonly Point[]): void => {
          for (const q of p) if (dist(q, out[out.length - 1]!) > 1e-9) out.push(q);
        };
        const used: string[] = [];
        append(piece(at(start), start, chain[0]!.id, hub(chain[0]!), used));
        for (let i = 1; i < chain.length; i++) append(piece(chain[i - 1]!.id, hub(chain[i - 1]!), chain[i]!.id, hub(chain[i]!), used));
        append(piece(chain[chain.length - 1]!.id, hub(chain[chain.length - 1]!), at(end), end, used));
        append([pt.point]);
        // A way through the hubs that is too long, or that goes out and back, gives way to the direct way.
        if (polylineLength(out) > stretch * dist(ps.point, pt.point) + 4 * ways.margin || goesOutAndBack(out)) {
          routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
          continue;
        }
        for (const key of used) {
          const list = users.get(key);
          if (list) list.push(e.id);
          else users.set(key, [e.id]);
        }
        routes.push({ edge: e.id, points: out });
      }

      const routeOf = new Map(routes.map((r) => [r.edge, r]));
      const runs: SharedRun[] = [];
      for (const [key, p] of pieces) {
        const list = users.get(key) ?? [];
        if (list.length < 2 || p.length < 2) continue;
        runs.push({ id: `r${runs.length}`, key, points: p, edges: orderLanes(p, list.map((id) => routeOf.get(id)!)) });
      }
      return { routes, runs, levels: makeLevels(graph, root, routeOf, options) };
    },
  };
  return options.maxNodes === undefined ? router : { ...router, maxNodes: options.maxNodes };
}

/**
 * This function gives one zoom level for each depth of the tree, and a last level with each node alone.
 * At depth d, a section of depth d is one item. A link joins two items and counts the edges between them.
 * In a level with groups, a link goes around the boxes of the other items (`levelLinks`).
 * In the last level, the points of a link are the route of its first edge.
 */
function makeLevels(graph: Graph, root: Section, routeOf: ReadonlyMap<string, Route>, options: WayOptions): Level[] {
  const indexOfNode = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const levels: Level[] = [];
  const deepest = treeDepth(root);
  for (let d = 0; d <= deepest + 1; d++) {
    const items: LevelItem[] = [];
    const itemOf: (Section | number)[] = [];
    const boxOf = (list: readonly number[]): Box => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const i of list) {
        const b = graph.nodes[i]!.box;
        x0 = Math.min(x0, b.x);
        y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.w);
        y1 = Math.max(y1, b.y + b.h);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    const visit = (s: Section): void => {
      if (s.depth >= d) {
        items.push({ id: s.id, box: boxOf(s.nodes), nodes: s.nodes.map((i) => graph.nodes[i]!.id) });
        for (const i of s.nodes) itemOf[i] = s;
      } else if (s.children.length > 0) for (const c of s.children) visit(c);
      else
        for (const i of s.nodes) {
          const n = graph.nodes[i]!;
          items.push({ id: n.id, box: n.box, nodes: [n.id] });
          itemOf[i] = i;
        }
    };
    if (graph.nodes.length > 0) visit(root);
    const links = new Map<string, { source: string; target: string; count: number; edge: string }>();
    for (const e of graph.edges) {
      const iu = indexOfNode.get(e.source.node);
      const iv = indexOfNode.get(e.target.node);
      if (iu === undefined || iv === undefined) continue;
      const a = itemOf[iu]!;
      const b = itemOf[iv]!;
      if (a === b) continue;
      const ida = typeof a === "number" ? graph.nodes[a]!.id : a.id;
      const idb = typeof b === "number" ? graph.nodes[b]!.id : b.id;
      const key = `${ida}\u0000${idb}`;
      const link = links.get(key);
      if (link) {
        link.count++;
        continue;
      }
      links.set(key, { source: ida, target: idb, count: 1, edge: e.id });
    }
    const pairs: ItemPair[] = [...links.values()].map(({ source, target, count }) => ({ source, target, count }));
    if (d > deepest)
      levels.push({ depth: d, items, links: [...links.values()].map(({ edge, ...l }) => ({ ...l, points: routeOf.get(edge)?.points ?? [] })) });
    else levels.push({ depth: d, items, links: levelLinks(items, pairs, options) });
  }
  return levels;
}
