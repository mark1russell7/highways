// The numbers of the file `kpi.json` of the site. Each value comes from a committed file of the build.
// So no reader copies a number from a page, and no number has a person as its source.
import { parseResponseRecord } from "@mark1russell7/rigor-statistics";
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
  /** The core of the last read of each verdict: the core of its stamp `verified`, or else the core of its run. */
  readonly verdictReads: readonly (string | undefined)[];
  /** The date of the last read of each verdict: the date of its stamp `verified`, or else the date of its run. */
  readonly verdictReadDates?: readonly (string | undefined)[];
  /** The committed sweep records of the strategy cards (CARD-CURVES), in the form `response-records/1`. */
  readonly sweeps?: readonly SweepFile[];
  /** The date of the commit of the build. A page is live from the date of its commit. */
  readonly commitDate?: string;
}

/** The folder of the sweep records, relative to the root of the repository. */
export const SWEEP_DIR = "docs/research/sweeps";

/** The two categorical dimensions that name a card in a sweep record. */
export const CARD_DIMENSIONS = ["step", "strategy"] as const;

/** The things that the count `results-lag` does not read. */
export const LAG_NOT_COUNTED = "The core of the first run of a snapshot. A stamp verified is a read, and the first core stays in the snapshot only as its source.";

/** The things that the count `cards-with-curves` does not read. */
export const CARDS_NOT_COUNTED = `A file of ${SWEEP_DIR} that is not a good record of response-records/1, a record with no dimensions step and strategy, and a card with fewer than 2 values of an option.`;

/** One committed sweep record and the date of its last commit. */
export interface SweepFile {
  /** The parsed JSON of the file. The count reads it only through `parseResponseRecord`. */
  readonly record: unknown;
  /** The date of the last commit of the file, in the form `YYYY-MM-DD`. */
  readonly date?: string;
}

/**
 * This function gives the cards of a sweep record that have a response curve. A card is a pair of a step and a strategy.
 * The card has a curve when its measured points have 2 or more values of one option that is not categorical.
 * A record that `parseResponseRecord` refuses gives no card.
 */
export function curveCards(value: unknown): string[] {
  const parsed = parseResponseRecord(value);
  if (!parsed.ok) return [];
  const { dimensions, points } = parsed.record;
  const named = CARD_DIMENSIONS.every((id) => dimensions.some((d) => d.id === id && d.kind === "categorical"));
  if (!named) return [];
  const options = dimensions.filter((d) => d.kind !== "categorical").map((d) => d.id);
  const values = new Map<string, Map<string, Set<string>>>();
  for (const point of points) {
    if (!Object.values(point.measures).some((m) => m !== null)) continue;
    const card = CARD_DIMENSIONS.map((id) => String(point.values[id])).join("/");
    const byOption = values.get(card) ?? new Map<string, Set<string>>();
    values.set(card, byOption);
    for (const option of options) {
      const v = point.values[option];
      if (v === null || v === undefined) continue;
      byOption.set(option, (byOption.get(option) ?? new Set<string>()).add(String(v)));
    }
  }
  return [...values].filter(([, byOption]) => [...byOption.values()].some((s) => s.size >= 2)).map(([card]) => card);
}

/**
 * This function counts the strategy cards with a response curve in the committed sweep records.
 * A card in two records counts once.
 */
export function cardsWithCurves(files: readonly SweepFile[]): number {
  return new Set(files.flatMap((f) => curveCards(f.record))).size;
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
 * This function gives the date of the oldest read with the largest count of `minorsBehind`.
 * It gives `undefined` when no such read has a date.
 *
 * @param cores - The core of each read.
 * @param dates - The date of each read, at the same position.
 * @param engine - The version of the engine.
 */
export function resultsLagAt(cores: readonly (string | undefined)[], dates: readonly (string | undefined)[], engine: string): string | undefined {
  const lag = resultsLag(cores, engine);
  if (lag === undefined) return undefined;
  const oldest = cores.map((c, i) => (c !== undefined && minorsBehind(c, engine) === lag ? dates[i] : undefined));
  const valid = oldest.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)).map((d) => d.slice(0, 10));
  return valid.length === 0 ? undefined : `${valid.sort()[0]!}T00:00:00Z`;
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
  // The lag reads the last read of each snapshot: its stamp `verified`, or else its run. A read with the same rows is a current result.
  // The target is at most 1 minor. The workflow `Read on release` holds it.
  const reads = [meta.core, ...facts.verdictReads];
  const lag = resultsLag(reads, core);
  // The lag has the date of the oldest read that gives it.
  const lagAt = resultsLagAt(reads, [meta.date, ...(facts.verdictReadDates ?? [])], core);
  return {
    project: KPI_PROJECT,
    at: `${meta.date}T00:00:00Z`,
    measures: [
      ...(lag === undefined ? [] : [{ id: "results-lag", value: lag, unit: "releases", notCounted: LAG_NOT_COUNTED, ...dated(lagAt) }]),
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
        ...dated(latestAt((facts.sweeps ?? []).filter((f) => curveCards(f.record).length > 0).map((f) => f.date))),
      },
    ],
  };
}
