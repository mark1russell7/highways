// The label of the benchmark snapshot: its run, its commit and its date, and a warning when the snapshot is old.

/** The fields of `bench-meta.json` that the label uses. Each field can be absent. */
export interface BenchMeta {
  readonly run?: number;
  readonly sha?: string;
  readonly date?: string;
}

/** The label of the snapshot, as HTML, and the warning when the snapshot is old. */
export interface BenchLabel {
  /** The run, the commit and the date of the snapshot. */
  readonly html: string;
  /** The warning, as HTML. It is empty when the snapshot is current. */
  readonly warning: string;
  /** The age of the snapshot in days at the build date. It is `undefined` when a date is absent or not valid. */
  readonly ageDays: number | undefined;
}

/** A snapshot that is older than this number of days at the build date gets the warning. */
export const STALE_DAYS = 1;

const REPO = "https://github.com/mark1russell7/highways";

/** This function escapes text for HTML. */
const esc = (text: string): string =>
  text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]!);

/** This function gives the day number of a date of the form `YYYY-MM-DD`, or `undefined` when the text is not such a date. */
function dayOf(date: string | undefined): number | undefined {
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? undefined : Math.round(ms / 86_400_000);
}

/**
 * This function makes the label of the benchmark snapshot from `bench-meta.json` and the build date of the site.
 * When the snapshot is more than `STALE_DAYS` days older than the build, the label has a warning.
 * A new snapshot clears the warning at the next build, with no edit of the page.
 */
export function benchLabel(meta: BenchMeta, buildDate: string): BenchLabel {
  const run =
    typeof meta.run === "number"
      ? `the run <a href="${REPO}/actions/runs/${meta.run}">${meta.run}</a> of the workflow <code>Bench</code>`
      : "a run of the workflow <code>Bench</code> with no run id";
  const date = meta.date ? `on <strong>${esc(meta.date)}</strong>` : "on a date that the snapshot does not give";
  const sha = meta.sha ? `, at commit <a href="${REPO}/commit/${esc(meta.sha)}"><code>${esc(meta.sha.slice(0, 7))}</code></a>` : "";
  const html = `These times are from ${run}, ${date}${sha}. This build of the site is from ${esc(buildDate)}.`;
  const snap = dayOf(meta.date);
  const built = dayOf(buildDate);
  const ageDays = snap === undefined || built === undefined ? undefined : built - snap;
  const warning =
    ageDays !== undefined && ageDays > STALE_DAYS
      ? `These times are from ${esc(meta.date!)}. The bench on main is failing. The <a href="${REPO}/actions/workflows/bench.yml">runs of the workflow <code>Bench</code></a> show the cause.`
      : "";
  return { html, warning, ageDays };
}
