/**
 * This module makes the rows of the record `route-pairs/2` (ROUTE-PAIRS).
 * Each row reads one board and one router: the ink crossings `R1`, the crossings between pairs of routes, and the moves of that count under small shifts.
 * The script `route-pairs.ts` writes the record, and the gate `route-pairs.test.ts` compares a part of it with fresh rows.
 */
import { mulberry32, seedOf } from "@mark1russell7/rigor-generators";
import { bootstrapMedian, median } from "@mark1russell7/rigor-statistics";
import { measureQuality, paintedOutsidePairs, routePairCrossings } from "../src/bench/quality.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import type { Graph, Route, Router } from "../src/model.ts";
import { ROUTERS, sectionsRouter } from "../src/routers/index.ts";

/** The command that writes the record again. */
export const REGENERATE = "node packages/core/scripts/route-pairs.ts packages/core/scripts/data/route-pairs/record.json";
/** The version of the record. */
export const SCHEMA = "route-pairs/2";
/** The sizes of a shift on each axis. */
export const MOVES = [1e-12, 1e-10, 1e-8, 1e-7] as const;
/** The size of the control shift. This size is far over the grid, so a count that does not change here tells that the shift test cannot fail. */
export const CONTROL_MOVE = 0.1;
/** The sizes that each row reads: the sizes of the test and the control. */
export const SIZES = [...MOVES, CONTROL_MOVE] as const;
/** The number of vectors for each size. */
export const DRAWS = 5;
/** The seeds of each family. */
export const SEEDS = 3;

const SITE = sectionsRouter({ name: "sections-site", margin: 20, stretch: 3, cap: 6 });
/** The routers of the record. `corners` is the base of each ratio. */
export const NAMES = ["corners", "shared", "shared-all", "sections", "sections-site"] as const;
/** This function gives the router of a name of `NAMES`. */
export function routerOf(name: string): Router {
  return name === SITE.name ? SITE : ROUTERS.find((r) => r.name === name)!;
}

/** The moves of the pair count for one size of a shift. */
export interface ShiftRow {
  readonly move: number;
  /** The change of the pair count for each vector, when all vertices move by one vector. */
  readonly one: readonly number[];
  /** The change of the pair count for each draw, when each distinct vertex moves by its own vector of this size. */
  readonly each: readonly number[];
}

/** One board and one router. */
export interface BoardRow {
  readonly family: string;
  readonly seed: number;
  readonly router: string;
  readonly routes: number;
  /** The distinct vertices of the routes on the grid `EPS`. */
  readonly vertices: number;
  /** The vertices of `vertices` that the grid of `R1` and the grid `EPS` read differently: one of them joins or splits this vertex. */
  readonly gridsDiffer: number;
  readonly crossings: number;
  readonly crossingsEstimated: boolean;
  readonly pairs: number;
  readonly proper: number;
  readonly contact: number;
  readonly pairsEstimated: boolean;
  /** The painted crossings that one route alone draws. */
  readonly self: number;
  /** The other painted crossings that are not strict on the grid `EPS`. */
  readonly touch: number;
  readonly shifts: readonly ShiftRow[];
}

/** This function counts the distinct vertices on the grid `EPS`, and those that the grid of `R1` reads differently. */
function gridCounts(routes: readonly Route[]): { readonly vertices: number; readonly gridsDiffer: number } {
  const fine = new Map<string, Set<string>>();
  const coarse = new Map<string, Set<string>>();
  for (const route of routes) {
    for (const p of route.points) {
      const f = `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`;
      const c = `${Math.round(p.x * 8)},${Math.round(p.y * 8)}`;
      if (!fine.has(f)) fine.set(f, new Set());
      if (!coarse.has(c)) coarse.set(c, new Set());
      fine.get(f)!.add(c);
      coarse.get(c)!.add(f);
    }
  }
  let gridsDiffer = 0;
  for (const [f, cells] of fine) {
    if (cells.size > 1 || [...cells].some((c) => coarse.get(c)!.size > 1 && coarse.get(c)!.has(f))) gridsDiffer++;
  }
  return { vertices: fine.size, gridsDiffer };
}

/** This function gives the routes with each distinct vertex at the place that `move` gives. */
function moved(routes: readonly Route[], move: (key: string) => readonly [number, number]): Route[] {
  return routes.map((route) => ({
    ...route,
    points: route.points.map((p) => {
      const [dx, dy] = move(`${p.x},${p.y}`);
      return { ...p, x: p.x + dx, y: p.y + dy };
    }),
  }));
}

/** This function reads the moves of the pair count on one board. The seeds come from the names of the board, the size and the draw. */
function shiftRows(routes: readonly Route[], base: number, name: string): ShiftRow[] {
  return SIZES.map((size) => {
    const one: number[] = [];
    const each: number[] = [];
    for (let draw = 0; draw < DRAWS; draw++) {
      const random = mulberry32(seedOf(`route-pairs/${name}/${size}/${draw}`));
      const signed = (): number => (random() < 0.5 ? -size : size);
      const whole = [signed(), signed()] as const;
      one.push(routePairCrossings(moved(routes, () => whole)).pairs - base);
      const own = new Map<string, readonly [number, number]>();
      const of = (key: string): readonly [number, number] => {
        let v = own.get(key);
        if (!v) own.set(key, (v = [signed(), signed()]));
        return v;
      };
      each.push(routePairCrossings(moved(routes, of)).pairs - base);
    }
    return { move: size, one, each };
  });
}

/** This function reads one board and one router. */
export function boardRow(family: string, seed: number, board: Graph, name: string): BoardRow {
  const result = routerOf(name).route(board);
  const quality = measureQuality(board, result);
  const count = routePairCrossings(result.routes);
  const outside = paintedOutsidePairs(result.routes);
  return {
    family,
    seed,
    router: name,
    routes: result.routes.length,
    ...gridCounts(result.routes),
    crossings: quality.crossings,
    crossingsEstimated: quality.crossingsEstimated,
    pairs: count.pairs,
    proper: count.proper,
    contact: count.contact,
    pairsEstimated: count.estimated,
    self: outside.self,
    touch: outside.touch,
    shifts: shiftRows(result.routes, count.pairs, `${family}/${seed}/${name}`),
  };
}

/** This function gives the rows of the named families, or of all families. */
export function boardRows(families?: readonly string[], seeds: number = SEEDS, log?: (line: string) => void): BoardRow[] {
  const registry = highwaysRegistry();
  const rows: BoardRow[] = [];
  for (const family of HIGHWAYS_FAMILIES) {
    if (families && !families.includes(family.name)) continue;
    for (let seed = 0; seed < seeds; seed++) {
      const board = registry.generate(family.name, seed).graph;
      for (const name of NAMES) rows.push(boardRow(family.name, seed, board, name));
    }
    log?.(family.name);
  }
  return rows;
}

const ratio = (value: number, base: number): number | null => (base > 0 ? value / base : null);

/** This function gives the summary of one router: the totals, the medians of the ratios against `corners` and the size of the moves. */
export function routerSummary(rows: readonly BoardRow[], name: string) {
  const own = rows.filter((r) => r.router === name);
  const base = new Map(rows.filter((r) => r.router === "corners").map((r) => [`${r.family}/${r.seed}`, r]));
  const ratios = (read: (r: BoardRow) => number): readonly number[] =>
    own.flatMap((r) => {
      const value = ratio(read(r), read(base.get(`${r.family}/${r.seed}`)!));
      return value === null ? [] : [value];
    });
  const sum = (read: (r: BoardRow) => number): number => own.reduce((s, r) => s + read(r), 0);
  const of = (values: readonly number[], what: string) => ({
    boards: values.length,
    median: values.length > 0 ? median(values) : null,
    interval: values.length > 0 ? bootstrapMedian(values, { seed: seedOf(`route-pairs/${name}/${what}`) }) : null,
  });
  const against = (read: (r: BoardRow) => number): { readonly lower: number; readonly equal: number; readonly higher: number } => {
    const signs = own.map((r) => Math.sign(read(r) - read(base.get(`${r.family}/${r.seed}`)!)));
    return { lower: signs.filter((x) => x < 0).length, equal: signs.filter((x) => x === 0).length, higher: signs.filter((x) => x > 0).length };
  };
  return {
    router: name,
    boards: own.length,
    routes: sum((r) => r.routes),
    crossings: sum((r) => r.crossings),
    pairs: sum((r) => r.pairs),
    proper: sum((r) => r.proper),
    contact: sum((r) => r.contact),
    vertices: sum((r) => r.vertices),
    gridsDiffer: sum((r) => r.gridsDiffer),
    self: sum((r) => r.self),
    touch: sum((r) => r.touch),
    pairsUnderCrossings: own.filter((r) => r.pairs < r.crossings).length,
    estimated: own.filter((r) => r.crossingsEstimated || r.pairsEstimated).length,
    crossingsAgainstCorners: of(ratios((r) => r.crossings), "crossings"),
    pairsAgainstCorners: of(ratios((r) => r.pairs), "pairs"),
    crossingsBoards: against((r) => r.crossings),
    pairsBoards: against((r) => r.pairs),
    shifts: SIZES.map((move) => {
      const reads = own.map((r) => r.shifts.find((s) => s.move === move)!);
      const side = (read: (s: ShiftRow) => readonly number[]) => {
        const worst = reads.map((s) => Math.max(...read(s).map(Math.abs)));
        const interval = bootstrapMedian(worst, { seed: seedOf(`route-pairs/${name}/${move}`) });
        const total = reads.reduce((s, r) => s + median(read(r).map(Math.abs)), 0);
        return { boardsMoved: worst.filter((w) => w > 0).length, worst: Math.max(...worst), medianWorst: interval, totalMoved: total };
      };
      return { move, one: side((s) => s.one), each: side((s) => s.each) };
    }),
  };
}

/** The fields of a row that the relation of the two crossing counts reads. */
export type RelationRow = Pick<BoardRow, "family" | "seed" | "router" | "crossings" | "self" | "touch" | "pairs">;

/** This function gives the room of a row in the relation `crossings - self - touch <= pairs`. A value under 0 is outside the relation. */
export function relationSlack(row: RelationRow): number {
  return row.pairs - (row.crossings - row.self - row.touch);
}

/** This function gives the key of each row outside the relation `crossings - self - touch <= pairs`. */
export function relationFaults(rows: readonly RelationRow[]): string[] {
  return rows.filter((row) => relationSlack(row) < 0).map((row) => `${row.family}/${row.seed}/${row.router}`);
}

/** This function gives the record of the rows. */
export function pairsRecord(rows: readonly BoardRow[]) {
  return {
    schema: SCHEMA,
    regenerate: REGENERATE,
    moves: MOVES,
    control: CONTROL_MOVE,
    draws: DRAWS,
    seeds: SEEDS,
    routers: NAMES,
    summary: NAMES.map((name) => routerSummary(rows, name)),
    rows,
  };
}
