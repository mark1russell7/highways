/**
 * This module makes the rows of the record `route-tie/1` (ROUTE-TIE).
 * Each arm reads the boards of the families with one text of the corner search. The script `route-tie.ts` starts each arm in its own process.
 * The record holds the table of the tolerances, and the moves and the law for each router.
 * It also holds the floor of each route measure, the moves under a shift, and the table of the two keys of the walk.
 */
import { deriveSeed, fnv1a32, mulberry32, seedOf } from "@mark1russell7/rigor-generators";
import { median, medianInterval } from "@mark1russell7/rigor-statistics";
import { routePairCrossings } from "../src/bench/quality.ts";
import { benchRun } from "../src/bench/run.ts";
import { routeMeasures } from "../src/bench/suite.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { dist, type Point } from "../src/geom.ts";
import { edgePlugs } from "../src/highways/stretches.ts";
import { resolvePorts, splitFrames, type Graph, type Router } from "../src/model.ts";
import { ROUTERS, sectionsRouter } from "../src/routers/index.ts";
import { WayFinder } from "../src/ways.ts";
import { WORK } from "../src/work.ts";

/** The command that writes the record again. */
export const REGENERATE = "node packages/core/scripts/route-tie.ts packages/core/scripts/data/route-tie/record.json";
/** The version of the record. */
export const SCHEMA = "route-tie/1";
/** The commit of the search before the tie rule. */
export const BEFORE = "0896104fb0ebceab108d069218c56f72b7917f84";
/** The distance of a tie that the source holds. */
export const CHOSEN = 1e-9;
/** The distances of the table. They read each side of the chosen distance. */
export const TOLERANCES = [0, 1e-13, 1e-12, 1e-11, 1e-10, 1e-9, 1e-8, 1e-7, 1e-6, 1e-5, 1e-3] as const;
/** The factors of the search floor of the law. */
export const FLOORS = [1, 0.5, 0.25] as const;
/** The largest move of a shift on each axis. */
export const SHIFT = 1e-12;
/** The named seeds of the shifts. */
export const VECTORS = ["shift-a", "shift-b", "shift-c", "shift-d", "shift-e"] as const;
/** The seeds of each family. */
export const SEEDS = 3;
/** A point that moves over this distance moves the route. */
export const MOVE = 1e-6;
/** The routers of the record. The library has no default router: its first example calls `corners`, and the host names the router. */
export const NAMES = ["corners", "shared", "shared-all", "sections", "trunks", "sections-site"] as const;
/** The boards and the routers of the part of the record that a test compares with fresh rows. */
export const SLICE = { families: ["hub-chain", "maze"], seeds: 1, routers: ["corners", "shared", "sections"] } as const;

const SITE = sectionsRouter({ name: "sections-site", margin: 20, stretch: 3, cap: 6 });

/** This function gives the router of a name. */
export const routerNamed = (name: string): Router => (name === SITE.name ? SITE : ROUTERS.find((r) => r.name === name)!);

/** The shift of one seed. The size of each axis is between half of `SHIFT` and `SHIFT`, with its own sign. `shiftOf` of `paint-tie-rows.ts` has this form, and this copy goes when that module lands. */
export function shiftOf(name: string): { readonly dx: number; readonly dy: number } {
  const next = mulberry32(deriveSeed(seedOf(name), String(SHIFT)));
  const axis = (): number => (next() < 0.5 ? -1 : 1) * SHIFT * (0.5 + 0.5 * next());
  return { dx: axis(), dy: axis() };
}

/** One board and one router in one arm. */
export interface ArmRow {
  readonly family: string;
  readonly seed: number;
  readonly router: string;
  readonly lines: Readonly<Record<string, readonly Point[]>>;
  readonly work: number;
  readonly length: number;
  readonly pairs: number;
  /** The route measures. Only an arm with `measures` holds them. */
  readonly measures?: Readonly<Record<string, number>>;
  /** The corner graph and the corner path of each edge, before the pull. Only the router `corners` holds them. */
  readonly corner?: { readonly points: number; readonly links: number; readonly raw: Readonly<Record<string, readonly Point[] | null>> };
}

/** The boards and the options of one arm. */
export interface ArmOptions {
  readonly routers: readonly string[];
  readonly families?: readonly string[];
  readonly seeds?: number;
  readonly shift?: { readonly dx: number; readonly dy: number };
  readonly measures?: boolean;
}

const moveBoard = (board: Graph, shift: { readonly dx: number; readonly dy: number }): Graph => ({
  ...board,
  nodes: board.nodes.map((n) => ({ ...n, box: { ...n.box, x: n.box.x + shift.dx, y: n.box.y + shift.dy } })),
});

/** This function reads the corner graph and the corner path of each edge of a board. */
function cornerRead(board: Graph): NonNullable<ArmRow["corner"]> {
  const { graph } = splitFrames(resolvePorts(board));
  const ways = new WayFinder(graph.nodes);
  const c = ways.corners;
  let links = 0;
  for (let i = 0; i < c.points.length; i++) links += [...c.neighbours(i)].length;
  const raw: Record<string, readonly Point[] | null> = {};
  for (const { edge, ps, pt } of edgePlugs(graph)) raw[edge.id] = c.path(ways.out(ps!), ways.out(pt!)) ?? null;
  return { points: c.points.length, links, raw };
}

/** This function reads the boards of one arm. */
export function armRows(options: ArmOptions): ArmRow[] {
  const reg = highwaysRegistry();
  const rows: ArmRow[] = [];
  for (const family of options.families ?? HIGHWAYS_FAMILIES.map((f) => f.name)) {
    for (let seed = 0; seed < (options.seeds ?? SEEDS); seed++) {
      const base = reg.generate(family, seed).graph;
      const board = options.shift ? moveBoard(base, options.shift) : base;
      for (const name of options.routers) {
        const router = routerNamed(name);
        const start = WORK.corner;
        const result = router.route(board);
        const work = WORK.corner - start;
        // The function `benchRun` routes the board two times, so the count of the work comes before it.
        const run = options.measures ? benchRun(router, family, board, 1) : undefined;
        const lines: Record<string, readonly Point[]> = {};
        let length = 0;
        for (const r of result.routes) {
          lines[r.edge] = r.points;
          for (let i = 1; i < r.points.length; i++) length += dist(r.points[i - 1]!, r.points[i]!);
        }
        rows.push({
          family,
          seed,
          router: name,
          lines,
          work,
          length,
          pairs: routePairCrossings(result.routes).pairs,
          ...(run ? { measures: routeMeasures(board, run.result, run.row) } : {}),
          ...(name === "corners" ? { corner: cornerRead(board) } : {}),
        });
      }
    }
  }
  return rows;
}

const samePoints = (p: readonly Point[] | null | undefined, q: readonly Point[] | null | undefined, tolerance: number): boolean => {
  if (!p || !q) return !p && !q;
  return p.length === q.length && p.every((v, i) => Math.abs(v.x - q[i]!.x) <= tolerance && Math.abs(v.y - q[i]!.y) <= tolerance);
};

const keyOf = (r: ArmRow): string => `${r.family}/${r.seed}/${r.router}`;

/** This function gives the edges that move between two rows. */
const movedEdges = (a: ArmRow, b: ArmRow | undefined, tolerance: number): string[] => Object.keys(a.lines).filter((edge) => !b || !samePoints(a.lines[edge], b.lines[edge], tolerance));

/** This function counts the routes that move between two arms. The tolerance 0 asks for the same bytes. */
export function movedRoutes(a: readonly ArmRow[], b: readonly ArmRow[], tolerance: number = MOVE, router?: string): number {
  const other = new Map(b.map((r) => [keyOf(r), r]));
  return a.filter((r) => !router || r.router === router).reduce((sum, r) => sum + movedEdges(r, other.get(keyOf(r)), tolerance).length, 0);
}

const pick = (rows: readonly ArmRow[], router: string): ArmRow[] => rows.filter((r) => r.router === router);
const sum = (rows: readonly ArmRow[], read: (r: ArmRow) => number): number => rows.reduce((total, r) => total + read(r), 0);

/** One row of the table of the tolerances, on the router `corners`. */
export interface ToleranceRow {
  readonly tie: number;
  readonly movedFromChosen: number;
  readonly law: number;
  readonly work: number;
  readonly length: number;
  readonly pairs: number;
  readonly shiftMoves: number;
}

/** This function gives one row of the table: the arm at the distance, at two lower floors and under each shift. */
export function toleranceRow(tie: number, chosen: readonly ArmRow[], base: readonly ArmRow[], lower: readonly (readonly ArmRow[])[], shifted: readonly (readonly ArmRow[])[]): ToleranceRow {
  return {
    tie,
    movedFromChosen: movedRoutes(chosen, base),
    law: lower.reduce((total, arm) => total + movedRoutes(base, arm, 0), 0),
    work: sum(base, (r) => r.work),
    length: sum(base, (r) => r.length),
    pairs: sum(base, (r) => r.pairs),
    shiftMoves: shifted.reduce((total, arm) => total + movedRoutes(base, arm), 0),
  };
}

/** One row for one router: the routes that move against the search before the rule, the law, the sums and the moves under each shift. */
export interface RouterRow {
  readonly router: string;
  readonly routes: number;
  readonly moved: number;
  readonly lawBefore: readonly number[];
  readonly lawAfter: readonly number[];
  readonly workBefore: number;
  readonly workAfter: number;
  readonly lengthBefore: number;
  readonly lengthAfter: number;
  readonly pairsBefore: number;
  readonly pairsAfter: number;
  readonly shiftBefore: readonly number[];
  readonly shiftAfter: readonly number[];
}

/** The arms of one side of the rule: at each floor, and under each shift. */
export interface Side {
  readonly floors: readonly (readonly ArmRow[])[];
  readonly shifts: readonly (readonly ArmRow[])[];
}

/** This function gives the row of one router. */
export function routerRow(router: string, before: Side, after: Side): RouterRow {
  const old = pick(before.floors[0]!, router);
  const now = pick(after.floors[0]!, router);
  const law = (side: Side): number[] => side.floors.slice(1).map((arm) => movedRoutes(pick(side.floors[0]!, router), arm, 0));
  const shifts = (side: Side): number[] => side.shifts.map((arm) => movedRoutes(pick(side.floors[0]!, router), arm));
  return {
    router,
    routes: sum(now, (r) => Object.keys(r.lines).length),
    moved: movedRoutes(old, now),
    lawBefore: law(before),
    lawAfter: law(after),
    workBefore: sum(old, (r) => r.work),
    workAfter: sum(now, (r) => r.work),
    lengthBefore: sum(old, (r) => r.length),
    lengthAfter: sum(now, (r) => r.length),
    pairsBefore: sum(old, (r) => r.pairs),
    pairsAfter: sum(now, (r) => r.pairs),
    shiftBefore: shifts(before),
    shiftAfter: shifts(after),
  };
}

/** The sums of one router with one key of the walk, over the boards of the families. */
export interface KeyRow {
  readonly router: string;
  /** The routes that move against the search before the rule. */
  readonly moved: number;
  /** The routes that move at each lower floor of the search: the law. */
  readonly law: readonly number[];
  /** The routes that move under each shift. */
  readonly shift: readonly number[];
  readonly work: number;
  readonly length: number;
  readonly pairs: number;
  /** The sum of each route measure over the boards. */
  readonly measures: Readonly<Record<string, number>>;
}

/** The keys of the walk: the search before the rule, the key `index` and the key `straight`. */
export interface KeyTable {
  readonly before: readonly KeyRow[];
  readonly index: readonly KeyRow[];
  readonly straight: readonly KeyRow[];
}

/** This function gives the row of one router on one side, against the search before the rule. */
export function keyRow(router: string, before: Side, side: Side): KeyRow {
  const base = pick(side.floors[0]!, router);
  const measures: Record<string, number> = {};
  for (const r of base) for (const [k, v] of Object.entries(r.measures ?? {})) measures[k] = (measures[k] ?? 0) + v;
  return {
    router,
    moved: movedRoutes(pick(before.floors[0]!, router), base),
    law: side.floors.slice(1).map((arm) => movedRoutes(base, arm, 0, router)),
    shift: side.shifts.map((arm) => movedRoutes(base, arm, MOVE, router)),
    work: sum(base, (r) => r.work),
    length: sum(base, (r) => r.length),
    pairs: sum(base, (r) => r.pairs),
    measures,
  };
}

/** The moved routes of `corners` under the shifts, by their first difference. */
export interface ShiftKinds {
  /** The corner graph has another count of points or links. */
  readonly graph: number;
  /** The graph has the same counts, and the corner path moves. */
  readonly search: number;
  /** The corner path does not move, and the route moves. */
  readonly other: number;
}

/** This function gives the kind of each moved route of `corners` under the shifts. */
export function shiftKinds(base: readonly ArmRow[], shifted: readonly (readonly ArmRow[])[]): ShiftKinds {
  const kinds = { graph: 0, search: 0, other: 0 };
  for (const arm of shifted) {
    const other = new Map(arm.map((r) => [keyOf(r), r]));
    for (const row of pick(base, "corners")) {
      const moved = other.get(keyOf(row))!;
      for (const edge of movedEdges(row, moved, MOVE)) {
        const a = row.corner!;
        const b = moved.corner!;
        if (a.points !== b.points || a.links !== b.links) kinds.graph++;
        else if (!samePoints(a.raw[edge], b.raw[edge], MOVE)) kinds.search++;
        else kinds.other++;
      }
    }
  }
  return kinds;
}

/** The floor of one route measure on one router: how much a harmless shift changes the value on one board. */
export interface MeasureFloor {
  readonly router: string;
  readonly measure: string;
  /** The median over the boards of the median over the shifts of the absolute change. It is the `resolution` of the measure. */
  readonly floor: number;
  readonly interval: readonly [number, number];
  readonly largest: number;
  readonly boardsMoved: number;
}

/** This function gives the floor of each route measure of each router. A value that is not finite does not count. */
export function measureFloors(base: readonly ArmRow[], shifted: readonly (readonly ArmRow[])[]): MeasureFloor[] {
  const others = shifted.map((arm) => new Map(arm.map((r) => [keyOf(r), r])));
  const out: MeasureFloor[] = [];
  for (const router of NAMES) {
    const rows = pick(base, router);
    for (const measure of Object.keys(rows[0]?.measures ?? {}).sort()) {
      const changes = rows.flatMap((row) => {
        // A value that is not a finite number is `null` in the file of an arm.
        const value = row.measures![measure];
        if (typeof value !== "number") return [];
        const each = others.flatMap((arm) => {
          const other = arm.get(keyOf(row))!.measures![measure];
          return typeof other === "number" ? [Math.abs(other - value)] : [];
        });
        return each.length === 0 ? [] : [median(each)];
      });
      if (changes.length === 0) continue;
      const interval = medianInterval(changes);
      out.push({ router, measure, floor: median(changes), interval: [interval.low, interval.high], largest: Math.max(...changes), boardsMoved: changes.filter((c) => c > 0).length });
    }
  }
  return out;
}

/** One row of the part that a test compares: the digest of the routes of one board and one router. */
export interface SliceRow {
  readonly family: string;
  readonly seed: number;
  readonly router: string;
  readonly digest: number;
}

/** This function gives the rows of the part of the record that a test compares with fresh rows. */
export const sliceRows = (): SliceRow[] =>
  armRows({ routers: SLICE.routers, families: SLICE.families, seeds: SLICE.seeds }).map((r) => ({ family: r.family, seed: r.seed, router: r.router, digest: fnv1a32(JSON.stringify(r.lines)) }));

/** The record `route-tie/1`. */
export interface RouteTieRecord {
  readonly schema: string;
  readonly regenerate: string;
  readonly before: string;
  readonly chosen: number;
  readonly shift: number;
  readonly vectors: readonly (typeof VECTORS)[number][];
  readonly boards: number;
  /** The reason of the chosen distance, beside its read. */
  readonly choice: string;
  /** What the outcome on the moved routes of the prediction reads, and what it did not name. */
  readonly predictionNote: string;
  readonly tolerances: readonly ToleranceRow[];
  readonly routers: readonly RouterRow[];
  /** The two keys of the walk among the corners within the limit, beside the search before the rule. */
  readonly keys: KeyTable;
  readonly shiftKinds: ShiftKinds;
  readonly floors: readonly MeasureFloor[];
  readonly slice: readonly SliceRow[];
}
