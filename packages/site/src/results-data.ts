// The data of the results page (SITE-LIVE). The build reads the committed files and gives them to these functions.
// This module has no access to the file system and to the network, so the page and the tests use the same rules.

/** The label of a verdict over families, as `verdict` of `layout-contract` gives it. */
export type VerdictLabel = "better" | "worse" | "depends on the mix" | "no verdict";

/** The labels in the sequence of the page. */
export const LABELS: readonly VerdictLabel[] = ["better", "worse", "depends on the mix", "no verdict"];

/** The verdict of one strategy on one guard measure, as `scripts/screen-verdict.ts` writes it. */
export interface SnapshotRow {
  readonly strategy: string;
  readonly guard: string;
  readonly measure: string;
  readonly label: VerdictLabel;
  readonly old: string;
  readonly stratified: number;
  readonly pooled: number;
  readonly p: number;
  readonly families: readonly { readonly family: string; readonly n: number; readonly mean: number; readonly sign: -1 | 0 | 1 }[];
  readonly breadth: { readonly against: number; readonly of: number; readonly ties: number };
}

/** The header of a verdict snapshot `docs/research/verdicts/<set>-<step>.json`. */
export interface SnapshotHeader {
  readonly set: string;
  readonly step: string;
  readonly base: string;
  readonly level: number;
  readonly run: number;
  readonly commit: string;
  readonly date: string;
  readonly core: string;
}

/** A verdict snapshot: the header and the rows. */
export interface Snapshot extends SnapshotHeader {
  readonly rows: readonly SnapshotRow[];
}

/** The fields of the header with their types. A snapshot without one of them is not valid. */
const HEADER: Readonly<Record<keyof SnapshotHeader, "string" | "number">> = {
  set: "string",
  step: "string",
  base: "string",
  level: "number",
  run: "number",
  commit: "string",
  date: "string",
  core: "string",
};

/** This function reads the JSON text of a snapshot. It throws an error when a header field is missing or has the wrong type. */
export function parseSnapshot(text: string, name = "snapshot"): Snapshot {
  const value = JSON.parse(text) as Record<string, unknown>;
  for (const [key, type] of Object.entries(HEADER)) {
    if (typeof value[key] !== type) throw new Error(`The ${name} has no ${type} field "${key}" in its header.`);
  }
  if (!Array.isArray(value["rows"])) throw new Error(`The ${name} has no rows.`);
  return value as unknown as Snapshot;
}

/** The sign of one family as one character: `+` the strategy wins, `-` it loses, `0` a tie. */
const SIGN_CHAR = { 1: "+", 0: "0", [-1]: "-" } as const;

/** One cell of the verdict grid: one strategy on one guard. */
export interface VerdictCell {
  readonly guard: string;
  readonly label: VerdictLabel;
  readonly against: number;
  readonly of: number;
  readonly ties: number;
  /** The sign of each family, in the sequence of `families` of the table. */
  readonly signs: string;
  readonly p: number;
}

/** The verdict grid of one set and one step: the strategy rows and the guard columns. */
export interface VerdictTable extends SnapshotHeader {
  readonly families: readonly string[];
  readonly guards: readonly { readonly id: string; readonly measure: string }[];
  readonly strategies: readonly { readonly name: string; readonly cells: readonly VerdictCell[] }[];
}

/** This function gives the verdict grid of a snapshot. It keeps only the fields that the page shows. */
export function verdictTable(s: Snapshot): VerdictTable {
  const families = s.rows[0]?.families.map((f) => f.family) ?? [];
  const guards: { id: string; measure: string }[] = [];
  const byStrategy = new Map<string, VerdictCell[]>();
  for (const r of s.rows) {
    if (!guards.some((g) => g.id === r.guard)) guards.push({ id: r.guard, measure: r.measure });
    const signs = families.map((f) => SIGN_CHAR[r.families.find((x) => x.family === f)?.sign ?? 0]).join("");
    const cell: VerdictCell = { guard: r.guard, label: r.label, against: r.breadth.against, of: r.breadth.of, ties: r.breadth.ties, signs, p: Number(r.p.toPrecision(3)) };
    const list = byStrategy.get(r.strategy) ?? [];
    list.push(cell);
    byStrategy.set(r.strategy, list);
  }
  const { rows: _rows, ...header } = s;
  return { ...header, families, guards, strategies: [...byStrategy].map(([name, cells]) => ({ name, cells })) };
}

/** A `better` verdict with 1 or more families against it: no single default wins on all the families. */
export interface SplitVerdict {
  readonly step: string;
  readonly strategy: string;
  readonly guard: string;
  readonly measure: string;
  /** The families where the strategy loses beyond the tie. */
  readonly against: readonly string[];
  readonly of: number;
}

/** This function gives each `better` verdict of a snapshot with 1 or more families against it. */
export function splitVerdicts(s: Snapshot): SplitVerdict[] {
  return s.rows
    .filter((r) => r.label === "better" && r.breadth.against >= 1)
    .map((r) => ({ step: s.step, strategy: r.strategy, guard: r.guard, measure: r.measure, against: r.families.filter((f) => f.sign === -1).map((f) => f.family), of: r.breadth.of }));
}

/** The fields of an idea record that the page reads. `docs/research/ideas/schema.json` has all the fields. */
export interface IdeaRecord {
  readonly id: string;
  readonly name: string;
  readonly step: string;
  readonly stage: string;
  readonly promotion?: unknown;
  readonly result?: { readonly date?: string; readonly run?: string; readonly note?: string };
}

/** The stages of an idea in the sequence of the page. The stage `cataloged` is an idea that is not built. */
export const STAGES: readonly string[] = ["kept", "screened", "dropped", "prototyped", "built", "cataloged"];

/** One row of a Shipped table of a roadmap. */
export interface ShippedRow {
  readonly id: string;
  readonly item: string;
  readonly date: string;
  readonly link: string;
}

/** This function gives the rows of the table in the section `## Shipped` of a roadmap, from the first to the last. */
export function shippedRows(roadmap: string): ShippedRow[] {
  const lines = roadmap.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "## Shipped");
  if (start < 0) return [];
  const out: ShippedRow[] = [];
  for (let i = start + 1; i < lines.length && !lines[i]!.startsWith("## "); i++) {
    const cells = splitRow(lines[i]!);
    if (cells.length !== 4 || cells[0] === "Id" || /^-+$/.test(cells[0]!)) continue;
    out.push({ id: cells[0]!, item: cells[1]!, date: cells[2]!, link: cells[3]! });
  }
  return out;
}

/** This function gives the cells of one row of a Markdown table. A `|` in a code span stays in its cell. */
function splitRow(line: string): string[] {
  if (!line.startsWith("|")) return [];
  const cells: string[] = [];
  let cell = "";
  let code = false;
  for (const ch of line.slice(1)) {
    if (ch === "`") code = !code;
    if (ch === "|" && !code) {
      cells.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  return cells;
}

/** One kept or opt-in strategy or option. The default routes do not change, until a promotion. */
export interface KeptRow {
  readonly id: string;
  readonly name: string;
  /** The strategy or the option: the first code span of the note or of the roadmap row. */
  readonly what: string;
  readonly step: string;
  readonly status: "kept" | "opt-in";
  readonly default: "unchanged" | "promoted";
  readonly note: string;
  readonly date: string;
  readonly link: string;
}

const firstCode = (text: string): string => /`([^`]+)`/.exec(text)?.[1] ?? "";
const firstSentence = (text: string): string => /^.*?\.(?=\s|$)/.exec(text.trim())?.[0] ?? text.trim();

/**
 * This function gives the kept ideas of the records and the opt-in items of the roadmap.
 * An opt-in item is a Shipped row with the word "opt-in" that is not a release row (`REL<n>`).
 */
export function keptRows(records: readonly IdeaRecord[], shipped: readonly ShippedRow[]): KeptRow[] {
  const kept: KeptRow[] = records
    .filter((r) => r.stage === "kept")
    .map((r) => ({
      id: r.id,
      name: r.name,
      what: firstCode(r.result?.note ?? ""),
      step: r.step,
      status: "kept",
      default: r.promotion === undefined ? "unchanged" : "promoted",
      note: firstSentence(r.result?.note ?? ""),
      date: r.result?.date ?? "",
      link: r.result?.run ?? "",
    }));
  const optIn: KeptRow[] = shipped
    .filter((r) => /\bopt-in\b/i.test(r.item) && !/^REL\d+$/.test(r.id))
    .map((r) => ({ id: r.id, name: r.id, what: firstCode(r.item.replace(/\[[^\]]*\]\([^)]*\)/g, (m) => m.replace(/\(.*\)$/, ""))), step: "", status: "opt-in", default: "unchanged", note: firstSentence(r.item), date: r.date, link: r.link }));
  return [...kept, ...optIn];
}

/** This function counts the ideas of each stage, in the sequence of `STAGES`. A stage that is not in `STAGES` comes last. */
export function stageCounts(records: readonly IdeaRecord[]): { readonly stage: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.stage, (counts.get(r.stage) ?? 0) + 1);
  const order = [...STAGES, ...[...counts.keys()].filter((s) => !STAGES.includes(s)).sort()];
  return order.filter((s) => counts.has(s)).map((stage) => ({ stage, count: counts.get(stage)! }));
}

/** One row of the idea queue that the page shows. */
export interface QueueTopRow {
  readonly rank: number;
  readonly id: string;
  readonly name: string;
  readonly step: string;
  readonly score: number;
  readonly status: string;
  /** The reasons that block a build, for example `step:levels`. */
  readonly blockedBy: readonly string[];
}

/** The part of the idea queue that the page shows: the top rows and the counts. */
export interface QueueView {
  readonly date: string;
  readonly formula: string;
  readonly ranked: number;
  readonly blocked: number;
  /** The count of the canonical ideas of each status, in the sequence of `QUEUE_STATUSES`. */
  readonly statuses: readonly { readonly status: string; readonly count: number }[];
  readonly top: readonly QueueTopRow[];
}

/** The statuses of a row of the queue, in the sequence of the page. */
export const QUEUE_STATUSES: readonly string[] = ["queued", "building", "built"];

/** The number of queue rows that the page shows. */
export const QUEUE_TOP = 20;

/** This function reads the text of `queue.json` and gives the part that the page shows. */
export function queueView(text: string): QueueView {
  const q = JSON.parse(text) as {
    date: string;
    formula: string;
    counts: { ranked: number; blocked: number; byStatus: Record<string, number> };
    rows: { rank: number | null; id: string; name: string; step: string; score: number; status: string; blockedBy: string[] }[];
  };
  if (!Array.isArray(q.rows) || typeof q.counts?.ranked !== "number") throw new Error("queue.json has no rows or no counts.");
  return {
    date: q.date,
    formula: q.formula,
    ranked: q.counts.ranked,
    blocked: q.counts.blocked,
    statuses: QUEUE_STATUSES.map((status) => ({ status, count: q.counts.byStatus[status] ?? 0 })),
    top: q.rows
      .filter((r): r is typeof r & { rank: number } => r.rank !== null)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, QUEUE_TOP)
      .map((r) => ({ rank: r.rank, id: r.id, name: r.name, step: r.step, score: r.score, status: r.status, blockedBy: r.blockedBy })),
  };
}

/** The data of the results page. The build makes it from the committed files. */
export interface ResultsData {
  readonly tables: readonly VerdictTable[];
  /** The set of the split verdicts: the last set of the snapshots. */
  readonly splitSet: string;
  readonly split: readonly SplitVerdict[];
  /** The number of `better` verdicts of the split set. */
  readonly betterCount: number;
  readonly ideas: { readonly total: number; readonly stages: readonly { readonly stage: string; readonly count: number }[]; readonly kept: readonly KeptRow[] };
  /** The top of the idea queue and its counts. */
  readonly queue: QueueView;
  /** The last Shipped rows of the roadmap, the newest first, with the item and the link as HTML. */
  readonly shipped: readonly ShippedRow[];
  /** The text of the page as HTML, by the headings of `content/results.md`. */
  readonly text: Readonly<Record<string, string>>;
}

/** The inputs of `resultsData`: the texts of the committed files. */
export interface ResultsInput {
  readonly snapshots: readonly { readonly name: string; readonly text: string }[];
  readonly ideas: readonly IdeaRecord[];
  readonly roadmap: string;
  /** This function changes Markdown to inline HTML. */
  readonly inline: (markdown: string) => string;
  readonly text: Readonly<Record<string, string>>;
  /** The text of `docs/research/queue.json`. */
  readonly queue: string;
}

/** The number of Shipped rows that the page shows. */
export const SHIPPED_COUNT = 10;

const REPO = "https://github.com/mark1russell7/highways";

/** This function changes the links of a roadmap row that are relative to `docs/` to links on GitHub. */
export function absoluteLinks(markdown: string): string {
  return markdown.replace(/\]\((?!https?:|#|mailto:)([^)]+)\)/g, (_m, href: string) => `](${REPO}/blob/main/docs/${href})`);
}

/** This function gives the Link cell of a roadmap row as HTML: each pull request and each commit gets a link. */
export function linkHtml(link: string): string {
  const parts: string[] = [];
  for (const m of link.matchAll(/#(\d+)|`([0-9a-f]{7,40})`/g)) {
    if (m[1] !== undefined) parts.push(`<a href="${REPO}/pull/${m[1]}">#${m[1]}</a>`);
    else parts.push(`<a href="${REPO}/commit/${m[2]}"><code>${m[2]!.slice(0, 7)}</code></a>`);
  }
  return parts.join(", ");
}

/** This function makes the data of the results page from the committed files. */
export function resultsData(input: ResultsInput): ResultsData {
  const snapshots = input.snapshots.map((s) => parseSnapshot(s.text, s.name)).sort((a, b) => a.set.localeCompare(b.set) || stepRank(a.step) - stepRank(b.step));
  const splitSet = snapshots.at(-1)?.set ?? "";
  const split = snapshots.filter((s) => s.set === splitSet).flatMap(splitVerdicts);
  const betterCount = snapshots.filter((s) => s.set === splitSet).reduce((n, s) => n + s.rows.filter((r) => r.label === "better").length, 0);
  const shipped = shippedRows(input.roadmap);
  return {
    tables: snapshots.map(verdictTable),
    splitSet,
    split,
    betterCount,
    ideas: { total: input.ideas.length, stages: stageCounts(input.ideas), kept: keptRows(input.ideas, shipped).map((k) => ({ ...k, note: input.inline(absoluteLinks(k.note)), link: keptLink(k) })) },
    queue: queueView(input.queue),
    shipped: shipped
      .slice(-SHIPPED_COUNT)
      .reverse()
      .map((r) => ({ ...r, item: input.inline(absoluteLinks(r.item)), link: linkHtml(r.link) })),
    text: input.text,
  };
}

/** This function gives the link of a kept row as HTML: the screen run of a record, or the link cell of a roadmap row. */
function keptLink(k: KeptRow): string {
  if (k.status === "opt-in") return linkHtml(k.link);
  const run = /\/runs\/(\d+)/.exec(k.link)?.[1];
  return run === undefined ? "" : `<a href="${REPO}/actions/runs/${run}">run ${run}</a>`;
}

/** The step `router` comes before the step `highway`. */
const stepRank = (step: string): number => (step === "router" ? 0 : step === "highway" ? 1 : 2);
