import { levelLinks } from "../levels.ts";
import type { Graph, Node, Result } from "../model.ts";
import { makeRoom, openGaps, roomLinks, type RoomOptions } from "../room/index.ts";
import { gapLanes, LANE_ORDERS, type LaneOrder } from "../room/lanes.ts";
import { sectionsRouter } from "../routers/sections.ts";
import { laneRoutes, runKey, segmentsOf } from "../segments.ts";
import { roomStrategies } from "../strategies/builtins.ts";
import type { Strategy } from "../strategies/model.ts";
import { measureLinks, measureRouteFaults, type LinkFaults } from "./links.ts";
import { measureQuality } from "./quality.ts";

// The core runs in any host, so it reads the clock without the types of Node or the browser.
const now = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

/** One row of the benchmark of the room: one state of a board, packed or open, and the measures of its links. */
export interface RoomBenchRow {
  readonly fixture: string;
  /** The state of the board: `packed`, `gutter` (each gap open to the gutter only), or a method of `roomDemand`. */
  readonly board: string;
  /** The area of the bounding box of the boxes, as a share of the area of the packed board. */
  readonly area: number;
  /** The faults of the links of the far view (`levelLinks` with each box as one item). */
  readonly faults: LinkFaults;
  /** The crossings of the links of the far view (`measureQuality`). */
  readonly crossings: number;
  /** The ink of the links of the far view. */
  readonly ink: number;
  /** The mean detour of the links of the far view. */
  readonly detour: number;
  /**
   * The number of lane routes of the router `sections` that go through a box. Each shared segment opens to one lane for each edge,
   * at the spacing of the options (`laneRoutes`).
   */
  readonly laneThrough: number;
  /** The time of `makeRoom`, in milliseconds. It is 0 for the packed board. */
  readonly ms: number;
}

/** This function gives the area of the bounding box of the nodes. */
function areaOf(nodes: readonly Node[]): number {
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
  return nodes.length ? (x1 - x0) * (y1 - y0) : 0;
}

/**
 * This function measures the links of one board. It measures the links of the far view, with each node of the graph as one item of a level.
 * With a lane order, each link of the far view gets its own lane in each gap (`gapLanes` at the lane width `spacing`).
 * Without it, the links of a gap share the lines of the level links.
 * The function also measures the lane routes of the router `sections` at the lane width `spacing`.
 */
export function measureBoard(graph: Graph, spacing: number, order?: LaneOrder): Omit<RoomBenchRow, "fixture" | "board" | "area" | "ms"> {
  const links = roomLinks(graph);
  const items = graph.nodes.map((n) => ({ id: n.id, box: n.box, nodes: [n.id] }));
  const level = levelLinks(
    items,
    links.map((l) => ({ source: l.source, target: l.target, count: l.count ?? 1 })),
  );
  const drawn = order ? gapLanes(graph.nodes, level, { spacing, order }) : level;
  const boxes = new Map(graph.nodes.map((n) => [n.id, n.box]));
  // `measureQuality` reads routes of edges, so each link of the far view stands for the first edge of its pair.
  const edgeOf = new Map<string, string>();
  for (const e of graph.edges) {
    const key = `${e.source.node}\u0000${e.target.node}`;
    if (!edgeOf.has(key)) edgeOf.set(key, e.id);
  }
  const asRoutes: Result = { routes: drawn.map((l) => ({ edge: edgeOf.get(`${l.source}\u0000${l.target}`)!, points: l.points })) };
  const q = measureQuality(graph, asRoutes);
  const routed = sectionsRouter({ name: "sections" }).route(graph);
  const segments = segmentsOf(routed);
  const open = new Set(segments.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
  const lanes = laneRoutes(segments, open, spacing);
  return {
    faults: measureLinks(boxes, drawn),
    crossings: q.crossings,
    ink: q.ink,
    detour: q.detour,
    laneThrough: measureRouteFaults(graph, { routes: lanes }).through,
  };
}

/**
 * This function measures a packed board, the board with each gap open to the gutter only, and the board that each room strategy opens.
 * The options are the same for each strategy, except `method`. The default strategies are the methods `routes` and `lines` of `roomDemand`.
 */
export function benchRoom(
  fixture: string,
  graph: Graph,
  options: RoomOptions = {},
  methods: readonly Strategy<"room">[] = [roomStrategies.routes, roomStrategies.lines],
): RoomBenchRow[] {
  const spacing = options.spacing ?? 4;
  const area0 = areaOf(graph.nodes);
  const links = roomLinks(graph);
  const row = (board: string, nodes: readonly Node[], ms: number): RoomBenchRow => ({
    fixture,
    board,
    area: area0 > 0 ? areaOf(nodes) / area0 : 1,
    ms,
    ...measureBoard({ nodes, edges: graph.edges }, spacing),
  });
  const rows = [row("packed", graph.nodes, 0)];
  const t0 = now();
  const gutter = makeRoom(graph.nodes, links, { ...options, spacing: 0, method: "routes" });
  rows.push(row("gutter", gutter.items, now() - t0));
  const { method: _method, ...preset } = options;
  for (const s of methods) {
    const t1 = now();
    const gaps = s.run({ items: graph.nodes, links }, preset);
    const nodes = openGaps(graph.nodes, gaps, options.snap);
    rows.push(row(s.name, nodes, now() - t1));
  }
  return rows;
}

/** One setting of a sweep of the room: the options of `makeRoom` and the lane order of the far view. */
export interface RoomSetting {
  /** The name of the setting in the column `board`. */
  readonly name: string;
  readonly options: RoomOptions;
  /** The lane order of the far view. Without it, the links of a gap share the lines of the level links. */
  readonly lanes?: LaneOrder;
}

/**
 * This function measures the board that `makeRoom` opens with each setting, with the method `routes`.
 * The first row is the fair baseline: the board with each gap open to the gutter of `baseline` only, measured at the spacing of `baseline`.
 */
export function sweepRoom(fixture: string, graph: Graph, settings: readonly RoomSetting[], baseline: RoomOptions = { gutter: 8, spacing: 4 }): RoomBenchRow[] {
  const area0 = areaOf(graph.nodes);
  const links = roomLinks(graph);
  const row = (board: string, nodes: readonly Node[], ms: number, spacing: number, lanes?: LaneOrder): RoomBenchRow => ({
    fixture,
    board,
    area: area0 > 0 ? areaOf(nodes) / area0 : 1,
    ms,
    ...measureBoard({ nodes, edges: graph.edges }, spacing, lanes),
  });
  const fair = makeRoom(graph.nodes, links, { ...baseline, spacing: 0, method: "routes", maxGrowth: Infinity, passes: 1 });
  const rows = [row("gutter", fair.items, 0, baseline.spacing ?? 4)];
  for (const s of settings) {
    const t0 = now();
    const open = makeRoom(graph.nodes, links, { ...s.options, method: "routes" });
    rows.push(row(s.name, open.items, now() - t0, s.options.spacing ?? 4, s.lanes));
  }
  return rows;
}

/** The values of `maxGrowth` of the sweep of ROOM-A. */
export const GROWTH_SWEEP: readonly number[] = [0, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.25, 0.3, 0.35, 0.5, Infinity];

/** This function gives the settings of ROOM-A: the area and the faults for each `maxGrowth`, at gutter 8 and spacing 4. */
export function growthSettings(values: readonly number[] = GROWTH_SWEEP): RoomSetting[] {
  return values.map((m) => ({ name: `maxGrowth ${m}`, options: { gutter: 8, spacing: 4, maxGrowth: m } }));
}

/**
 * This function gives the settings of ROOM-C: each lane order of the far view at each spacing, at gutter 8.
 * The order `shared` is the far view without lanes, as before ROOM-C.
 */
export function laneSettings(spacings: readonly number[] = [2, 4, 6, 8], orders: readonly LaneOrder[] = LANE_ORDERS): RoomSetting[] {
  return spacings.flatMap((spacing) => [
    { name: `shared spacing ${spacing}`, options: { gutter: 8, spacing } },
    ...orders.map((lanes) => ({ name: `${lanes} spacing ${spacing}`, options: { gutter: 8, spacing }, lanes })),
  ]);
}

/** This function gives the settings of ROOM-D: each gutter with each number of passes, at spacing 4. */
export function passSettings(gutters: readonly number[] = [4, 8, 12, 16], passes: readonly number[] = [1, 2]): RoomSetting[] {
  return gutters.flatMap((gutter) => passes.map((p) => ({ name: `gutter ${gutter} passes ${p}`, options: { gutter, spacing: 4, passes: p } })));
}

/** This function writes the rows of `benchRoom` as a Markdown table. */
export function formatRoom(rows: readonly RoomBenchRow[]): string {
  const head = "| fixture | board | area | links | through | outside | out and back | worst detour | crossings | ink | detour | lane through | ms |";
  const line = "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const body = rows.map((r) => {
    const f = r.faults;
    return `| ${r.fixture} | ${r.board} | ${r.area.toFixed(3)} | ${f.links} | ${f.through} | ${f.outside} | ${f.backtrack} | ${f.worstDetour.toFixed(2)} | ${r.crossings} | ${Math.round(r.ink)} | ${r.detour.toFixed(3)} | ${r.laneThrough} | ${r.ms.toFixed(1)} |`;
  });
  return [head, line, ...body].join("\n");
}
