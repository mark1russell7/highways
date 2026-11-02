// The plan and the verdict of the confirm mode of the workflow `Sections bisect` (SECTIONS-SLOW step 1b).
// The bisect compares two neighbors from two jobs, so a step between them does not prove its commit. The confirm times each named commit against its parent in one job.
// Each job times the commit, the parent and the A/A arm of the parent on the board of the bisect, in fresh processes. `gates/pair-confirm.ts` has the timing and the band.
// This module imports only node modules and the gates, so a job with no installed packages can start it.
import { type PairedReport, type RecordEnv } from "./gates/paired.ts";
import { InputError } from "./gates/inputs.ts";
import { pairVerdicts, type PairVerdict } from "./gates/pair-confirm.ts";

/** The ref of the checkout. An empty parent is the checkout too. */
export const HEAD_REF = "HEAD";
/** The timed rounds of each arm in the confirm mode by default. */
export const CONFIRM_ROUNDS = 10;
/** The largest count of pairs in one run. */
export const MAX_PAIRS = 9;
/** The schema of the record of one job of the confirm mode. */
export const PAIR_SCHEMA = "sections-confirm-pair/1";
/** The schema of the joined record of the confirm mode. */
export const CONFIRM_SCHEMA = "sections-confirm/1";

/** One pair of the plan: its place from 1, the ref of the commit and the ref of the parent, as the input names them. */
export interface Pair {
  readonly pair: number;
  readonly commit: string;
  readonly parent: string;
}

/** A git ref that the input takes: a hash, a branch, a tag or `HEAD`, with `^` and `~` after it. */
const REF = /^[0-9A-Za-z][0-9A-Za-z._/~^-]*$/;

/**
 * This function reads the input `pairs`: pairs `commit:parent` with spaces between them.
 *
 * - An empty parent, or a token with no `:`, gives the parent `HEAD`: the checkout.
 * - A ref with other characters, a pair two times or a commit that is its own parent throws a `RangeError`.
 * - The input names 1 to `MAX_PAIRS` pairs.
 */
export function parsePairs(text: string | undefined): Pair[] {
  const tokens = (text ?? "").split(/\s+/).filter((s) => s.length > 0);
  if (tokens.length === 0) throw new RangeError("The input pairs names no pair.");
  if (tokens.length > MAX_PAIRS) throw new RangeError(`The input pairs names ${tokens.length} pairs. The limit is ${MAX_PAIRS}.`);
  const out: Pair[] = [];
  for (const token of tokens) {
    const parts = token.split(":");
    if (parts.length > 2) throw new RangeError(`The pair "${token}" has more than one ":".`);
    const commit = parts[0]!;
    const parent = parts[1] === undefined || parts[1] === "" ? HEAD_REF : parts[1];
    for (const ref of [commit, parent]) if (!REF.test(ref)) throw new RangeError(`The pair "${token}" has the ref "${ref}", and a ref has only letters, digits and . _ / ~ ^ -.`);
    if (commit === parent) throw new RangeError(`The pair "${token}" compares a commit with itself.`);
    if (out.some((p) => p.commit === commit && p.parent === parent)) throw new RangeError(`The input pairs names the pair "${token}" two times.`);
    out.push({ pair: out.length + 1, commit, parent });
  }
  return out;
}

/** This function gives the name of the record file of a pair: `confirm-pair3.json`. */
export const confirmFile = (pair: number): string => `confirm-pair${pair}.json`;

/** This function gives the pair of a record file, for example 3 for `confirm-pair3.json`. Another name gives `undefined`. */
export function pairOfFile(file: string): number | undefined {
  const match = /(?:^|[\\/])confirm-pair([1-9][0-9]*)\.json$/.exec(file);
  return match === null ? undefined : Number(match[1]);
}

/** One side of a pair: the ref of the input, its full hash and its subject. */
export interface Side {
  readonly ref: string;
  readonly sha: string;
  readonly subject: string;
}

/** The record of one job of the confirm mode, with the schema `sections-confirm-pair/1`. */
export interface PairRecord {
  readonly schema: typeof PAIR_SCHEMA;
  readonly pair: number;
  /** The full hash of the checkout of the run. */
  readonly head: string;
  /** The full hash of the base of the board: `fa1dd82~1`. */
  readonly base: string;
  /** The fixture of the base that each arm routes. */
  readonly fixture: string;
  readonly routers: readonly string[];
  readonly rounds: number;
  readonly commit: Side;
  readonly parent: Side;
  /** The reason when the job timed no arm, else `null`. */
  readonly skipped: string | null;
  /** The computer and the mode of the record. */
  readonly env: RecordEnv;
  /** The paired report with the arms `parent` and `commit`. It is `null` when the job skipped the pair. */
  readonly report: PairedReport | null;
}

/** The result of one pair on one router. */
export interface ConfirmRow {
  readonly pair: number;
  readonly router: string;
  /** The refs of the input. */
  readonly commitRef: string;
  readonly parentRef: string;
  /** The full hashes. They are `null` when no record has the pair. */
  readonly commit: string | null;
  readonly parent: string | null;
  readonly subject: string;
  /** The median time of the commit over the median time of the parent, in the same job. */
  readonly ratio: number | null;
  readonly parentMs: number | null;
  readonly commitMs: number | null;
  /** The count of the A/A ratios of the job. */
  readonly aaCount: number;
  /** The A/A spread of the job: p90 of |r - 1| over its A/A ratios. */
  readonly spread: number | null;
  readonly band: { readonly lo: number; readonly hi: number } | null;
  readonly verdict: PairVerdict;
  readonly cpu: string | null;
}

/** The joined record of the confirm mode, with the schema `sections-confirm/1`. */
export interface ConfirmRecord {
  readonly schema: typeof CONFIRM_SCHEMA;
  readonly head: string;
  readonly base: string;
  readonly fixture: string;
  readonly rounds: number;
  readonly routers: readonly string[];
  readonly pairs: readonly Pair[];
  /** The pairs with no record. */
  readonly missing: readonly number[];
  readonly skipped: readonly { readonly pair: number; readonly reason: string }[];
  /** One row for each pair and router, in the order of the plan. */
  readonly rows: readonly ConfirmRow[];
  /** This value is `true` when each pair has a record and a time for each router. */
  readonly complete: boolean;
}

/** This function checks that the records agree with each other and with the plan. It throws an `InputError`. */
function checkRecords(records: readonly PairRecord[], plan: readonly Pair[]): void {
  if (records.length === 0) throw new InputError("Sections confirm: there is no record of a pair.");
  const first = records[0]!;
  const seen = new Set<number>();
  for (const r of records) {
    const name = `Sections confirm, pair ${r?.pair}`;
    if (r?.schema !== PAIR_SCHEMA) throw new InputError(`${name}: the record is not of schema ${PAIR_SCHEMA}.`);
    if (seen.has(r.pair)) throw new InputError(`${name}: the pair has two records.`);
    seen.add(r.pair);
    const own = plan.find((p) => p.pair === r.pair);
    if (own === undefined) throw new InputError(`${name}: the plan has no pair ${r.pair}.`);
    if (own.commit !== r.commit.ref || own.parent !== r.parent.ref) throw new InputError(`${name}: the record has the pair ${r.commit.ref}:${r.parent.ref}, and the plan has ${own.commit}:${own.parent}.`);
    if (r.head !== first.head || r.base !== first.base) throw new InputError(`${name}: the record has another head or base than the pair ${first.pair}.`);
    if (r.rounds !== first.rounds || r.fixture !== first.fixture || r.routers.join(",") !== first.routers.join(",")) throw new InputError(`${name}: the record has another plan than the pair ${first.pair}.`);
    const rep = r.report;
    if (rep === null) continue;
    if (rep.schema !== "paired-time/1" || rep.mode !== "fresh") throw new InputError(`${name}: the report is not of schema paired-time/1 in mode fresh.`);
  }
}

/**
 * This function joins the records of the pairs, and gives one row for each pair and router.
 *
 * - The records must agree on the head, the base, the plan of the timing and the pairs of `plan`. Else the function throws an `InputError`.
 * - A pair with no record goes in `missing`, and its rows have no time. Then `complete` is `false`.
 * - The ratio and the band of a row come from the report of its own job only.
 */
export function joinConfirm(records: readonly PairRecord[], plan: readonly Pair[]): ConfirmRecord {
  checkRecords(records, plan);
  const first = [...records].sort((a, b) => a.pair - b.pair)[0]!;
  const byPair = new Map(records.map((r) => [r.pair, r]));
  const rows: ConfirmRow[] = [];
  for (const p of plan) {
    const rec = byPair.get(p.pair);
    let results: ReturnType<typeof pairVerdicts> = [];
    if (rec?.report != null) {
      try {
        results = pairVerdicts(rec.report);
      } catch (error) {
        throw new InputError(`Sections confirm, pair ${p.pair}: ${(error as Error).message}`);
      }
    }
    for (const router of first.routers) {
      const x = results.find((r) => r.input === router);
      rows.push({
        pair: p.pair,
        router,
        commitRef: p.commit,
        parentRef: p.parent,
        commit: rec?.commit.sha ?? null,
        parent: rec?.parent.sha ?? null,
        subject: rec?.commit.subject ?? "",
        ratio: x?.ratio ?? null,
        parentMs: x?.parentMs ?? null,
        commitMs: x?.commitMs ?? null,
        aaCount: x?.aa.length ?? 0,
        spread: x === undefined || !Number.isFinite(x.spread) ? null : x.spread,
        band: x?.band ?? null,
        verdict: x?.verdict ?? "not measured",
        cpu: rec?.env.cpu ?? null,
      });
    }
  }
  const missing = plan.map((p) => p.pair).filter((n) => !byPair.has(n));
  const skipped = plan.flatMap((p) => {
    const reason = byPair.get(p.pair)?.skipped;
    return reason == null ? [] : [{ pair: p.pair, reason }];
  });
  return {
    schema: CONFIRM_SCHEMA,
    head: first.head,
    base: first.base,
    fixture: first.fixture,
    rounds: first.rounds,
    routers: first.routers,
    pairs: plan,
    missing,
    skipped,
    rows,
    complete: missing.length === 0 && rows.every((r) => r.verdict !== "not measured"),
  };
}

const fmt = (x: number | null, d = 3): string => (x === null ? "-" : Number.isFinite(x) ? x.toFixed(d) : String(x));
/** This function writes a time in ms, or in s above 10 s. */
const time = (ms: number | null): string => (ms === null || !Number.isFinite(ms) ? "-" : ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toFixed(1)} ms`);
/** This function keeps a text in one cell of a table. */
const cell = (text: string): string => text.replace(/\|/g, "/");
/** This function writes a side of a pair: the short hash, and the ref of the input when the hash does not start with it. */
function sideText(ref: string, sha: string | null): string {
  if (sha === null) return `\`${ref}\``;
  return sha.startsWith(ref) ? `\`${sha.slice(0, 7)}\`` : `\`${sha.slice(0, 7)}\` (\`${ref}\`)`;
}

/** This function gives the Markdown text of a joined record of the confirm mode: the plan, then one table row for each pair and router. */
export function confirmText(j: ConfirmRecord): string[] {
  const lines = [
    "# The confirm of the sections steps (SECTIONS-SLOW)",
    "",
    `Each job times one commit against its parent on the fixture \`${j.fixture}\` of \`fa1dd82~1\` (\`${j.base.slice(0, 7)}\`), with 10 000 nodes. The checkout is \`${j.head.slice(0, 7)}\`.`,
    `Each route has its own fresh process. Each arm has ${j.rounds} rounds, and in each round the arms take turns. The A/A arm is a second copy of the parent.`,
    "",
    "A ratio is the median time of the commit over the median time of the parent in the same job. Above 1, the commit is slower.",
    "The A/A spread of a job is p90 of |r - 1| over the A/A ratios of its rounds. This is the rule of the bisect, in one job.",
    "A ratio outside 1 ± the spread leaves the band of the parent.",
    "",
  ];
  if (!j.complete) {
    lines.push("**The record is not complete.**");
    if (j.missing.length > 0) lines.push(`${j.missing.length === 1 ? "The pair" : "The pairs"} ${j.missing.join(", ")} ${j.missing.length === 1 ? "has" : "have"} no record.`);
    for (const s of j.skipped) lines.push(`- The job of the pair ${s.pair} timed no arm: ${s.reason}`);
    lines.push("");
  }
  lines.push(
    "| pair | router | commit | parent | subject | ratio | A/A band of the job | parent time | commit time | verdict | computer |",
    "|---:|---|---|---|---|---:|---|---:|---:|---|---|",
    ...j.rows.map(
      (r) =>
        `| ${r.pair} | \`${r.router}\` | ${sideText(r.commitRef, r.commit)} | ${sideText(r.parentRef, r.parent)} | ${cell(r.subject)} | ${fmt(r.ratio)} | ${r.band === null ? "-" : `${fmt(r.band.lo)} to ${fmt(r.band.hi)}`} | ${time(r.parentMs)} | ${time(r.commitMs)} | ${r.verdict} | ${cell(r.cpu ?? "-")} |`,
    ),
    "",
  );
  return lines;
}
