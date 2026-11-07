// The data stamps of the Results page (VERDICT-STAMPS). The freshness gate of the Pages workflow reads them.
// Only the build and the tests use this module. It reads no file.

/** The npm name of the engine of each verdict run. */
export const ENGINE = "@mark1russell7/highways";

/** The page that shows the verdicts. */
export const RESULTS_PAGE = "results.html";

/** The workflow whose schedule reads each verdict again. Its schedule meets the age limit. */
export const READ_WORKFLOW = ".github/workflows/read-on-release.yml";

/** The age limit of the verdicts, in days. The read starts each week, so a missed week does not fail the gate. */
export const VERDICT_AGE_DAYS = 14;

/** The fields of a verdict snapshot that the stamps read. */
export interface VerdictHeader {
  readonly run?: string | number;
  readonly commit?: string;
  readonly date?: string;
  readonly core?: string;
  readonly verified?: { readonly run?: string | number; readonly commit?: string; readonly date?: string; readonly core?: string };
}

/** One run of a stamp, in the form `data-stamp/1`. */
export interface StampRun {
  readonly id: string;
  readonly url: string;
  readonly date: string;
  readonly engines: Readonly<Record<string, string>>;
  readonly commit?: string;
}

/** The stamps of a site, in the form `data-stamp/1`. */
export interface VerdictStamps {
  readonly schema: "data-stamp/1";
  readonly pages: readonly {
    readonly page: string;
    readonly runs: readonly StampRun[];
    readonly limit: { readonly days: number; readonly reason: string; readonly workflow: string };
  }[];
}

/**
 * This function gives the run of the last read of a verdict: the run of its stamp `verified`, or else the run of its header.
 * It gives `undefined` when the read has no run, no date or no core. The gate then fails, because the page has no stamp for that verdict.
 */
export function lastRead(header: VerdictHeader, repo: string): StampRun | undefined {
  const read = header.verified?.run !== undefined ? header.verified : header;
  if (read.run === undefined || read.date === undefined || read.core === undefined) return undefined;
  const id = String(read.run);
  return {
    id,
    url: `https://github.com/${repo}/actions/runs/${id}`,
    date: /T/.test(read.date) ? read.date : `${read.date}T00:00:00Z`,
    engines: { [ENGINE]: read.core },
    ...(read.commit === undefined ? {} : { commit: read.commit }),
  };
}

/**
 * This function gives the stamps of the Results page: one run for each distinct run of the last reads of the verdicts.
 * A verdict whose read has no run stops the build, because a page with an unknown run cannot pass the gate.
 */
export function verdictStamps(headers: readonly VerdictHeader[], repo: string): VerdictStamps {
  const runs = new Map<string, StampRun>();
  headers.forEach((header, i) => {
    const run = lastRead(header, repo);
    if (run === undefined) throw new Error(`The verdict ${i} has no run, date or core of its last read.`);
    runs.set(run.id, run);
  });
  return {
    schema: "data-stamp/1",
    pages: [
      {
        page: RESULTS_PAGE,
        runs: [...runs.values()].sort((a, b) => a.id.localeCompare(b.id)),
        limit: {
          days: VERDICT_AGE_DAYS,
          reason: "The workflow Read on release reads each verdict again each week and after each release of the core.",
          workflow: READ_WORKFLOW,
        },
      },
    ],
  };
}
