import { levelLinks } from "../levels.ts";
import type { Graph, Node, Result } from "../model.ts";
import { makeRoom, openGaps, roomLinks, type RoomOptions } from "../room/index.ts";
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
 * It also measures the lane routes of the router `sections` at the lane width `spacing`.
 */
export function measureBoard(graph: Graph, spacing: number): Omit<RoomBenchRow, "fixture" | "board" | "area" | "ms"> {
  const links = roomLinks(graph);
  const items = graph.nodes.map((n) => ({ id: n.id, box: n.box, nodes: [n.id] }));
  const drawn = levelLinks(
    items,
    links.map((l) => ({ source: l.source, target: l.target, count: l.count ?? 1 })),
  );
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
