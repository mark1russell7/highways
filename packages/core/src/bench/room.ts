import type { Box } from "../geom.ts";
import { levelLinks } from "../levels.ts";
import type { Graph, LevelLink, Node, Result, Router } from "../model.ts";
import { makeRoom, openGaps, roomLinks, type RoomOptions } from "../room/index.ts";
import { gapLaneCounts, gapLanes, LANE_ORDERS, LANE_TRACKS, type LaneOrder, type LaneTracks } from "../room/lanes.ts";
import { levelPairs, levelRoom, type LevelRoomOptions } from "../room/levels/index.ts";
import { buildSections, levelCut, treeDepth, type SectionOptions } from "../sections.ts";
import { sectionsRouter } from "../routers/sections.ts";
import { laneRoutes, runKey, segmentsOf } from "../segments.ts";
import { roomStrategies } from "../strategies/builtins.ts";
import type { Strategy } from "../strategies/model.ts";
import { benchHighways, type HighwayMeasures } from "./curves.ts";
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
function areaOf(nodes: readonly { readonly box: Box }[]): number {
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
  const q = farQuality(graph, drawn);
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

/** This function gives the links of the far view of a board: `levelLinks` with each node as one item. */
function farLinks(graph: Graph): LevelLink[] {
  const items = graph.nodes.map((n) => ({ id: n.id, box: n.box, nodes: [n.id] }));
  return levelLinks(
    items,
    roomLinks(graph).map((l) => ({ source: l.source, target: l.target, count: l.count ?? 1 })),
  );
}

/** This function measures the links of the far view with `measureQuality`. Each link stands for the first edge of its pair, because `measureQuality` reads routes of edges. */
function farQuality(graph: Graph, drawn: readonly LevelLink[]): ReturnType<typeof measureQuality> {
  const edgeOf = new Map<string, string>();
  for (const e of graph.edges) {
    const key = `${e.source.node}\u0000${e.target.node}`;
    if (!edgeOf.has(key)) edgeOf.set(key, e.id);
  }
  const asRoutes: Result = { routes: drawn.map((l) => ({ edge: edgeOf.get(`${l.source}\u0000${l.target}`)!, points: l.points })) };
  return measureQuality(graph, asRoutes);
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

/** One row of the benchmark of the room of the zoom levels: one level with groups of one board. */
export interface LevelRoomRow {
  readonly fixture: string;
  /** The board: `packed`, `gutter` (each level open to the gutter only), `routes` (the room of the nodes alone), `levels` or `levels each`. */
  readonly board: string;
  readonly depth: number;
  /** The number of items of the level. */
  readonly items: number;
  /** The number of links of the level. */
  readonly links: number;
  /** The area of the bounding box of the items of the level, as a share of the area of the packed board. */
  readonly area: number;
  /** The number of level links that go through a box that is not one of their ends. */
  readonly through: number;
  /** The crossings of the level links, with a lane for each link in each gap (`gapLanes` with the order `crossings`). */
  readonly crossings: number;
  /** The crossings of the level links without lanes. The links of a gap share one line, so this count hides crossings. */
  readonly sharedCrossings: number;
  /** The mean detour of the level links. */
  readonly detour: number;
  /** The worst detour of the level links. */
  readonly worstDetour: number;
  /** The number of pairs of items of the level whose order or alignment on an axis is not the order of the packed board. */
  readonly order: number;
  /** The number of pairs of items of the level before whose order or alignment on an axis changes at this level. */
  readonly levelOrder: number;
  /**
   * The mean shift of an item against its parent from the level before, in gutters. The shift compares the place of the item in its parent
   * at this level with its place in its parent at the level before. The value 0 means that the item moves with its parent.
   */
  readonly shift: number;
  /** The largest shift of an item against its parent, in gutters. */
  readonly worstShift: number;
  /** The time to open the board of all levels, in milliseconds. It is 0 for the packed board. */
  readonly ms: number;
}

/** One board of the benchmark of the room of the zoom levels. It has a name and the nodes at each depth, from 0 to the level with each node alone. */
interface LevelBoards {
  readonly name: string;
  readonly nodes: readonly (readonly Node[])[];
  readonly ms: number;
}

/** This function gives the sign of `d`, with 0 for a value nearer to 0 than `snap`. */
const sign = (d: number, snap: number): number => (Math.abs(d) <= snap ? 0 : Math.sign(d));

/**
 * This function counts the pairs of boxes whose order or alignment on an axis is not the same in `a` and in `b`.
 * The order of two boxes is the order of their left (or top) edges. The cost is quadratic in the number of boxes.
 */
export function orderChanges(a: readonly Box[], b: readonly Box[], snap: number = 0.5): number {
  let n = 0;
  for (const axis of ["x", "y"] as const)
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++) if (sign(a[i]![axis] - a[j]![axis], snap) !== sign(b[i]![axis] - b[j]![axis], snap)) n++;
  return n;
}

const middle = (b: Box): { x: number; y: number } => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/**
 * This function measures the room of the zoom levels of a board. The rows of each board give each level with groups, from depth 1.
 * The boards are the packed board, the fair baseline with each level open to the gutter only, and the room of the nodes alone (`makeRoom`).
 * Then come two boards of `levelRoom` with the options. The board `levels` uses the board of the nearest level for each level.
 * The board `levels each` has a board for each level.
 *
 * The links of each level are `levelLinks` with their defaults. Each link gets a lane of `spacing` in each gap.
 */
export function benchLevelRoom(fixture: string, graph: Graph, options: LevelRoomOptions = {}, sections: SectionOptions = {}): LevelRoomRow[] {
  const gutter = options.gutter ?? 8;
  const spacing = options.spacing ?? 4;
  const snap = options.snap ?? 0.5;
  const root = buildSections(graph.nodes, sections);
  const deepest = treeDepth(root);
  const links = roomLinks(graph);
  const all = (nodes: readonly Node[]): (readonly Node[])[] => Array.from({ length: deepest + 2 }, () => nodes);
  const timed = (name: string, make: () => (readonly Node[])[]): LevelBoards => {
    const t0 = now();
    const nodes = make();
    return { name, nodes, ms: now() - t0 };
  };
  const boards: LevelBoards[] = [
    { name: "packed", nodes: all(graph.nodes), ms: 0 },
    timed("gutter", () => levelRoom(graph.nodes, links, root, { ...options, spacing: 0, maxGrowth: Infinity, passes: 1, board: "each" }).levels.map((l) => l.nodes)),
    timed("routes", () => all(makeRoom(graph.nodes, links, { ...options, method: "routes" }).items)),
    timed("levels", () => levelRoom(graph.nodes, links, root, { ...options, board: "shared" }).levels.map((l) => l.nodes)),
    timed("levels each", () => levelRoom(graph.nodes, links, root, { ...options, board: "each" }).levels.map((l) => l.nodes)),
  ];
  const indexOf = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const area0 = areaOf(graph.nodes);
  const rows: LevelRoomRow[] = [];
  for (const board of boards) {
    for (let d = 1; d <= deepest; d++) {
      const here = board.nodes[d]!;
      const before = board.nodes[d - 1]!;
      const cut = levelCut(here, root, d);
      const pairs = levelPairs(cut.items, cut.owner, indexOf, links);
      const boxes = new Map(cut.items.map((i) => [i.id, i.box]));
      const shared = levelLinks(cut.items, pairs);
      const drawn = gapLanes(cut.items, shared, { spacing, order: "crossings", snap });
      const asGraph: Graph = { nodes: cut.items, edges: pairs.map((p, i) => ({ id: `l${i}`, source: { node: p.source }, target: { node: p.target } })) };
      const asRoutes = (list: readonly LevelLink[]): Result => ({ routes: list.map((l, i) => ({ edge: `l${i}`, points: l.points })) });
      const q = measureQuality(asGraph, asRoutes(drawn));
      const faults = measureLinks(boxes, drawn);
      // The level before: its items at its own places, and the same items at the places of this level.
      const parentsThen = levelCut(before, root, d - 1);
      const parentsNow = levelCut(here, root, d - 1);
      const childrenThen = levelCut(before, root, d);
      let shift = 0;
      let worstShift = 0;
      cut.items.forEach((c, k) => {
        const parent = parentsThen.owner[indexOf.get(c.nodes[0]!)!]!;
        const at = middle(c.box);
        const was = middle(childrenThen.items[k]!.box);
        const parentAt = middle(parentsNow.items[parent]!.box);
        const parentWas = middle(parentsThen.items[parent]!.box);
        const s = Math.hypot(at.x - parentAt.x - (was.x - parentWas.x), at.y - parentAt.y - (was.y - parentWas.y)) / gutter;
        shift += s;
        worstShift = Math.max(worstShift, s);
      });
      rows.push({
        fixture,
        board: board.name,
        depth: d,
        items: cut.items.length,
        links: pairs.length,
        area: area0 > 0 ? areaOf(cut.items) / area0 : 1,
        through: faults.through,
        crossings: q.crossings,
        sharedCrossings: measureQuality(asGraph, asRoutes(shared)).crossings,
        detour: q.detour,
        worstDetour: faults.worstDetour,
        order: orderChanges(
          levelCut(graph.nodes, root, d).items.map((i) => i.box),
          cut.items.map((i) => i.box),
          snap,
        ),
        levelOrder: orderChanges(
          parentsThen.items.map((i) => i.box),
          parentsNow.items.map((i) => i.box),
          snap,
        ),
        shift: cut.items.length ? shift / cut.items.length : 0,
        worstShift,
        ms: board.ms,
      });
    }
  }
  return rows;
}

/** This function writes the rows of `benchLevelRoom` as a Markdown table. */
export function formatLevelRoom(rows: readonly LevelRoomRow[]): string {
  const head = "| fixture | board | depth | items | links | area | through | crossings | shared crossings | detour | worst detour | order | level order | shift | worst shift | ms |";
  const line = "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const body = rows.map(
    (r) =>
      `| ${r.fixture} | ${r.board} | ${r.depth} | ${r.items} | ${r.links} | ${r.area.toFixed(3)} | ${r.through} | ${r.crossings} | ${r.sharedCrossings} | ${r.detour.toFixed(3)} | ${r.worstDetour.toFixed(2)} | ${r.order} | ${r.levelOrder} | ${r.shift.toFixed(2)} | ${r.worstShift.toFixed(2)} | ${r.ms.toFixed(1)} |`,
  );
  return [head, line, ...body].join("\n");
}

/** One row of `benchBendRoom`: the lanes of the bundles of one router on one open board, after `highwayCurves`. */
export interface BendRoomRow extends HighwayMeasures {
  readonly router: string;
  readonly fixture: string;
  /** The board: `room` opens the gaps for the links only, and `room + bends` also opens them for the bends of the bundles. */
  readonly board: "room" | "room + bends";
  /** The area of the bounding box of the boxes, as a share of the area of the board before the room. */
  readonly area: number;
}

/**
 * This function measures the room for the bends of the bundles (HWC-D). It opens the board two times with `makeRoom`, without and with the option `bends`.
 * The option `bends` gets the router and the lane options of the curves. Then the router routes each open board, and `benchHighways` curves its bundles with `highway`.
 */
export function benchBendRoom(router: Router, fixture: string, graph: Graph, options: RoomOptions = { gutter: 8, spacing: 4 }): BendRoomRow[] {
  const lanes = { spacing: 4, maxWidth: 16, minRadius: 4 };
  const links = roomLinks(graph);
  const area0 = areaOf(graph.nodes);
  const boards = [
    ["room", makeRoom(graph.nodes, links, options).items],
    ["room + bends", makeRoom(graph.nodes, links, { ...options, bends: { router, edges: graph.edges, ...lanes } }).items],
  ] as const;
  return boards.map(([board, nodes]) => {
    const [, highway] = benchHighways(router, fixture, { nodes, edges: graph.edges }, { spacing: lanes.spacing, maxWidth: lanes.maxWidth, minRadius: lanes.minRadius });
    const { router: name, fixture: _f, curve: _c, ms: _ms, ...measures } = highway!;
    return { router: name, fixture, board, area: area0 > 0 ? areaOf(nodes) / area0 : 1, ...measures };
  });
}

/** This function writes the rows of `benchBendRoom` as a Markdown table. The spacing error is a percent of the spacing. */
export function formatBendRoom(rows: readonly BendRoomRow[]): string {
  const head = "| router | fixture | board | area | bundles | worst spacing | min radius | under min | through |";
  const line = "|---|---|---|---:|---:|---:|---:|---:|---:|";
  const body = rows.map(
    (r) =>
      `| ${r.router} | ${r.fixture} | ${r.board} | ${r.area.toFixed(3)} | ${r.bundles} | ${(r.worstSpacing * 100).toFixed(1)}% | ${r.minRadius === Infinity ? "-" : r.minRadius.toFixed(2)} | ${r.underMin} | ${r.through} |`,
  );
  return [head, line, ...body].join("\n");
}

/** One row of `benchTracks` (EDA-004): the lanes of the far view of one board with one lane rule of `gapLanes`. */
export interface TrackBenchRow {
  readonly fixture: string;
  /** The board: `given` (the board as it is) or `open` (the board that `makeRoom` opens at gutter 8 and spacing 4). */
  readonly board: string;
  readonly tracks: LaneTracks;
  /** The number of gaps with at least one piece. */
  readonly gaps: number;
  /** The sum of the lanes of the gaps. */
  readonly lanes: number;
  /** The sum of the densities of the gaps: the most pieces that overlap at one place. No rule gives fewer lanes. */
  readonly density: number;
  /** The number of gaps whose lanes are nearer than `spacing`, because the gap is too narrow for its lanes. */
  readonly squeezed: number;
  /** The crossings of the links of the far view (`measureQuality`). */
  readonly crossings: number;
  /** The ink of the links of the far view. */
  readonly ink: number;
  /** R12: the length of parallel legs of two links nearer than `spacing`, as a share of the ink. */
  readonly separation: number;
  /** The number of links of the far view that go through a box. */
  readonly through: number;
}

/**
 * This function gives R12 (lane separation) of the links. Two legs of two links are near when they are parallel and nearer than `near`.
 * R12 is the length of the near legs, as a share of the ink.
 * It reads only the legs on an axis. The links of the far view have no other legs.
 */
export function laneSeparation(links: readonly LevelLink[], near: number): number {
  let ink = 0;
  let close = 0;
  for (const across of ["x", "y"] as const) {
    const along = across === "x" ? "y" : "x";
    const legs: { link: number; at: number; lo: number; hi: number }[] = [];
    links.forEach((l, li) => {
      for (let i = 1; i < l.points.length; i++) {
        const a = l.points[i - 1]!;
        const b = l.points[i]!;
        if (Math.abs(a[across] - b[across]) > 1e-6 || Math.abs(a[along] - b[along]) <= 1e-6) continue;
        legs.push({ link: li, at: a[across], lo: Math.min(a[along], b[along]), hi: Math.max(a[along], b[along]) });
      }
    });
    legs.sort((p, q) => p.at - q.at);
    for (let i = 0; i < legs.length; i++) {
      const P = legs[i]!;
      ink += P.hi - P.lo;
      for (let j = i + 1; j < legs.length && legs[j]!.at - P.at < near; j++) {
        const Q = legs[j]!;
        if (Q.link !== P.link) close += Math.max(0, Math.min(P.hi, Q.hi) - Math.max(P.lo, Q.lo));
      }
    }
  }
  return ink > 0 ? close / ink : 0;
}

/**
 * This function measures each lane rule of `gapLanes` (EDA-004) on the board as it is, and on the board that `makeRoom` opens.
 * The lane order is `crossings` for each rule. The lanes are `spacing` apart where the gap has room.
 */
export function benchTracks(fixture: string, graph: Graph, spacing: number = 4, rules: readonly LaneTracks[] = LANE_TRACKS): TrackBenchRow[] {
  const open = makeRoom(graph.nodes, roomLinks(graph), { gutter: 8, spacing, method: "routes" }).items;
  const rows: TrackBenchRow[] = [];
  for (const [board, nodes] of [
    ["given", graph.nodes],
    ["open", open],
  ] as const) {
    const g: Graph = { nodes, edges: graph.edges };
    const level = farLinks(g);
    const boxes = new Map(nodes.map((n) => [n.id, n.box]));
    for (const tracks of rules) {
      const options = { spacing, order: "crossings" as const, tracks };
      const counts = gapLaneCounts(nodes, level, options);
      const drawn = gapLanes(nodes, level, options);
      const q = farQuality(g, drawn);
      rows.push({
        fixture,
        board,
        tracks,
        gaps: counts.length,
        lanes: counts.reduce((s, c) => s + c.lanes, 0),
        density: counts.reduce((s, c) => s + c.density, 0),
        squeezed: counts.filter((c) => c.width / (c.lanes + 1) < spacing - 1e-9).length,
        crossings: q.crossings,
        ink: q.ink,
        separation: laneSeparation(drawn, spacing),
        through: measureLinks(boxes, drawn).through,
      });
    }
  }
  return rows;
}

/** This function writes the rows of `benchTracks` as a Markdown table. */
export function formatTracks(rows: readonly TrackBenchRow[]): string {
  const head = "| fixture | board | tracks | gaps | lanes | density | squeezed | crossings | ink | R12 | through |";
  const line = "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|";
  const body = rows.map(
    (r) =>
      `| ${r.fixture} | ${r.board} | ${r.tracks} | ${r.gaps} | ${r.lanes} | ${r.density} | ${r.squeezed} | ${r.crossings} | ${Math.round(r.ink)} | ${r.separation.toFixed(4)} | ${r.through} |`,
  );
  return [head, line, ...body].join("\n");
}
