// The numbers of the file `kpi.json` of the site. Each value comes from a committed file of the build.
// So no reader copies a number from a page, and no number has a person as its source.
import type { BenchMeta } from "./bench-label.ts";

/** The name of the project in the file. */
export const KPI_PROJECT = "highways";

/** The page of each measure that tells if a page is live. A page gets its measure when its file exists. */
export const KPI_PAGES = { "atlas-live": "atlas.html", "explorer-live": "explorer.html" } as const;

/** The facts of the committed files that the measures read. */
export interface KpiFacts {
  /** The demo lists each strategy that no ruling keeps off the page. */
  readonly demoComplete: boolean;
  /** The number of cells of the coverage record. The page shows the coverage over them. */
  readonly coverageCells: number;
  /** The core of each verdict of the Results page. An entry is `undefined` when a verdict does not name its core. */
  readonly verdictCores: readonly (string | undefined)[];
  /** The core of the last read of each verdict: the core of its stamp `verified`, or else the core of its run. */
  readonly verdictReads: readonly (string | undefined)[];
  /** The date of the last read of each verdict: the date of its stamp `verified`, or else the date of its run. */
  readonly verdictReadDates?: readonly (string | undefined)[];
  /** The committed sweep records of the strategy cards (CARD-CURVES). */
  readonly sweeps?: readonly unknown[];
  /** The date of the commit of the build. A page is live from the date of its commit. */
  readonly commitDate?: string;
}

/** The format of a sweep record: the curves of one strategy card, with one option changed at a time. */
export const SWEEP_FORMAT = "sweep/1";

/** The folder of the sweep records, relative to the root of the repository. */
export const SWEEP_DIR = "docs/research/sweeps";

/** The things that the count `cards-with-curves` does not read. */
export const CARDS_NOT_COUNTED = `A sweep that is not a committed record of ${SWEEP_DIR}, and a curve with fewer than 2 points.`;

/** One curve of a sweep record: the values of the measures at each value of one option. */
export interface SweepCurve {
  readonly option: string;
  readonly points: readonly { readonly value: number | string; readonly measures: Readonly<Record<string, number>> }[];
}

/** One sweep record: the curves of one strategy of one step. */
export interface SweepRecord {
  readonly format: typeof SWEEP_FORMAT;
  readonly step: string;
  readonly strategy: string;
  /** The ISO date of the run of the sweep. */
  readonly date: string;
  readonly curves: readonly SweepCurve[];
}

/** This function tells if a value is a sweep record with a curve of 2 points or more. */
export function hasCurve(value: unknown): value is SweepRecord {
  const r = value as Partial<SweepRecord> | null;
  if (typeof r !== "object" || r === null || r.format !== SWEEP_FORMAT) return false;
  if (typeof r.step !== "string" || typeof r.strategy !== "string" || !Array.isArray(r.curves)) return false;
  return r.curves.some((c) => Array.isArray(c?.points) && c.points.length >= 2);
}

/**
 * This function counts the strategy cards with a response curve. A card counts when its sweep record has a curve of 2 points or more.
 * Two records of one card count once.
 */
export function cardsWithCurves(records: readonly unknown[]): number {
  return new Set(records.filter(hasCurve).map((r) => `${r.step}\u0000${r.strategy}`)).size;
}

/** This function gives the time of the latest date of a list, or `undefined` for a list with no date. */
export function latestAt(dates: readonly (string | undefined)[]): string | undefined {
  const valid = dates.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)).map((d) => d.slice(0, 10));
  return valid.length === 0 ? undefined : `${valid.sort().at(-1)!}T00:00:00Z`;
}

/** This function gives the field `at` of a measure, or no field when the time is not known. */
const dated = (at: string | undefined): { at?: string } => (at === undefined ? {} : { at });

/** One measure of the file. */
export interface SiteMeasure {
  readonly id: string;
  readonly value: number;
  readonly unit?: string;
  /** The time of the data of this measure. Without it, the measure has the time of the file. */
  readonly at?: string;
  /** The things that this count does not read. */
  readonly notCounted?: string;
}

/** The input of the writer of `kpi.json`. */
export interface SiteKpi {
  readonly project: string;
  /** The time of the data: the date of the benchmark snapshot. It is not the time of the build. */
  readonly at: string;
  measures: SiteMeasure[];
}

/** This function gives the major and the minor of a version, or `undefined` when the text is not a version. */
function majorMinor(version: string): readonly [number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(version);
  return match ? [Number(match[1]), Number(match[2])] : undefined;
}

/**
 * This function counts the minor releases from the release of the snapshot to the release of the engine.
 * It gives `undefined` when a version is not valid or the two majors differ, because the count is then not known.
 */
export function minorsBehind(measured: string, engine: string): number | undefined {
  const a = majorMinor(measured);
  const b = majorMinor(engine);
  if (a === undefined || b === undefined || a[0] !== b[0]) return undefined;
  return Math.max(0, b[1] - a[1]);
}

/**
 * This function gives the largest count of `minorsBehind` over the cores of the records of the Results page.
 * So a current snapshot does not hide an old verdict. It gives `undefined` when the count of one record is not known.
 */
export function resultsLag(cores: readonly (string | undefined)[], engine: string): number | undefined {
  const lags = cores.map((c) => (c === undefined ? undefined : minorsBehind(c, engine)));
  return lags.some((lag) => lag === undefined) ? undefined : Math.max(...(lags as number[]));
}

/**
 * This function counts the verdicts of the Results page with no read on the minor of the engine.
 * A read on the same minor with the same rows stamps a verdict, so a version gap with equal numbers does not count.
 * A verdict that does not name its core counts, because its read is not known.
 */
export function resultsUnread(reads: readonly (string | undefined)[], engine: string): number {
  return reads.filter((c) => c === undefined || minorsBehind(c, engine) !== 0).length;
}

/**
 * This function gives the input of the writer. It gives `undefined` when the snapshot has no date, because the time of the data is then not known.
 *
 * @param meta - The fields of `bench-meta.json`.
 * @param core - The version of the engine in the repository.
 * @param hasPage - This function tells if a file of a page exists.
 * @param facts - The facts of the committed files.
 */
export function siteKpiInput(meta: BenchMeta, core: string, hasPage: (file: string) => boolean, facts: KpiFacts): SiteKpi | undefined {
  if (meta.date === undefined) return undefined;
  const lag = resultsLag([meta.core, ...facts.verdictCores], core);
  return {
    project: KPI_PROJECT,
    at: `${meta.date}T00:00:00Z`,
    measures: [
      ...(lag === undefined ? [] : [{ id: "results-lag", value: lag, unit: "releases" }]),
      // A read of the verdicts is not a run of the benchmark, so this measure has the time of its last read (KPI-CARDS).
      { id: "results-unread", value: resultsUnread(facts.verdictReads, core), unit: "snapshots", ...dated(latestAt(facts.verdictReadDates ?? [])) },
      { id: "playground-live", value: facts.demoComplete ? 1 : 0 },
      { id: "coverage-shown", value: facts.coverageCells > 0 ? 1 : 0 },
      ...Object.entries(KPI_PAGES).map(([id, file]) => ({ id, value: hasPage(file) ? 1 : 0, ...dated(latestAt([facts.commitDate])) })),
      {
        id: "cards-with-curves",
        value: cardsWithCurves(facts.sweeps ?? []),
        unit: "cards",
        notCounted: CARDS_NOT_COUNTED,
        ...dated(latestAt((facts.sweeps ?? []).filter(hasCurve).map((r) => r.date))),
      },
    ],
  };
}
