// The plan and the verdict of the workflow `Sections bisect` (SECTIONS-SLOW step 1).
// The H3 remeasure found `sections` and `sections-tree` slower than the core of `fa1dd82~1`. This run finds the commit of each change.
// Each job times the base `fa1dd82~1` and its share of the candidate commits on one board, in fresh processes, with the A/A arm.
// The join reads the record of each job. It gives each candidate its ratio against the base of its own job, and the first slower commit.
// This module imports only node modules and the gates, so a job with no installed packages can start it.
import { aaId, type PairedReport, type RecordEnv } from "./gates/paired.ts";
import { aaRatios, spreadOf, verdictOf, type PairVerdict } from "./gates/pair-confirm.ts";
import { InputError } from "./gates/inputs.ts";
import { H3_FIXTURE, H3_ROUTERS } from "./remeasure-verdict.ts";

/** The id of the base arm: the core of `fa1dd82~1`. Each ratio has its time below the line. */
export const BASE_ARM = "base";
/** The git ref of the base: the parent of the fix of H3. */
export const BASE_REF = "fa1dd82~1";
/** The fix of H3. It is the first candidate. */
export const FIX_COMMIT = "fa1dd82";
/** The board of the run: the fixture `large-clustered` of the base, with 10 000 nodes. It is the board of H3. */
export const BISECT_FIXTURE = H3_FIXTURE;
/** The routers that the run times by default. */
export const BISECT_ROUTERS = ["sections-tree", "sections"] as const;
/** The count of the jobs. Each job times its share of the candidates. */
export const BISECT_SHARDS = 9;
/** The timed rounds of each arm by default. */
export const BISECT_ROUNDS = 3;
/** The largest count of rounds that the input `rounds` takes. */
export const MAX_ROUNDS = 20;
/** The schema of the record of one job. */
export const SHARD_SCHEMA = "sections-bisect-shard/1";
/** The schema of the joined record. */
export const RECORD_SCHEMA = "sections-bisect/1";

/** The routers that the input `routers` takes: the routers of H3 and the settings of the site. */
export const TIMED_ROUTERS = [...H3_ROUTERS, "sections-site"] as const;

/** This function reads the input `routers`: names with commas between them. Each name must be in `TIMED_ROUTERS`. */
export function parseRouters(text: string | undefined): string[] {
  const names = (text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (names.length === 0) throw new RangeError("The input routers names no router.");
  for (const name of names) if (!(TIMED_ROUTERS as readonly string[]).includes(name)) throw new RangeError(`There is no router "${name}". The routers are ${TIMED_ROUTERS.join(", ")}.`);
  if (new Set(names).size !== names.length) throw new RangeError(`The input routers names a router two times: ${names.join(", ")}.`);
  return names;
}

/** This function reads the input `rounds`: a whole number from 1 to `MAX_ROUNDS`. */
export function parseRounds(text: string | undefined): number {
  const value = Number((text ?? "").trim());
  if (!Number.isInteger(value) || value < 1 || value > MAX_ROUNDS) throw new RangeError(`The input rounds takes a whole number from 1 to ${MAX_ROUNDS}, not "${text ?? ""}".`);
  return value;
}

/** One candidate commit: its full hash and its subject. */
export interface Candidate {
  readonly commit: string;
  readonly subject: string;
}

/**
 * This function reads the output of `git log --format=%H%x09%s`: one line for each commit, the hash, a tab, then the subject.
 * It gives the commits in the order of the lines. A line with no full hash throws an `InputError`.
 */
export function parseLog(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const tab = line.indexOf("\t");
    const commit = tab < 0 ? line.trim() : line.slice(0, tab).trim();
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new InputError(`The git log has a line with no full hash: ${line}`);
    out.push({ commit, subject: tab < 0 ? "" : line.slice(tab + 1).trim() });
  }
  if (new Set(out.map((c) => c.commit)).size !== out.length) throw new InputError("The git log has a commit two times.");
  return out;
}

/**
 * This function gives the candidates of one job, 1 to `shards`. The candidate at the place `k` goes to the job `(k mod shards) + 1`.
 * So each job gets candidates from the full range of the history, and a slow computer does not hold one part of it.
 */
export function shardOf<T>(order: readonly T[], shard: number, shards: number): T[] {
  if (!Number.isInteger(shards) || shards < 1) throw new RangeError("The count of the jobs is a whole number of 1 or more.");
  if (!Number.isInteger(shard) || shard < 1 || shard > shards) throw new RangeError(`The job is a whole number from 1 to ${shards}.`);
  return order.filter((_, i) => i % shards === shard - 1);
}

/** This function gives the name of the record file of a job: `bisect-shard3.json`. */
export const shardFile = (shard: number): string => `bisect-shard${shard}.json`;

/** This function gives the job of a record file, for example 3 for `bisect-shard3.json`. Another name gives `undefined`. */
export function shardOfFile(file: string): number | undefined {
  const match = /(?:^|[\\/])bisect-shard([1-9][0-9]*)\.json$/.exec(file);
  return match === null ? undefined : Number(match[1]);
}

/** A candidate that a job did not time, and the reason. */
export interface Skipped {
  readonly commit: string;
  readonly reason: string;
}

/** The record of one job, with the schema `sections-bisect-shard/1`. */
export interface ShardRecord {
  readonly schema: typeof SHARD_SCHEMA;
  readonly shard: number;
  readonly shards: number;
  /** The full hash of the head of the run. */
  readonly head: string;
  /** The full hash of the base. */
  readonly base: string;
  readonly fixture: string;
  readonly routers: readonly string[];
  readonly rounds: number;
  /** Each candidate of the run, the oldest first. */
  readonly order: readonly Candidate[];
  /** The candidates of this job, the oldest first. */
  readonly commits: readonly string[];
  readonly skipped: readonly Skipped[];
  /** The computer and the mode of the record. */
  readonly env: RecordEnv;
  /** The paired report of the job. It is `null` when the job skipped each of its candidates. */
  readonly report: PairedReport | null;
}

/**
 * This function gives the A/A ratios of one router in one report, one value for each round.
 * The ratio of a round is the time of the A/A arm over the time of the base in the same round. The confirm gate has the rule.
 */
export const aaRounds = (report: PairedReport, router: string): number[] => aaRatios(report, router);

/** This function gives the A/A spread of a router: p90 of |r - 1| over its A/A ratios. An empty list gives NaN. */
export const aaSpread = (ratios: readonly number[]): number => spreadOf(ratios);

/** The verdict of one candidate against the base. */
export type RowVerdict = PairVerdict;

/** This function compares a ratio with the band of the base, 1 - spread to 1 + spread. A ratio on an edge is inside. */
export const classify = (ratio: number | null, spread: number): RowVerdict => verdictOf(ratio, spread);

/** The values of one candidate for one router. */
export interface BisectRow {
  /** The place of the candidate in the order, from 0. */
  readonly index: number;
  readonly commit: string;
  readonly subject: string;
  /** The job that timed the candidate. It is `null` when no record has the candidate. */
  readonly shard: number | null;
  readonly cpu: string | null;
  /** The median time of the candidate over the median time of the base of its job. */
  readonly ratio: number | null;
  /** The lowest and the highest A/A ratio of the job, over its rounds. */
  readonly band: { readonly lo: number; readonly hi: number } | null;
  /** The median times of the base and the candidate, in ms. */
  readonly baseMs: number | null;
  readonly commitMs: number | null;
  readonly verdict: RowVerdict;
}

/** A change of the ratio between two neighbors in the order. The first neighbor of the first candidate is the base, with the ratio 1. */
export interface Step {
  readonly commit: string;
  readonly from: number;
  readonly to: number;
  readonly delta: number;
}

/** The result of one router over the candidates. */
export interface RouterResult {
  readonly router: string;
  /** The A/A spread over the rounds of each job. */
  readonly spread: number;
  /** The count of the A/A ratios of the spread. */
  readonly aaCount: number;
  readonly rows: readonly BisectRow[];
  /** The first candidate that is slower than the base. */
  readonly first: string | null;
  /** The last candidate with a time before `first`, else the base. */
  readonly before: string | null;
  /** The count of the candidates with no time between `before` and `first`. The change is in one of them, or in `first`. */
  readonly unmeasured: number;
  /** The first candidate of the last run of slower candidates: each later candidate with a time is slower too. */
  readonly held: string | null;
  /** The changes of the ratio between neighbors that are larger than 2 times the spread. */
  readonly steps: readonly Step[];
}

/** The joined record of the jobs, with the schema `sections-bisect/1`. */
export interface BisectRecord {
  readonly schema: typeof RECORD_SCHEMA;
  readonly head: string;
  readonly base: string;
  readonly fixture: string;
  readonly rounds: number;
  /** The count of the candidates. */
  readonly candidates: number;
  /** The computer and the mode of each job with a record. */
  readonly shards: readonly { readonly shard: number; readonly cpu: string; readonly cores: number; readonly mode: string; readonly commits: number; readonly skipped: number }[];
  /** The jobs with no record. */
  readonly missing: readonly number[];
  readonly skipped: readonly Skipped[];
  readonly routers: readonly RouterResult[];
  /** This value is `true` when each job has a record and each candidate has a time for each router. */
  readonly complete: boolean;
}

/** This function checks that the records of the jobs agree, and that each report fits the plan. It throws an `InputError`. */
function checkRecords(records: readonly ShardRecord[], shards: number): void {
  if (records.length === 0) throw new InputError("Sections bisect: there is no record of a job.");
  const first = records[0]!;
  const seen = new Set<number>();
  for (const r of records) {
    const name = `Sections bisect, job ${r?.shard}`;
    if (r?.schema !== SHARD_SCHEMA) throw new InputError(`${name}: the record is not of schema ${SHARD_SCHEMA}.`);
    if (seen.has(r.shard)) throw new InputError(`${name}: the job has two records.`);
    seen.add(r.shard);
    if (r.shards !== shards || r.shard < 1 || r.shard > shards) throw new InputError(`${name}: the record has the job ${r.shard} of ${r.shards}, and the plan has ${shards} jobs.`);
    if (r.head !== first.head || r.base !== first.base) throw new InputError(`${name}: the record has another head or base than the job ${first.shard}.`);
    if (r.rounds !== first.rounds || r.fixture !== first.fixture || r.routers.join(",") !== first.routers.join(",")) throw new InputError(`${name}: the record has another plan than the job ${first.shard}.`);
    if (r.order.map((c) => c.commit).join(",") !== first.order.map((c) => c.commit).join(",")) throw new InputError(`${name}: the record has another order of the candidates than the job ${first.shard}.`);
    const own = shardOf(r.order, r.shard, r.shards).map((c) => c.commit);
    if (own.join(",") !== r.commits.join(",")) throw new InputError(`${name}: the candidates of the record are not the share of the job.`);
    const rep = r.report;
    if (rep === null) continue;
    if (rep.schema !== "paired-time/1" || rep.mode !== "fresh") throw new InputError(`${name}: the report is not of schema paired-time/1 in mode fresh.`);
    if (rep.base !== BASE_ARM || !rep.arms.includes(aaId(BASE_ARM))) throw new InputError(`${name}: the report has no base ${BASE_ARM} or no A/A arm.`);
  }
}

/** This function gives the first candidate of the last run of slower candidates, or `null` when the last candidate with a time is not slower. */
function heldOf(rows: readonly BisectRow[]): string | null {
  let held: string | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i]!.verdict;
    if (v === "not measured") continue;
    if (v !== "slower") break;
    held = rows[i]!.commit;
  }
  return held;
}

/** This function gives the result of one router from the rows of the candidates, in the order, and the A/A spread. */
export function routerResult(router: string, rows: readonly BisectRow[], spread: number, aaCount: number, base: string): RouterResult {
  const at = rows.findIndex((r) => r.verdict === "slower");
  let before: string | null = null;
  let unmeasured = 0;
  if (at >= 0) {
    before = base;
    for (let i = at - 1; i >= 0; i--) {
      if (rows[i]!.verdict !== "not measured") {
        before = rows[i]!.commit;
        break;
      }
      unmeasured++;
    }
  }
  const steps: Step[] = [];
  let from = 1;
  for (const r of rows) {
    if (r.verdict === "not measured" || r.ratio === null) continue;
    if (Math.abs(r.ratio - from) > 2 * spread) steps.push({ commit: r.commit, from, to: r.ratio, delta: r.ratio - from });
    from = r.ratio;
  }
  return { router, spread, aaCount, rows, first: at >= 0 ? rows[at]!.commit : null, before, unmeasured, held: heldOf(rows), steps };
}

/**
 * This function joins the records of the jobs, and gives the ratio and the verdict of each candidate for each router.
 *
 * - The records must agree on the head, the base, the plan and the order. Else the function throws an `InputError`.
 * - A job with no record goes in `missing`, and its candidates have no time. Then `complete` is `false`.
 * - The ratio of a candidate comes from the report of its own job. The function does not compare the times of two jobs.
 * - The spread is p90 of |r - 1| over the A/A ratios of each round of each job. A ratio outside 1 ± spread leaves the band of the base.
 */
export function joinShards(records: readonly ShardRecord[], shards: number = BISECT_SHARDS): BisectRecord {
  checkRecords(records, shards);
  const sorted = [...records].sort((a, b) => a.shard - b.shard);
  const first = sorted[0]!;
  const byCommit = new Map<string, ShardRecord>();
  for (const r of sorted) for (const c of r.commits) byCommit.set(c, r);
  const skipped = sorted.flatMap((r) => r.skipped);
  const skippedSet = new Set(skipped.map((s) => s.commit));
  const routers = first.routers.map((router): RouterResult => {
    const bands = new Map<number, number[]>(sorted.filter((r) => r.report !== null).map((r) => [r.shard, aaRounds(r.report!, router)]));
    const all = [...bands.values()].flat();
    const spread = aaSpread(all);
    const rows = first.order.map((c, index): BisectRow => {
      const rec = byCommit.get(c.commit);
      const input = rec?.report?.inputs.find((i) => i.id === router);
      const own = bands.get(rec?.shard ?? 0) ?? [];
      const ratio = skippedSet.has(c.commit) ? undefined : input?.ratio[c.commit];
      const r = ratio === undefined ? null : ratio;
      return {
        index,
        commit: c.commit,
        subject: c.subject,
        shard: rec?.shard ?? null,
        cpu: rec?.env.cpu ?? null,
        ratio: r,
        band: own.length === 0 ? null : { lo: Math.min(...own), hi: Math.max(...own) },
        baseMs: input?.median[BASE_ARM] ?? null,
        commitMs: r === null ? null : (input?.median[c.commit] ?? null),
        verdict: classify(r, spread),
      };
    });
    return routerResult(router, rows, spread, all.length, first.base);
  });
  const got = new Set(sorted.map((r) => r.shard));
  const missing = Array.from({ length: shards }, (_, i) => i + 1).filter((s) => !got.has(s));
  return {
    schema: RECORD_SCHEMA,
    head: first.head,
    base: first.base,
    fixture: first.fixture,
    rounds: first.rounds,
    candidates: first.order.length,
    shards: sorted.map((r) => ({ shard: r.shard, cpu: r.env.cpu, cores: r.env.cores, mode: r.env.mode, commits: r.commits.length, skipped: r.skipped.length })),
    missing,
    skipped,
    routers,
    complete: missing.length === 0 && routers.every((x) => x.rows.every((r) => r.verdict !== "not measured")),
  };
}

const fmt = (x: number | null, d = 3): string => (x === null ? "-" : Number.isFinite(x) ? x.toFixed(d) : String(x));
const short = (commit: string | null): string => (commit === null ? "-" : commit.slice(0, 7));
/** This function writes a time in ms, or in s above 10 s. */
const time = (ms: number | null): string => (ms === null || !Number.isFinite(ms) ? "-" : ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toFixed(1)} ms`);
/** This function gives a count and its noun, for example "1 candidate" or "2 candidates". */
const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
/** This function keeps a subject in one cell of a table. */
const cell = (text: string): string => text.replace(/\|/g, "/");

/** This function gives the lines of the finding of one router. */
function findingText(j: BisectRecord, x: RouterResult): string[] {
  const subjectOf = (commit: string | null): string => x.rows.find((r) => r.commit === commit)?.subject ?? "";
  const ratioOf = (commit: string | null): number | null => x.rows.find((r) => r.commit === commit)?.ratio ?? null;
  const lines = [`## \`${x.router}\``, "", `- The A/A spread is ${fmt(x.spread)}, from ${x.aaCount} A/A ratios. The band of the base is ${fmt(1 - x.spread)} to ${fmt(1 + x.spread)}.`];
  if (x.first === null) lines.push("- No candidate is slower than the band of the base.");
  else {
    lines.push(`- The first candidate above the band of the base is \`${short(x.first)}\` (${subjectOf(x.first)}), with the ratio ${fmt(ratioOf(x.first))}.`);
    const after = x.before === j.base ? "the base" : `\`${short(x.before)}\``;
    if (x.unmeasured > 0) lines.push(`- ${count(x.unmeasured, "candidate", "candidates")} between ${after} and \`${short(x.first)}\` ${x.unmeasured === 1 ? "has" : "have"} no time. The change is in ${x.unmeasured === 1 ? "it" : "one of them"}, or in \`${short(x.first)}\`.`);
  }
  if (x.held === null) lines.push("- The last candidate with a time is not slower than the band of the base.");
  else if (x.held !== x.first) lines.push(`- From \`${short(x.held)}\` (${subjectOf(x.held)}), each candidate with a time is above the band of the base.`);
  else lines.push(`- From \`${short(x.held)}\`, each candidate with a time is above the band of the base.`);
  if (x.steps.length === 0) lines.push("- No change between two neighbors is larger than 2 times the spread.");
  else {
    lines.push(`- The changes between two neighbors that are larger than 2 times the spread (${fmt(2 * x.spread)}):`);
    for (const s of x.steps) lines.push(`  - \`${short(s.commit)}\` (${subjectOf(s.commit)}): from ${fmt(s.from)} to ${fmt(s.to)}.`);
  }
  lines.push(
    "",
    "| # | commit | subject | job | ratio | A/A band of the job | base | commit time | verdict |",
    "|---:|---|---|---:|---:|---|---:|---:|---|",
    ...x.rows.map((r) => `| ${r.index + 1} | \`${short(r.commit)}\` | ${cell(r.subject)} | ${r.shard ?? "-"} | ${fmt(r.ratio)} | ${r.band === null ? "-" : `${fmt(r.band.lo)} to ${fmt(r.band.hi)}`} | ${time(r.baseMs)} | ${time(r.commitMs)} | ${r.verdict} |`),
    "",
  );
  return lines;
}

/** This function gives the Markdown text of the record of one job: the A/A ratios and the ratio of each candidate, for each router. */
export function shardText(r: ShardRecord): string[] {
  const lines = [`# Sections bisect, job ${r.shard} of ${r.shards}`, "", `The computer: ${r.env.cores} x ${r.env.cpu}, mode \`${r.env.mode}\`. The rounds: ${r.rounds}.`, ""];
  for (const s of r.skipped) lines.push(`- The job skipped \`${short(s.commit)}\`: ${s.reason}`);
  if (r.report === null) return [...lines, "The job timed no candidate."];
  const subjects = new Map(r.order.map((c) => [c.commit, c.subject]));
  for (const router of r.routers) {
    const input = r.report.inputs.find((i) => i.id === router);
    lines.push(`## \`${router}\``, "", `The A/A ratios of the rounds: ${aaRounds(r.report, router).map((x) => fmt(x)).join(", ")}. The base takes ${time(input?.median[BASE_ARM] ?? null)}.`, "");
    lines.push("| commit | subject | ratio | commit time |", "|---|---|---:|---:|");
    for (const c of r.commits) lines.push(`| \`${short(c)}\` | ${cell(subjects.get(c) ?? "")} | ${fmt(input?.ratio[c] ?? null)} | ${time(input?.median[c] ?? null)} |`);
    lines.push("");
  }
  return lines;
}

/** This function gives the Markdown text of a joined record: the plan, the finding of each router, its table and the computer of each job. */
export function bisectText(j: BisectRecord): string[] {
  const lines = [
    "# The bisect of the sections routers (SECTIONS-SLOW)",
    "",
    `The base is the core of \`${BASE_REF}\` (\`${short(j.base)}\`). The head of the run is \`${short(j.head)}\`.`,
    `The candidates are the ${j.candidates} commits from \`${FIX_COMMIT}\` to the head that change \`packages/core/src\`, the oldest first.`,
    `Each job times the base, its candidates and the A/A arm on the fixture \`${j.fixture}\` of the base, with 10 000 nodes.`,
    `Each route has its own fresh process. Each arm has ${j.rounds} rounds, and in each round the arms take turns.`,
    "",
    "A ratio is the median time of a candidate over the median time of the base in the same job. Above 1, the candidate is slower.",
    "The A/A spread is p90 of |r - 1| over the A/A ratios of each round of each job.",
    "A ratio outside 1 ± the spread leaves the band of the base.",
    "",
  ];
  if (!j.complete) {
    lines.push("**The record is not complete.**");
    if (j.missing.length > 0) lines.push(`${j.missing.length === 1 ? "The job" : "The jobs"} ${j.missing.join(", ")} ${j.missing.length === 1 ? "has" : "have"} no record.`);
    for (const s of j.skipped) lines.push(`- The job skipped \`${short(s.commit)}\`: ${s.reason}`);
    lines.push("");
  }
  for (const x of j.routers) lines.push(...findingText(j, x));
  lines.push("The computer of each job:", "", ...j.shards.map((s) => `- Job ${s.shard}: ${s.cores} x ${s.cpu}, mode \`${s.mode}\`, ${s.commits} candidates, ${s.skipped} skipped.`));
  return lines;
}
