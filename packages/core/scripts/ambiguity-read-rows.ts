/**
 * This module makes the record `ambiguity-read/1` (AMBIGUITY-FLAT).
 * The measure `route.bundle.ambiguity` reads a share of false neighbours. The record reads that share over the size of the board, the routers and the key of the edges.
 * It also reads the count of false neighbours for each node, and `reach`: that count over the count of the nodes.
 */
import { benchRun } from "../src/bench/run.ts";
import { ambiguity } from "../src/bench/measures/bundles.ts";
import { FIXTURES, makeFixture, type FixtureSpec } from "../src/fixtures.ts";
import type { Edge, Graph, Router } from "../src/model.ts";
import { oneTrunkRouter, ROUTERS, straightRouter } from "../src/routers/index.ts";

/** The command that writes the record again. */
export const REGENERATE = "node packages/core/scripts/ambiguity-read.ts packages/core/scripts/data/ambiguity-read/record.json";
/** The version of the record. */
export const SCHEMA = "ambiguity-read/1";
/** The five real routers, whose range tells if the share is flat on a board. */
export const REAL = ["corners", "trunks", "shared", "shared-all", "sections"] as const;
/** The routers of the record: the real routers and the two controls. */
export const READ: readonly string[] = [...REAL, straightRouter.name, oneTrunkRouter.name];
/** The boards of the record. */
export const BOARDS = ["tiny-uniform", "small-clustered", "grid-400", "mid-uniform", "mid-clustered", "mid-hubs", "mid-fanout", "dense-hubs", "dense-clustered"] as const;
/** The two boards that the list of fixtures does not hold: 1000 nodes and 4 edges for each node, the density of the first report of a flat read. */
export const DENSE_BOARDS: readonly FixtureSpec[] = [
  { name: "dense-hubs", kind: "hubs", nodes: 1000, edgesPerNode: 4, seed: 6 },
  { name: "dense-clustered", kind: "clustered", nodes: 1000, edgesPerNode: 4, seed: 3 },
];
/** The boards that take each value of the key. */
export const KEY_BOARDS: readonly string[] = ["small-clustered", "mid-clustered"];
/** The values of the key: `none` removes it, `random` keeps the random name of the fixture, and `cluster` names a place. */
export const KEYS = ["none", "random", "cluster"] as const;
/** A range under this value over the real routers makes a board flat. */
export const FLAT_RANGE = 0.05;
/** The mean count of boxes in a cell of the arm `cluster`. */
const BOXES_IN_A_CELL = 25;

/** A value of the key, or `as-made` for a board that keeps the key of its fixture. */
export type KeyArm = (typeof KEYS)[number] | "as-made";

function routerOf(name: string): Router {
  if (name === oneTrunkRouter.name) return oneTrunkRouter;
  return ROUTERS.find((r) => r.name === name)!;
}

function withKey(edge: Edge, collection: string | undefined): Edge {
  const { data, ...rest } = edge;
  const { collection: _old, ...others } = (data ?? {}) as Readonly<Record<string, unknown>>;
  const next = collection === undefined ? others : { ...others, collection };
  return Object.keys(next).length === 0 ? rest : { ...rest, data: next };
}

/**
 * This function gives the board with the key of the arm.
 * The arm `cluster` names the cell of a square grid over the boxes that holds the target box. So it is a stated stand-in for a cluster: the fixture does not export its clusters.
 */
export function keyedBoard(board: Graph, arm: KeyArm): Graph {
  if (arm === "as-made" || arm === "random") return board;
  if (arm === "none") return { ...board, edges: board.edges.map((e) => withKey(e, undefined)) };
  const x0 = Math.min(...board.nodes.map((n) => n.box.x));
  const y0 = Math.min(...board.nodes.map((n) => n.box.y));
  const x1 = Math.max(...board.nodes.map((n) => n.box.x));
  const y1 = Math.max(...board.nodes.map((n) => n.box.y));
  const side = Math.max(1, Math.ceil(Math.sqrt(board.nodes.length / BOXES_IN_A_CELL)));
  const cell = (at: number, low: number, high: number): number => (high > low ? Math.min(side - 1, Math.floor(((at - low) / (high - low)) * side)) : 0);
  const place = new Map(board.nodes.map((n) => [n.id, `cell-${cell(n.box.x, x0, x1)}-${cell(n.box.y, y0, y1)}`] as const));
  return { ...board, edges: board.edges.map((e) => withKey(e, place.get(e.target.node))) };
}

/** One board, one value of the key and one router. */
export interface AmbiguityRow {
  readonly board: string;
  readonly nodes: number;
  readonly edges: number;
  readonly key: KeyArm;
  readonly router: string;
  readonly share: number;
  readonly nearPerNode: number;
  readonly falsePerNode: number;
  readonly reach: number;
  readonly estimated: boolean;
}

/** This function reads one board and one value of the key, for each router of `routers`. */
export function boardRows(name: string, arm: KeyArm, routers: readonly string[] = READ): AmbiguityRow[] {
  const spec = [...FIXTURES, ...DENSE_BOARDS].find((f) => f.name === name);
  if (!spec) throw new Error(`The fixtures do not hold ${name}.`);
  const board = keyedBoard(makeFixture(spec), arm);
  return routers.map((router) => {
    const { result } = benchRun(routerOf(router), name, board, 1);
    const a = ambiguity(board, result.routes);
    return {
      board: name,
      nodes: board.nodes.length,
      edges: board.edges.length,
      key: arm,
      router,
      share: a.value,
      nearPerNode: a.nearPerNode,
      falsePerNode: a.falsePerNode,
      reach: a.reach,
      estimated: a.estimated,
    };
  });
}

/** This function gives the rows of the boards of the record. */
export function readRows(log?: (line: string) => void): AmbiguityRow[] {
  const rows: AmbiguityRow[] = [];
  for (const name of BOARDS) {
    for (const arm of KEY_BOARDS.includes(name) ? KEYS : (["as-made"] as const)) {
      rows.push(...boardRows(name, arm));
      log?.(`${name} ${arm}`);
    }
  }
  return rows;
}

/** The range of the share and of `reach` over the real routers, on one board and one value of the key. */
export interface BoardSummary {
  readonly board: string;
  readonly nodes: number;
  readonly key: KeyArm;
  readonly shareLow: number;
  readonly shareHigh: number;
  readonly flat: boolean;
  readonly reachLow: number;
  readonly reachHigh: number;
}

/** This function gives the summary of each board and value of the key. */
export function summaries(rows: readonly AmbiguityRow[]): BoardSummary[] {
  const groups = new Map<string, AmbiguityRow[]>();
  for (const r of rows) {
    if (!(REAL as readonly string[]).includes(r.router)) continue;
    const key = `${r.board}\n${r.key}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((group) => {
    const shares = group.map((r) => r.share);
    const reaches = group.map((r) => r.reach);
    const shareLow = Math.min(...shares);
    const shareHigh = Math.max(...shares);
    return {
      board: group[0]!.board,
      nodes: group[0]!.nodes,
      key: group[0]!.key,
      shareLow,
      shareHigh,
      flat: shareHigh - shareLow < FLAT_RANGE,
      reachLow: Math.min(...reaches),
      reachHigh: Math.max(...reaches),
    };
  });
}

/** The small part of the record that a test reads again. */
export const SLICE = { board: "small-clustered", key: "none" } as const;

/** This function gives the record. */
export function ambiguityRecord(rows: readonly AmbiguityRow[], slice: readonly AmbiguityRow[]) {
  return { schema: SCHEMA, regenerate: REGENERATE, flatRange: FLAT_RANGE, real: REAL, keys: KEYS, summary: summaries(rows), rows, slice };
}
