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
}

/** One measure of the file. */
export interface SiteMeasure {
  readonly id: string;
  readonly value: number;
  readonly unit?: string;
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
      { id: "playground-live", value: facts.demoComplete ? 1 : 0 },
      { id: "coverage-shown", value: facts.coverageCells > 0 ? 1 : 0 },
      ...Object.entries(KPI_PAGES).map(([id, file]) => ({ id, value: hasPage(file) ? 1 : 0 })),
    ],
  };
}
