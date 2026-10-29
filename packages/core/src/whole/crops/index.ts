/**
 * The whole strategy `crops` (WILD-048): tune on crops of the board. A few seeded windows of the board rank the settings, and the whole board routes with the best one.
 * The idea WILD-047 (successive halving) is not built, so the fixed list of settings of `board-portfolio` is the tuner.
 */
import { checkProperties } from "../../bench/properties.ts";
import { center, type Box, type Point } from "../../geom.ts";
import type { Edge, Graph, Node } from "../../model.ts";
import type { WholeOutput } from "../../strategies/model.ts";
import { runPipeline } from "../pipeline/index.ts";
import { BOARD_PORTFOLIO_DEFAULTS, boardPortfolio, portfolioMeasures, rankShares, type PortfolioSetting } from "../portfolio/index.ts";

/** The options of the whole strategy `crops` (WILD-048). */
export interface CropOptions {
  /** The number of windows, from 3 to 10. The default is 3. */
  readonly windows: number;
  /** The number of nodes of each window, from 50 to 300. The default is 50. A board with this number of nodes or fewer is one window: the board itself. */
  readonly nodes: number;
  /** The number of settings that the windows rank, from the start of the list, from 3 to 12. The default is 4. */
  readonly settings: number;
  /** The seed of the centers of the windows. The default is 1. */
  readonly seed: number;
}

/** The default options of the strategy `crops`. */
export const CROP_DEFAULTS: Readonly<CropOptions> = Object.freeze({ windows: 3, nodes: 50, settings: 4, seed: 1 });

/** The distance from the boxes of a window to its border, where the cut edges end. */
const BORDER = 24;

/** The grid of the border points of the cut edges. Two cut edges with one border point on this grid share one stub node. */
const SNAP = 8;

/** The size of the stub node of a cut edge. */
const STUB = 4;

/** This function gives a seeded generator of numbers from 0 to 1 (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** This function gives the bounds of the boxes of a list of nodes. */
function boundsOf(nodes: readonly Node[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.box.x);
    y0 = Math.min(y0, n.box.y);
    x1 = Math.max(x1, n.box.x + n.box.w);
    y1 = Math.max(y1, n.box.y + n.box.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** This function gives the point where the ray from `from`, a point in the box, toward `to` leaves the box. */
function exitPoint(box: Box, from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (box.x + box.w - from.x) / dx);
  if (dx < 0) t = Math.min(t, (box.x - from.x) / dx);
  if (dy > 0) t = Math.min(t, (box.y + box.h - from.y) / dy);
  if (dy < 0) t = Math.min(t, (box.y - from.y) / dy);
  if (!Number.isFinite(t)) return { x: box.x, y: box.y };
  return { x: from.x + dx * t, y: from.y + dy * t };
}

/**
 * This function cuts one window of a board (WILD-048): the `size` nodes nearest to the center `at`, by the larger of the distances on the two axes. Thus the window is a square.
 * An edge with both ends in the window stays. An edge with one end in the window goes to a small stub node at its border, `BORDER` from the boxes.
 * A node whose parent is not in the window loses its parent.
 */
export function cropWindow(graph: Graph, at: Point, size: number): Graph {
  const far = (n: Node): number => {
    const c = center(n.box);
    return Math.max(Math.abs(c.x - at.x), Math.abs(c.y - at.y));
  };
  const order = graph.nodes.map((n, i) => ({ n, i, d: far(n) })).sort((a, b) => a.d - b.d || a.i - b.i);
  const keep = new Set(order.slice(0, size).map((x) => x.n.id));
  const nodes: Node[] = [];
  for (const n of graph.nodes) {
    if (!keep.has(n.id)) continue;
    if (n.parent !== undefined && !keep.has(n.parent)) {
      const { parent: _, ...rest } = n;
      nodes.push(rest);
    } else nodes.push(n);
  }
  const b = boundsOf(nodes);
  const border: Box = { x: b.x - BORDER, y: b.y - BORDER, w: b.w + 2 * BORDER, h: b.h + 2 * BORDER };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const stubs = new Map<string, Node>();
  const edges: Edge[] = [];
  for (const e of graph.edges) {
    const s = keep.has(e.source.node);
    const t = keep.has(e.target.node);
    if (s && t) edges.push(e);
    if (s === t) continue;
    const inside = byId.get(s ? e.source.node : e.target.node);
    const outside = byId.get(s ? e.target.node : e.source.node);
    if (!inside || !outside) continue;
    const p = exitPoint(border, center(inside.box), center(outside.box));
    const q = { x: Math.round(p.x / SNAP) * SNAP, y: Math.round(p.y / SNAP) * SNAP };
    const key = `${q.x},${q.y}`;
    let stub = stubs.get(key);
    if (!stub) stubs.set(key, (stub = { id: `crop-stub-${stubs.size}`, box: { x: q.x - STUB / 2, y: q.y - STUB / 2, w: STUB, h: STUB } }));
    edges.push(s ? { ...e, target: { node: stub.id } } : { ...e, source: { node: stub.id } });
  }
  return { nodes: [...nodes, ...stubs.values()], edges };
}

/** The result of `crops`: the output, the name of the pick, and the summed score of each setting on the windows, in the order of the list. */
export interface CropRun {
  readonly output: WholeOutput;
  readonly pick: string;
  readonly scores: readonly { readonly name: string; readonly score: number }[];
}

/**
 * This function runs the whole strategy `crops` (WILD-048). It cuts `windows` seeded windows of `nodes` nodes, and runs the first `settings` settings of `list` on each one.
 * On each window, the score of a setting is the sum of its rank shares of the crossings (R1), the median detour (R5) and the ink saved (B1), as in `board-portfolio`.
 * A setting with a break of a hard rule on a window gets the worst score there. The least sum wins, a tie goes to the earlier setting, and the whole board routes with it.
 * When the pick breaks a hard rule on the whole board, the next setting by score routes. A board of `nodes` nodes or fewer runs `board-portfolio` itself.
 */
export function crops(graph: Graph, list: readonly PortfolioSetting[], options: Partial<CropOptions> = {}): CropRun {
  const o = { ...CROP_DEFAULTS, ...options };
  const count = Math.max(1, Math.min(list.length, Math.floor(o.settings)));
  const size = Math.max(2, Math.floor(o.nodes));
  if (graph.nodes.length <= size) {
    const run = boardPortfolio(graph, list, { ...BOARD_PORTFOLIO_DEFAULTS, settings: count });
    return { output: run.output, pick: run.pick, scores: [] };
  }
  const settings = list.slice(0, count).filter((s) => {
    const limit = (s.pipeline.highway ?? s.pipeline.router).maxNodes;
    return limit === undefined || graph.nodes.length <= limit;
  });
  if (settings.length === 0) return { output: runPipeline(graph, list[0]!.pipeline), pick: list[0]!.name, scores: [] };
  const next = random(o.seed);
  const total = new Array<number>(settings.length).fill(0);
  for (let w = 0; w < Math.max(1, Math.floor(o.windows)); w++) {
    const pick = graph.nodes[Math.min(graph.nodes.length - 1, Math.floor(next() * graph.nodes.length))]!;
    const window = cropWindow(graph, center(pick.box), size);
    const runs = settings.map((s) => {
      const out = runPipeline(window, s.pipeline);
      return checkProperties(out.graph, out.result, 1).length > 0 ? undefined : portfolioMeasures(out.graph, out.result);
    });
    const good = runs.flatMap((r, i) => (r === undefined ? [] : [{ r, i }]));
    const r1 = rankShares(good.map((g) => g.r.crossings), true);
    const r5 = rankShares(good.map((g) => g.r.detour), true);
    const b1 = rankShares(good.map((g) => g.r.ink), false);
    const score = new Array<number>(settings.length).fill(3);
    good.forEach((g, j) => (score[g.i] = r1[j]! + r5[j]! + b1[j]!));
    score.forEach((v, i) => (total[i]! += v));
  }
  const scores = settings.map((s, i) => ({ name: s.name, score: total[i]! }));
  const ranked = settings.map((s, i) => ({ s, i })).sort((a, b) => total[a.i]! - total[b.i]! || a.i - b.i);
  let first: { name: string; output: WholeOutput } | undefined;
  for (const { s } of ranked) {
    const output = runPipeline(graph, s.pipeline);
    if (checkProperties(output.graph, output.result, 1).length === 0) return { output, pick: s.name, scores };
    first ??= { name: s.name, output };
  }
  return { output: first!.output, pick: first!.name, scores };
}
