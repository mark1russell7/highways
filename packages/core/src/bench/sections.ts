import type { Graph, Result } from "../model.ts";
import { sectionsRouter, type SectionsOptions } from "../routers/sections.ts";
import { groupStrategies } from "../strategies/builtins.ts";
import type { Strategy } from "../strategies/model.ts";
import { sameData } from "./run.ts";
import { measureLevelFaults, measureRouteFaults, sumFaults, type LinkFaults } from "./links.ts";

// The core runs in any host, so it reads the clock without the types of Node or the browser.
const now = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

/** The options of one setting of the router `sections`, without the name. */
export type SectionsSettingOptions = Omit<SectionsOptions, "name" | "maxNodes">;

/** One setting of a sweep of the router `sections`. */
export interface SectionsSetting {
  /** The name of the setting in the column `setting`. */
  readonly name: string;
  readonly options: SectionsSettingOptions;
}

/** One row of a sweep of the router `sections`: one setting on one board, and the measures of its routes and of its zoom levels. */
export interface SectionsBenchRow {
  readonly fixture: string;
  readonly setting: string;
  /** The faults of the routes of the edges (`measureRouteFaults`). */
  readonly faults: LinkFaults;
  /** The sum of the faults of the levels with groups (`measureLevelFaults` and `sumFaults`). */
  readonly levelFaults: LinkFaults;
  /** The sum of the overlaps of the levels with groups. */
  readonly overlaps: number;
  /** The number of routes that go through hubs: the routes that are not the same as the direct route of their edge. */
  readonly hubRoutes: number;
  /** The number of shared stretches of way of the result (`runs`). */
  readonly runs: number;
  /** The number of zoom levels, with the last level of single nodes. */
  readonly levels: number;
  /** The number of items of the far view: the first level with more than one item. */
  readonly farItems: number;
  /** The time of one route, in milliseconds. */
  readonly ms: number;
}

/** This function gives the number of items of the first level with more than one item, or 0 for a result without levels. */
function farItems(result: Result): number {
  return result.levels?.find((l) => l.items.length > 1)?.items.length ?? 0;
}

/**
 * This function measures the router `sections` on one board with each setting. The first row is the fair baseline: the defaults, with no option.
 * The direct routes come from the hub limit 0, so `hubRoutes` counts the routes that use the hubs.
 */
export function sweepSections(fixture: string, graph: Graph, settings: readonly SectionsSetting[]): SectionsBenchRow[] {
  const all: SectionsSetting[] = [{ name: "defaults", options: {} }, ...settings];
  return all.map((s) => {
    const direct = sectionsRouter({ ...s.options, name: "direct", stretch: 0, stretchPad: 0 }).route(graph);
    const t0 = now();
    const result = sectionsRouter({ ...s.options, name: s.name }).route(graph);
    const ms = now() - t0;
    const levelFaults = measureLevelFaults(result);
    return {
      fixture,
      setting: s.name,
      faults: measureRouteFaults(graph, result),
      levelFaults: sumFaults(levelFaults),
      overlaps: levelFaults.reduce((n, f) => n + f.overlaps, 0),
      hubRoutes: result.routes.filter((r, i) => !sameData(r.points, direct.routes[i]?.points)).length,
      runs: result.runs?.length ?? 0,
      levels: result.levels?.length ?? 0,
      farItems: farItems(result),
      ms,
    };
  });
}

/** The values of the hub limit (`stretch`) of the sweep of CUSTOM. The default is 2. */
export const STRETCH_SWEEP: readonly number[] = [1.25, 1.5, 2, 3, Infinity];

/** This function gives the settings of the sweep of the hub limit: one setting for each value of `stretch`. */
export function stretchSettings(values: readonly number[] = STRETCH_SWEEP): SectionsSetting[] {
  return values.map((stretch) => ({ name: `stretch ${stretch}`, options: { stretch } }));
}

/** The values of `hubSlack` of the sweep of CUSTOM. The default is 80. */
export const SLACK_SWEEP: readonly number[] = [0, 40, 80, 160, Infinity];

/** This function gives the settings of the sweep of the slack of the hubs: one setting for each value of `hubSlack`. */
export function slackSettings(values: readonly number[] = SLACK_SWEEP): SectionsSetting[] {
  return values.map((hubSlack) => ({ name: `hubSlack ${hubSlack}`, options: { hubSlack } }));
}

/** The values of the section limit (`cap`) of the sweep of CUSTOM. The default is 8. */
export const CAP_SWEEP: readonly number[] = [4, 6, 8, 12, 16];

/** This function gives the settings of the sweep of the section limit: one setting for each value of `cap`. */
export function capSettings(values: readonly number[] = CAP_SWEEP): SectionsSetting[] {
  return values.map((cap) => ({ name: `cap ${cap}`, options: { cap } }));
}

/**
 * This function gives one setting for each grouping rule: the router `sections` with the strategy as its option `group`.
 * The map `options` gives the options of a strategy by its name.
 */
export function groupSettings(
  strategies: readonly Strategy<"group">[] = Object.values(groupStrategies),
  options: Readonly<Record<string, object>> = {},
): SectionsSetting[] {
  return strategies.map((group) => ({ name: `group ${group.name}`, options: { group, ...(options[group.name] ? { groupOptions: options[group.name] } : {}) } }));
}

/** This function writes the rows of `sweepSections` as a Markdown table. */
export function formatSections(rows: readonly SectionsBenchRow[]): string {
  const head =
    "| fixture | setting | through | out and back | worst detour | outside | hub routes | runs | levels | far items | level through | level out and back | level outside | level overlaps | ms |";
  const line = "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const body = rows.map((r) => {
    const f = r.faults;
    const l = r.levelFaults;
    return `| ${r.fixture} | ${r.setting} | ${f.through} | ${f.backtrack} | ${f.worstDetour.toFixed(2)} | ${f.outside} | ${r.hubRoutes} | ${r.runs} | ${r.levels} | ${r.farItems} | ${l.through} | ${l.backtrack} | ${l.outside} | ${r.overlaps} | ${r.ms.toFixed(1)} |`;
  });
  return [head, line, ...body].join("\n");
}
