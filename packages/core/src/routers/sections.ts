import { BACKTRACK_MIN, goesOutAndBack } from "../bench/links.ts";
import { center, dist, pointSegmentDistance, polylineLength, type Point } from "../geom.ts";
import { LEVEL_LINK_DEFAULTS, type LevelLinkOptions } from "../levels.ts";
import { depthLevels, type DepthLevelOptions } from "../levels/depths/index.ts";
import { nodeIndex, type Graph, type Level, type Node, type Result, type Route, type Router, type SharedRun } from "../model.ts";
import { placePlug } from "../plugs.ts";
import { allSections, buildSections, checkSections, SECTION_DEFAULTS, type Section, type SectionOptions } from "../sections.ts";
import { orderLanes, type RunOrder } from "../segments.ts";
import type { Strategy } from "../strategies/model.ts";
import { WayFinder } from "../ways.ts";

/**
 * The options of the router with sections. Each option has a default, and the defaults give the output of version 0.1.5.
 * The options `cap`, `maxDepth` and `collapse` are the limits of the default grouping rule, the quadtree of `buildSections`.
 * The options `tightMargin`, `plugInset` and `throughCost` are the limits of the level links (`levelLinks`).
 */
export interface SectionsOptions extends LevelLinkOptions, SectionOptions {
  /** The name in the benchmark. */
  readonly name: string;
  /**
   * The number of hubs on each side of the lowest common section that a way passes. A smaller number gives shorter ways
   * and fewer shared ways. Without it, a way passes each hub from its node up.
   */
  readonly hubs?: number;
  /**
   * The hub limit. A way through the hubs can be at most this many times as long as the line between its plugs, plus `stretchPad` margins.
   * Else the edge goes directly. The default is 2. The value `Infinity` keeps each way through the hubs.
   */
  readonly stretch?: number;
  /** A way through the hubs can be this many margins longer than `stretch` times the line between its plugs. The default is 4. */
  readonly stretchPad?: number;
  /**
   * A way skips a hub that is more than this many units farther from the target than the nearest approach of the way before it.
   * The default is 80, two times `BACKTRACK_MIN`. The value `Infinity` keeps each hub.
   */
  readonly hubSlack?: number;
  /**
   * The grouping rule: a strategy of the step `group` that makes the tree of sections. The hubs and the zoom levels come from this tree.
   * Without it, the router uses the quadtree of `buildSections` with the options `cap`, `maxDepth` and `collapse`.
   */
  readonly group?: Strategy<"group">;
  /** The options of the strategy `group`. The strategy gets its `defaults` for each option that this object does not give. */
  readonly groupOptions?: object;
  /**
   * The depths of the tree that get a zoom level with groups. The last level, with each node alone, always comes after them.
   * The default is each depth, from 0 to the depth of the deepest section.
   */
  readonly levels?: readonly number[];
  /**
   * The level rule: a strategy of the step `levels` that makes the zoom levels from the tree and the routes.
   * Without it, the router uses the strategy `depths` (`depthLevels`). The strategy gets the options `levels`, `margin`, `k`, `tightMargin`, `plugInset` and `throughCost` of the router,
   * and then `levelOptions`.
   */
  readonly level?: Strategy<"levels">;
  /** The options of the strategy `level`. They go over the level options of the router. */
  readonly levelOptions?: object;
  /** The lane order of the runs. With `run`, the default, each run gets its order alone. With `bundle`, two edges keep one order on each run of their common stretch. */
  readonly laneOrder?: RunOrder;
  /** The benchmark skips a fixture with more nodes. */
  readonly maxNodes?: number;
}

/** The default values of the numbers of `SectionsOptions`: the limits of the hubs, of the tree and of the level links. */
export const SECTIONS_DEFAULTS: Readonly<Required<Pick<SectionsOptions, "cap" | "maxDepth" | "collapse" | "tightMargin" | "plugInset" | "throughCost" | "hubs" | "stretch" | "stretchPad" | "hubSlack">>> =
  Object.freeze({
    cap: SECTION_DEFAULTS.cap,
    maxDepth: SECTION_DEFAULTS.maxDepth,
    collapse: SECTION_DEFAULTS.collapse,
    tightMargin: LEVEL_LINK_DEFAULTS.tightMargin,
    plugInset: LEVEL_LINK_DEFAULTS.plugInset,
    throughCost: LEVEL_LINK_DEFAULTS.throughCost,
    hubs: Infinity,
    stretch: 2,
    stretchPad: 4,
    hubSlack: 2 * BACKTRACK_MIN,
  });

const dedupe = (p: readonly Point[]): Point[] => p.filter((q, i) => i === 0 || dist(q, p[i - 1]!) > 1e-9);

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
      const stretch = options.stretch ?? SECTIONS_DEFAULTS.stretch;
      const stretchPad = options.stretchPad ?? SECTIONS_DEFAULTS.stretchPad;
      const hubSlack = options.hubSlack ?? SECTIONS_DEFAULTS.hubSlack;
      const byId = nodeIndex(graph);
      const indexOfNode = new Map(graph.nodes.map((n, i) => [n.id, i]));
      const ways = new WayFinder(graph.nodes, options);
      const corners = ways.corners;
      const root = groupNodes(graph, options);
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
          if (dist(h, to) > near + hubSlack) continue;
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
        const keep = options.hubs ?? SECTIONS_DEFAULTS.hubs;
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
        if (polylineLength(out) > stretch * dist(ps.point, pt.point) + stretchPad * ways.margin || goesOutAndBack(out)) {
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
        runs.push({ id: `r${runs.length}`, key, points: p, edges: orderLanes(p, list.map((id) => routeOf.get(id)!), options.laneOrder) });
      }
      return { routes, runs, levels: makeLevels(graph, root, routes, options) };
    },
  };
  return options.maxNodes === undefined ? router : { ...router, maxNodes: options.maxNodes };
}

/** This function gives the tree of sections of the grouping rule. It examines the tree of a strategy (`checkSections`). */
function groupNodes(graph: Graph, options: SectionsOptions): Section {
  if (!options.group) return buildSections(graph.nodes, options);
  const root = options.group.run(graph, options.groupOptions);
  checkSections(root, graph.nodes.length);
  return root;
}

/** The keys of the router options that the level rule gets. */
const LEVEL_KEYS = ["levels", "margin", "k", "tightMargin", "plugInset", "throughCost"] as const;

/**
 * This function gives the zoom levels of the router: the levels of the strategy `level`, or else the levels of `depthLevels`.
 * The strategy gets the level options of the router that have a value, and then `levelOptions`.
 */
function makeLevels(graph: Graph, root: Section, routes: readonly Route[], options: SectionsOptions): Level[] {
  if (!options.level) return depthLevels({ graph, root, routes }, options);
  const own: Record<string, unknown> = {};
  for (const key of LEVEL_KEYS) if (options[key] !== undefined) own[key] = options[key];
  return options.level.run({ graph, root, routes }, { ...(own as DepthLevelOptions), ...options.levelOptions });
}
