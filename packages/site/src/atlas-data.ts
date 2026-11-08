// The data of the atlas of solved regions (SOLVED-ATLAS). The build and the script `atlas-week.ts` give the committed files to these functions.
// This module has no access to the file system and to the network, so the page, the script and the tests use the same rules.
import type { WeekGap, WeekSource } from "./atlas-weeks.ts";
import { parseSnapshot, readCore, type Snapshot } from "./results-data.ts";

/** The format of a weekly record of the leaders. */
export const ATLAS_WEEK_FORMAT = "atlas-week/1";

/** The days that one leader holds a region before the region is solved: 4 weeks. */
export const SOLVED_DAYS = 28;

/** The text of the bound of a region. The rule of the proven lower bound is a later slice, so no region has a bound. */
export const NO_BOUND = "no bound yet";

/** The milliseconds of one day. */
const DAY_MS = 86_400_000;

/** This function compares two texts by their code units. So the order does not change with the locale of the machine. */
export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** One strategy on one region: its name, the mean of its family against the base and the count of boards of the family. */
export interface RegionEntry {
  readonly strategy: string;
  /** The mean of the family against the base. A positive mean tells that the strategy is better than the base. The base itself has the mean 0. */
  readonly mean: number;
  readonly n: number;
}

/** The leader of one region in one week. A region is one family of one guard measure of one step of one set. */
export interface WeekRegion {
  readonly set: string;
  readonly step: string;
  /** The default strategy of the step in the snapshot. */
  readonly base: string;
  readonly guard: string;
  readonly measure: string;
  readonly family: string;
  /** The leader: the strategy with the greatest mean among the rows with the sign 1, or the base when no row has the sign 1. */
  readonly leader: RegionEntry;
  /** The next entry in the order of the leader rule. It is `null` when the region has no other entry. */
  readonly runnerUp: RegionEntry | null;
  /** The run of the workflow `Screen` that gave the snapshot. */
  readonly run: number;
  /** The core of the last read of the snapshot: the core of its stamp `verified`, or else the core of its run. */
  readonly core: string;
}

/** The weekly record `docs/research/atlas/<date>.json`. */
export interface AtlasWeek {
  readonly format: typeof ATLAS_WEEK_FORMAT;
  readonly date: string;
  readonly regions: readonly WeekRegion[];
}

/** This function gives the key of a region. The key is the same in each week. */
export const regionKey = (r: Pick<WeekRegion, "set" | "step" | "guard" | "measure" | "family">): string => [r.set, r.step, r.guard, r.measure, r.family].join("|");

/** This function compares two regions by set, step, guard, measure and family. */
function byRegion(a: WeekRegion, b: WeekRegion): number {
  return byText(a.set, b.set) || byText(a.step, b.step) || byText(a.guard, b.guard) || byText(a.measure, b.measure) || byText(a.family, b.family);
}

/** This function compares two entries: the greater mean first, and the name in text order for an equal mean. */
const byMean = (a: RegionEntry, b: RegionEntry): number => b.mean - a.mean || byText(a.strategy, b.strategy);

/** This function gives the leader and the runner-up of the entries of one region. */
function rank(base: string, entries: readonly (RegionEntry & { readonly sign: number })[]): { leader: RegionEntry; runnerUp: RegionEntry | null } {
  const plain = (e: RegionEntry): RegionEntry => ({ strategy: e.strategy, mean: e.mean, n: e.n });
  const wins = entries.filter((e) => e.sign === 1).sort(byMean);
  const n = entries[0]?.n ?? 0;
  const baseEntry: RegionEntry = { strategy: base, mean: 0, n };
  // With 2 or more wins, the runner-up is the second win. With 1 win, the base is next. With no win, the base leads and the closest strategy is next.
  if (wins.length >= 2) return { leader: plain(wins[0]!), runnerUp: plain(wins[1]!) };
  if (wins.length === 1) return { leader: plain(wins[0]!), runnerUp: baseEntry };
  const closest = [...entries].sort(byMean)[0];
  return { leader: baseEntry, runnerUp: closest === undefined ? null : plain(closest) };
}

/**
 * This function gives the weekly record of the leaders from the verdict snapshots.
 * The regions are in the order of set, step, guard, measure and family, so two runs on the same snapshots give the same bytes.
 *
 * @param snapshots - The verdict snapshots `docs/research/verdicts/<set>-<step>.json`.
 * @param date - The date of the record, as `YYYY-MM-DD`.
 */
export function weekLeaders(snapshots: readonly Snapshot[], date: string): AtlasWeek {
  const regions: WeekRegion[] = [];
  for (const s of snapshots) {
    const groups = new Map<string, { guard: string; measure: string; family: string; entries: (RegionEntry & { sign: number })[] }>();
    for (const row of s.rows) {
      for (const f of row.families) {
        const key = `${row.guard}|${row.measure}|${f.family}`;
        const group = groups.get(key) ?? { guard: row.guard, measure: row.measure, family: f.family, entries: [] };
        group.entries.push({ strategy: row.strategy, mean: f.mean, n: f.n, sign: f.sign });
        groups.set(key, group);
      }
    }
    for (const g of groups.values()) {
      const { leader, runnerUp } = rank(s.base, g.entries);
      regions.push({ set: s.set, step: s.step, base: s.base, guard: g.guard, measure: g.measure, family: g.family, leader, runnerUp, run: s.run, core: readCore(s) });
    }
  }
  return { format: ATLAS_WEEK_FORMAT, date, regions: regions.sort(byRegion) };
}

/** One snapshot file: its name in the folder of verdicts and its text. */
export interface SnapshotFile {
  readonly name: string;
  readonly text: string;
}

/**
 * This function gives the weekly record of the snapshot files.
 * The script `atlas-week.ts` gives it the files on disk. The build gives it the files of a commit of the history.
 *
 * @param files - The snapshot files, in the order of their names.
 * @param date - The date of the record, as `YYYY-MM-DD`.
 */
export const weekFromFiles = (files: readonly SnapshotFile[], date: string): AtlasWeek => weekLeaders(files.map((f) => parseSnapshot(f.text, f.name)), date);

/** This function reads the JSON text of a weekly record. It throws an error when the format or the date is not valid. */
export function parseWeek(text: string, name = "record"): AtlasWeek {
  const value = JSON.parse(text) as Partial<AtlasWeek>;
  if (value.format !== ATLAS_WEEK_FORMAT) throw new Error(`The ${name} has no format "${ATLAS_WEEK_FORMAT}".`);
  if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new Error(`The ${name} has no date "YYYY-MM-DD".`);
  if (!Array.isArray(value.regions)) throw new Error(`The ${name} has no regions.`);
  return value as AtlasWeek;
}

/** This function gives the text of a weekly record: one region on each line, so a diff shows each change of a leader. */
export function weekText(week: AtlasWeek): string {
  const lines = week.regions.map((r) => `    ${JSON.stringify(r)}`);
  return `{\n  "format": ${JSON.stringify(week.format)},\n  "date": ${JSON.stringify(week.date)},\n  "regions": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

/** The state of a region: `solved` when one leader holds for `SOLVED_DAYS` or more, or else `held`. */
export type RegionState = "solved" | "held";

/** The states in the order of the page. */
export const STATES: readonly RegionState[] = ["solved", "held"];

/** One region of the latest week, with the run of its leader. */
export interface AtlasRegion extends WeekRegion {
  /** The date of the first record of the latest unbroken run of records with the same leader. */
  readonly since: string;
  /** The days from `since` to the date of the latest record. A leader holds only on the dates of the records. */
  readonly days: number;
  readonly state: RegionState;
  /** The bound of the region. It is `NO_BOUND` until the rule of the proven lower bound ships. */
  readonly bound: string;
}

/** The numbers at the top of the atlas page. */
export interface AtlasSummary {
  readonly regions: number;
  readonly solved: number;
  readonly weeks: number;
  /** The date of the latest record. It is empty when no record exists. */
  readonly latest: string;
  /** The days from the latest record to `today`. */
  readonly age: number;
  /** The earliest date when a region that is held can become solved: the first `since` plus `SOLVED_DAYS`. It is empty when no region is held. */
  readonly earliest: string;
}

/** The data of the atlas page. */
export interface AtlasView {
  readonly summary: AtlasSummary;
  readonly regions: readonly AtlasRegion[];
}

/** The data of the module `virtual:atlas`. It has the view, the text sections of `content/atlas.md` as HTML, the core of the build and the source of each week. */
export interface AtlasPage {
  readonly view: AtlasView;
  readonly text: Readonly<Record<string, string>>;
  readonly core: string;
  /** The source of each weekly record, in the order of the dates. */
  readonly sources: readonly WeekSource[];
  /** Each week that the build did not derive, with the reason. */
  readonly skipped: readonly WeekGap[];
}

/** This function gives the count of days from `from` to `to`. */
const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** This function adds days to a date `YYYY-MM-DD`. */
export const addDays = (date: string, days: number): string => new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * This function gives each region of the latest week with its leader, the run of the leader and its state.
 * A region that is missing from a week before the latest week starts a new run after that week.
 *
 * @param weeks - The weekly records, in any order.
 * @param today - The date of the reader, as `YYYY-MM-DD`. It gives the age of the latest record.
 */
export function atlasData(weeks: readonly AtlasWeek[], today: string): AtlasView {
  const ordered = [...weeks].sort((a, b) => byText(a.date, b.date));
  const latest = ordered.at(-1);
  if (latest === undefined) return { summary: { regions: 0, solved: 0, weeks: 0, latest: "", age: 0, earliest: "" }, regions: [] };
  const byWeek = ordered.map((w) => new Map(w.regions.map((r) => [regionKey(r), r] as const)));
  const regions = latest.regions.map((r): AtlasRegion => {
    const key = regionKey(r);
    let first = ordered.length - 1;
    while (first > 0 && byWeek[first - 1]!.get(key)?.leader.strategy === r.leader.strategy) first--;
    const since = ordered[first]!.date;
    const days = daysBetween(since, latest.date);
    return { ...r, since, days, state: days >= SOLVED_DAYS ? "solved" : "held", bound: NO_BOUND };
  });
  const held = regions.filter((r) => r.state === "held").map((r) => r.since).sort(byText);
  return {
    summary: {
      regions: regions.length,
      solved: regions.filter((r) => r.state === "solved").length,
      weeks: ordered.length,
      latest: latest.date,
      age: Math.max(0, daysBetween(latest.date, today)),
      earliest: held[0] === undefined ? "" : addDays(held[0], SOLVED_DAYS),
    },
    regions,
  };
}
