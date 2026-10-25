import { center, dist, polylineLength, type Box, type Point } from "../geom.ts";
import {
  nodeIndex,
  type Graph,
  type Level,
  type LevelItem,
  type LevelLink,
  type Node,
  type Result,
  type Route,
  type Router,
  type SharedRun,
} from "../model.ts";
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
 * This function makes a router with a tree of sections. Each section has a hub: the free corner nearest to the center of its nodes.
 * An edge goes from its node up the hubs of its sections to the lowest common section, across, and down to the other node.
 * Each way from hub to hub is found one time, so all the edges on it share its points.
 * The edges in one section of the lowest level go straight around the nodes. The result gives one zoom level for each depth of the tree.
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
      // The index in the route of each hub that the route passes, by section.
      const marks = new Map<string, Map<Section, number>>();
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
        const chain = [...side(a), ...side(b).reverse()];
        const out: Point[] = [ps.point];
        const mark = new Map<Section, number>();
        const append = (p: readonly Point[]): void => {
          for (const q of p) if (dist(q, out[out.length - 1]!) > 1e-9) out.push(q);
        };
        const used: string[] = [];
        const start = ways.out(ps);
        append(piece(at(start), start, chain[0]!.id, hub(chain[0]!), used));
        mark.set(chain[0]!, out.length - 1);
        for (let i = 1; i < chain.length; i++) {
          append(piece(chain[i - 1]!.id, hub(chain[i - 1]!), chain[i]!.id, hub(chain[i]!), used));
          mark.set(chain[i]!, out.length - 1);
        }
        const end = ways.out(pt);
        append(piece(chain[chain.length - 1]!.id, hub(chain[chain.length - 1]!), at(end), end, used));
        append([pt.point]);
        // A way through the hubs that is too long gives way to the direct way.
        if (polylineLength(out) > stretch * dist(ps.point, pt.point) + 4 * ways.margin) {
          routes.push({ edge: e.id, points: ways.between(ps, pt, new Set<Node>([s, t])) });
          continue;
        }
        for (const key of used) {
          const list = users.get(key);
          if (list) list.push(e.id);
          else users.set(key, [e.id]);
        }
        routes.push({ edge: e.id, points: out });
        marks.set(e.id, mark);
      }

      const routeOf = new Map(routes.map((r) => [r.edge, r]));
      const runs: SharedRun[] = [];
      for (const [key, p] of pieces) {
        const list = users.get(key) ?? [];
        if (list.length < 2 || p.length < 2) continue;
        runs.push({ id: `r${runs.length}`, key, points: p, edges: orderLanes(p, list.map((id) => routeOf.get(id)!)) });
      }
      return { routes, runs, levels: makeLevels(graph, root, routeOf, marks) };
    },
  };
  return options.maxNodes === undefined ? router : { ...router, maxNodes: options.maxNodes };
}

/**
 * This function gives one zoom level for each depth of the tree, and a last level with each node alone.
 * At depth d, a section of depth d is one item. A link joins two items and counts the edges between them.
 * Its points are the part of the route of its first edge between the two items.
 */
function makeLevels(
  graph: Graph,
  root: Section,
  routeOf: ReadonlyMap<string, Route>,
  marks: ReadonlyMap<string, ReadonlyMap<Section, number>>,
): Level[] {
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
    const links = new Map<string, { source: string; target: string; count: number; points: readonly Point[] }>();
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
      const route = routeOf.get(e.id)?.points ?? [];
      const mark = marks.get(e.id);
      const from = typeof a === "number" ? 0 : (mark?.get(a) ?? 0);
      const to = typeof b === "number" ? route.length - 1 : (mark?.get(b) ?? route.length - 1);
      links.set(key, { source: ida, target: idb, count: 1, points: route.slice(from, to + 1) });
    }
    levels.push({ depth: d, items, links: [...links.values()] as LevelLink[] });
  }
  return levels;
}
