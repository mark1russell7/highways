/**
 * This module makes the record `control-wins/1` (ROUTE-ADVERSARY).
 * The record reads each measure of `routeMeasures` for the three controls and for the routers of the record `route-pairs/1`, and it tells which of them has the best median.
 * A control reads no route quality, so a measure that it wins cannot call a win alone. `CONTROL_PARTNERS` names the measure that goes with each win.
 */
import { median } from "@mark1russell7/rigor-statistics";
import { benchRun } from "../src/bench/run.ts";
import { MEASURES } from "../src/bench/screen/measures.ts";
import { routeMeasures } from "../src/bench/suite.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import type { Router } from "../src/model.ts";
import { borderWalkRouter, oneTrunkRouter, perimeterRouter, straightRouter } from "../src/routers/index.ts";
import { NAMES, routerOf, SEEDS } from "./route-pairs-rows.ts";

/** The command that writes the record again. */
export const REGENERATE = "node packages/core/scripts/control-wins.ts packages/core/scripts/data/control-wins/record.json";
/** The version of the record. */
export const SCHEMA = "control-wins/1";
/** The controls. Each one buys some measures and reads no route quality. */
export const CONTROLS = ["one-trunk", "perimeter", "straight", "border-walk", "border-walk-short"] as const;
/** The routers that the record reads. */
export const RACE: readonly string[] = [...CONTROLS, ...NAMES];
/** The router that a partner measure compares with: a control loses the partner when it reads worse than this router. */
export const PARTNER_BASE = "corners";
/** The families and the seeds of the part of the record that the test reads again. */
export const SLICE = { families: ["small-clustered", "bottleneck"], seeds: 1 } as const;

/** The partners of a control that shares much: the wins come from few crossings of ink or from one plug for each box. */
const SHARING_PARTNERS: Readonly<Record<string, string>> = {
  "route.crossings": "route.crossings.pairs",
  "route.crossings.per-edge": "route.crossings.pairs",
  "route.crossing-angle.mean": "route.crossings.pairs",
  "route.crossing-angle.min": "route.crossings.pairs",
  "route.plug-spacing.min": "route.overlap.peak",
  "route.plug-spacing.q05": "route.overlap.peak",
  "route.bundle.ink-saved": "route.detour.median",
};

/** This table gives, for each control and each measure that it wins, the measure that a reader takes with the win. The control loses that measure. */
export const CONTROL_PARTNERS: Readonly<Record<(typeof CONTROLS)[number], Readonly<Record<string, string>>>> = {
  "one-trunk": SHARING_PARTNERS,
  perimeter: SHARING_PARTNERS,
  straight: Object.fromEntries(
    [
      "route.crossings.pairs",
      "route.turn.mean",
      "route.turn.max",
      "route.detour.median",
      "route.detour.q95",
      "route.detour.mean",
      "route.detour.max",
      "route.overlap.share",
      "route.overlap.peak",
      "route.bundle.ambiguity",
    ].map((name) => [name, "route.through"]),
  ),
  "border-walk": {},
  // The short walker cuts the corners of the boxes. So it wins the length, and it keeps close to the boxes.
  "border-walk-short": { "route.length": "route.clearance.tight" },
};

/**
 * The partners of `route.through`. A walker reads 0 on it, so a claim on `route.through` needs a walker that loses one of these. On the family `packed-grid` a walker ties `route.clearance.tight` and loses only `route.length`.
 */
export const THROUGH_PARTNERS = ["route.clearance.tight", "route.length"] as const;

/** The two forms of the walker. `border-walk` keeps to the sides of the boxes, and `border-walk-short` takes the shortest way over their corners, so it is the harder test of a real router. */
const WALKERS: readonly Router[] = [borderWalkRouter({ name: "border-walk" }), borderWalkRouter({ name: "border-walk-short", leave: 1 })];

/** This function gives the router of a name of `RACE`. */
export function routerNamed(name: string): Router {
  const walker = WALKERS.find((w) => w.name === name);
  if (walker) return walker;
  if (name === oneTrunkRouter.name) return oneTrunkRouter;
  if (name === perimeterRouter.name) return perimeterRouter;
  if (name === straightRouter.name) return straightRouter;
  return routerOf(name);
}

/** The values of the boards: the family of each board, and the values of each router by the key of the measure, in the order of the boards. */
export interface BoardValues {
  readonly families: readonly string[];
  readonly values: Readonly<Record<string, Readonly<Record<string, readonly number[]>>>>;
}

/** This function reads each router of `RACE` on the boards of the families. */
export function readBoards(families?: readonly string[], seeds: number = SEEDS, log?: (line: string) => void): BoardValues {
  const registry = highwaysRegistry();
  const boards: string[] = [];
  const values: Record<string, Record<string, number[]>> = Object.fromEntries(RACE.map((name) => [name, {}]));
  for (const family of HIGHWAYS_FAMILIES) {
    if (families && !families.includes(family.name)) continue;
    for (let seed = 0; seed < seeds; seed++) {
      const board = registry.generate(family.name, seed).graph;
      boards.push(family.name);
      for (const name of RACE) {
        const { row, result } = benchRun(routerNamed(name), family.name, board, 1);
        for (const [key, value] of Object.entries(routeMeasures(board, result, row))) (values[name]![key] ??= []).push(value);
      }
    }
    log?.(family.name);
  }
  return { families: boards, values };
}

/** One measure of the record. */
export interface MeasureRow {
  readonly name: string;
  readonly key: string;
  readonly better: "lower" | "higher";
  readonly medians: Readonly<Record<string, number>>;
  readonly sums: Readonly<Record<string, number>>;
  /** The routers with the best median. */
  readonly best: readonly string[];
}

/** This function gives the rows of the record: one row for each measure with a finite value on each board. */
export function measureRows({ values }: BoardValues): MeasureRow[] {
  return MEASURES.flatMap((measure) => {
    const of = (name: string): readonly number[] => values[name]?.[measure.key] ?? [];
    if (RACE.some((name) => of(name).length === 0 || of(name).some((v) => !Number.isFinite(v)))) return [];
    const medians = Object.fromEntries(RACE.map((name) => [name, median(of(name))]));
    const sums = Object.fromEntries(RACE.map((name) => [name, of(name).reduce((s, v) => s + v, 0)]));
    const reads = RACE.map((name) => medians[name]!);
    const top = measure.better === "lower" ? Math.min(...reads) : Math.max(...reads);
    return [{ name: measure.name, key: measure.key, better: measure.better, medians, sums, best: RACE.filter((name) => medians[name] === top) }];
  });
}

/** This function tells if a control wins a row: it has the best median, and no router that is not a control has it. */
export function controlWins(row: MeasureRow, control: string): boolean {
  const controls: readonly string[] = CONTROLS;
  return row.best.includes(control) && row.best.every((name) => controls.includes(name));
}

/** This function tells if `name` reads worse than `PARTNER_BASE` on a row, by the median. */
export function readsWorse(row: MeasureRow, name: string): boolean {
  const own = row.medians[name]!;
  const other = row.medians[PARTNER_BASE]!;
  return row.better === "lower" ? own > other : own < other;
}

/** This function gives the sum of `route.through` of each router for each family. It shows where a control buys that count. */
function throughByFamily({ families, values }: BoardValues): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const name of RACE) {
    (values[name]?.["R9.through"] ?? []).forEach((value, i) => {
      const family = (out[families[i]!] ??= {});
      family[name] = (family[name] ?? 0) + value;
    });
  }
  return out;
}

/** The values of `route.through` and of its partners for one router on one family: the sums of the first and the last, and the median of the share. */
export interface FamilyPartners {
  readonly through: number;
  readonly tight: number;
  readonly length: number;
}

/** This function gives the values of `route.through` and of its partners for `corners` and the walkers on each family. The seeds of this record are seen seeds, so this table claims nothing. */
function partnersByFamily({ families, values }: BoardValues): Record<string, Record<string, FamilyPartners>> {
  const out: Record<string, Record<string, FamilyPartners>> = {};
  for (const family of new Set(families)) {
    const at = families.flatMap((name, i) => (name === family ? [i] : []));
    const read = (name: string, key: string): number[] => at.map((i) => values[name]![key]![i]!);
    const sum = (list: readonly number[]): number => list.reduce((s, v) => s + v, 0);
    out[family] = Object.fromEntries(
      [PARTNER_BASE, "border-walk", "border-walk-short"].map((name) => [name, { through: sum(read(name, "R9.through")), tight: median(read(name, "R8.tight")), length: sum(read(name, "R5.length")) }]),
    );
  }
  return out;
}

/** This function gives the record. */
export function winsRecord(boards: BoardValues, slice: BoardValues) {
  const rows = measureRows(boards);
  return {
    schema: SCHEMA,
    regenerate: REGENERATE,
    boards: boards.families.length,
    race: RACE,
    partnerBase: PARTNER_BASE,
    wins: Object.fromEntries(CONTROLS.map((control) => [control, rows.filter((r) => controlWins(r, control)).map((r) => ({ measure: r.name, partner: CONTROL_PARTNERS[control][r.name] ?? null }))])),
    ties: Object.fromEntries(CONTROLS.map((control) => [control, rows.filter((r) => r.best.includes(control) && !controlWins(r, control)).map((r) => r.name)])),
    throughByFamily: throughByFamily(boards),
    throughPartners: THROUGH_PARTNERS,
    partnersByFamily: partnersByFamily(boards),
    rows,
    slice: measureRows(slice),
  };
}
