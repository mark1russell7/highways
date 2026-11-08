// The verdict over families of a screen (SCREEN-WEIGHT): `node scripts/screen-verdict.ts <screen.jsonl> [--default <base>] [--json <out.json>] [--all-json <out.json>] [--snapshot] [--check <snapshot>] [--measures <names>]`.
// The option `--measures` takes a comma list of measure names of a record, for example the named wins of an idea. They replace the guard measures.
// It reads the records of one artifact of the workflow `Screen`. For each strategy of the step against the default, it gives the verdict of each guard measure.
// The rows of a snapshot are the built-in strategies of the step at the checkout, without the base (VERDICT-RUN). The option `--all-json` writes the rows of each strategy of the records.
// The default base of a step is in `STEP_BASE`. The option `--default` changes it.
// The option `--check` reads the rows of a snapshot again from these records. A label that moved or a row that is missing gives the exit code 1.
// The guard measures are the measures of the step in `docs/PROMOTION.md`. The tie is the `minEffect` of the measure, and the level is 0.05.
// The script also gives the old verdict: the mean of the inputs, as the screen gives it today.
// It gives the power of the sign test: the least count of families on one side that passes at the level. Each set works, also `screen-v3` with 15 families.
// The option `--snapshot` writes the verdict snapshot `docs/research/verdicts/<set>-<step>.json` that the site reads (SITE-LIVE).
// The header of a snapshot has the run of the artifact (`--run`), the commit of the records (`--commit`), the date (`--date`) and the core version (`--core`).
// With no option, the run and the commit come from the path of the artifact, `<run>/screen-<set>-<step>-...-<sha>/screen.jsonl`.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compareMeasure, familyOf, verdict, type FamilyVerdict, type VerdictLabel, type VerdictResult } from "@mark1russell7/layout-contract";
import { writeGateLine } from "@mark1russell7/rigor-bench";
import { overlapLimitRows, type OverlapLimitRow } from "../src/bench/measures/overlap.ts";
import { parseLines, passThroughs, type LayoutRecord } from "../src/bench/screen/forms.ts";
import { measureByName, withoutMixedKinds } from "../src/bench/screen/measures.ts";
import { familyCell, SCREEN_FAMILY_BY, signTestPower } from "../src/bench/screen/set.ts";
import { STRATEGIES } from "../src/strategies/builtins.ts";
import { listStrategies, type Step } from "../src/strategies/model.ts";
import { droppedLine } from "./gates/lines.ts";
import { requireGrid } from "./gates/inputs.ts";

/** The significance level of each verdict. */
const LEVEL = 0.05;

/** The steps that the workflow `Screen` gives a verdict for. A test pins this list against the condition of the step in `screen.yml`. */
export const VERDICT_STEPS: readonly string[] = ["router", "highway", "plugs", "levels", "whole"];

/** The default base of each step. The committed snapshots of `docs/research/verdicts` use these bases. */
export const STEP_BASE: Readonly<Record<string, string>> = { router: "shared", highway: "shared", plugs: "facing", levels: "depths", whole: "pipeline" };

/**
 * This function gives the strategies of a snapshot: the strategies of the records that are built-in strategies of the step, without the base.
 * The sequence is the sequence of the records. An opt-in strategy of the screen is only in the rows of `--all-json`.
 * On the 15 snapshots of 2026-11, this rule with the built-in strategies at the commit of each snapshot gives their 1,137 rows exactly.
 */
export function snapshotStrategies(inRecords: readonly string[], builtIn: readonly string[], base: string): string[] {
  const keep = new Set(builtIn);
  return [...new Set(inRecords)].filter((s) => s !== base && keep.has(s));
}

/** One row of a snapshot, as `--check` compares it. */
export interface CheckRow {
  readonly strategy: string;
  readonly guard: string;
  readonly label: string;
}

/** The result of `--check` has a line for each moved label and each missing row. It has a note for each row that the snapshot does not have. */
export interface CheckResult {
  readonly moved: readonly string[];
  readonly missing: readonly string[];
  readonly added: readonly string[];
}

/** This function compares the rows of a snapshot with the rows of a new read of the same records. The rows have the key (strategy, guard). */
export function checkRows(stored: readonly CheckRow[], fresh: readonly CheckRow[]): CheckResult {
  const key = (r: CheckRow): string => `${r.strategy} ${r.guard}`;
  const now = new Map(fresh.map((r) => [key(r), r.label]));
  const was = new Set(stored.map(key));
  const moved: string[] = [];
  const missing: string[] = [];
  for (const r of stored) {
    const label = now.get(key(r));
    if (label === undefined) missing.push(`${key(r)}: the row is missing`);
    else if (label !== r.label) moved.push(`${key(r)}: the label moved from "${r.label}" to "${label}"`);
  }
  const added = fresh.filter((r) => !was.has(key(r))).map((r) => `${key(r)}: a row that the snapshot does not have`);
  return { moved, missing, added };
}

/** The guard measures of the step `router`, by their names in a record. */
const ROUTER_GUARDS: readonly { readonly id: string; readonly name: string }[] = [
  { id: "R1", name: "route.crossings" },
  { id: "R4", name: "route.turn.mean" },
  { id: "R5 q0.95", name: "route.detour.q95" },
  { id: "R11 min", name: "route.plug-spacing.min" },
  { id: "B1", name: "route.bundle.ink-saved" },
];

/**
 * The guard measures of each step of `docs/PROMOTION.md`, by their names in a record.
 * A guard with a quantile or a limit, for example `R5` q0.95, uses the measure of that quantile or limit of each input.
 * The steps `plugs`, `levels` and `whole` run as routers in the screen, so they use the guards of the step `router`.
 */
const GUARDS: Readonly<Record<string, readonly { readonly id: string; readonly name: string }[]>> = {
  router: ROUTER_GUARDS,
  plugs: ROUTER_GUARDS,
  levels: ROUTER_GUARDS,
  whole: ROUTER_GUARDS,
  highway: [
    { id: "R1", name: "route.crossings" },
    { id: "B1", name: "route.bundle.ink-saved" },
    { id: "B3 q0.95", name: "route.bundle.stretch.q95" },
    { id: "B6 max", name: "route.bundle.merge-angle.max" },
  ],
};

/** The breadth of a verdict: the families against its side, all the families and the ties. Version 0.2.12 of the contract gives it in the result. */
interface Breadth {
  readonly against: number;
  readonly of: number;
  readonly ties: number;
}

/** One verdict of a strategy on a guard measure. */
interface GuardVerdict {
  readonly strategy: string;
  readonly guard: string;
  readonly measure: string;
  readonly label: VerdictLabel;
  /** The sign of the mean of the inputs with the tie: the old verdict of the screen. */
  readonly old: "better" | "worse" | "tie";
  readonly stratified: number;
  readonly pooled: number;
  readonly p: number;
  readonly families: readonly FamilyVerdict[];
  readonly breadth: Breadth;
  /** The absolute count of the pass-throughs of the strategy over its records. A snapshot from before PASS-GRID has no such field. */
  readonly through: number;
  /** The absolute count of the pass-throughs of the base over its records. */
  readonly baseThrough: number;
}

/** This function gives the breadth of a verdict from its families, with the rule of `docs/VERDICT.md` of the contract. */
function breadthOf(v: VerdictResult): Breadth {
  const own = (v as { readonly breadth?: Breadth }).breadth;
  if (own !== undefined) return own;
  const side = v.label === "better" ? 1 : v.label === "worse" ? -1 : Math.sign(v.stratified.mean);
  const ties = v.families.filter((f) => f.sign === 0).length;
  return { against: side === 0 ? 0 : v.families.filter((f) => f.sign === -side).length, of: v.families.length, ties };
}

/** This function gives the family of a record from its input id `<set>/<family>/s<seed>`, with the key `familyBy` of the manifest. */
function familyOfRecord(r: LayoutRecord): string {
  const family = r.input.split("/")[1];
  if (family === undefined) throw new Error(`The input id "${r.input}" has no family.`);
  return familyOf(familyCell({ family }), SCREEN_FAMILY_BY);
}

const mean = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0) / values.length;

/** This function gives the step of a screen. The screen of the step `highway` also has the records of the base routers, so a step other than `router` wins. */
function stepOf(records: readonly LayoutRecord[]): string {
  const steps = new Set(records.map((r) => r.step));
  return [...steps].find((s) => s !== "router") ?? "router";
}

/** The titles of the check lines that the script wrote. */
const written = new Set<string>();

/** This function gives the verdicts of each strategy in `strategies` against the strategy `base`, on each guard measure of the step. */
function screenVerdicts(records: readonly LayoutRecord[], base: string, strategies: readonly string[], measures?: readonly string[]): GuardVerdict[] {
  const step = stepOf(records);
  const guards = measures === undefined ? GUARDS[step] : measures.map((name) => ({ id: name, name }));
  if (guards === undefined) throw new Error(`The step "${step}" has no guard measures in this script.`);
  const out: GuardVerdict[] = [];
  for (const strategy of strategies) {
    const pair = records.filter((r) => r.strategy === strategy || r.strategy === base);
    for (const guard of guards) {
      const info = measureByName(guard.name);
      if (info === undefined) throw new Error(`The measure ${guard.name} is not in MEASURES.`);
      const tie = info.minEffect ?? 0;
      // A verdict does not pair an estimate from a sample with a full count (BENCH-PAIRS-HEAP).
      const kept = withoutMixedKinds(pair, info);
      // A drop of a value is a "no read" of its input and seed, so the check line names it (NO-READ-LINE).
      // The verdict only reports, so the line is a warning. The script reads a pair two times with `--all-json`, so it writes each line one time.
      const line = droppedLine(pair, kept, guard.name, `Screen verdict ${strategy} on ${guard.name}`);
      if (line !== undefined && !written.has(line.title)) {
        written.add(line.title);
        writeGateLine(line, { log: (l) => console.error(l) });
      }
      const v = verdict(kept, { by: "family", family: familyOfRecord, measure: { id: guard.name, direction: info.better }, a: base, b: strategy, tie, level: LEVEL });
      const values = (s: string): number[] => kept.filter((r) => r.strategy === s && r.skipped === undefined && r.measures[guard.name] !== undefined).map((r) => r.measures[guard.name]!);
      const old = compareMeasure(mean(values(strategy)), mean(values(base)), { direction: info.better, minEffect: tie });
      out.push({ strategy, guard: guard.id, measure: guard.name, label: v.label, old, stratified: v.stratified.mean, pooled: v.pooled.mean, p: v.permutation.p, families: v.families, breadth: breadthOf(v), through: passThroughs(pair, strategy), baseThrough: passThroughs(pair, base) });
    }
  }
  return out;
}

/** The header of a verdict snapshot. The rows follow it. */
interface SnapshotHeader {
  readonly set: string | undefined;
  readonly step: string;
  readonly base: string;
  readonly level: number;
  /** The id of the run of the workflow `Screen` that gave the records. */
  readonly run: number | null;
  /** The commit of the records. */
  readonly commit: string | null;
  /** The date of the run, `YYYY-MM-DD`. */
  readonly date: string;
  /** The version of `@mark1russell7/highways` at the commit of the records. */
  readonly core: string;
  /** The commit of the checkout that ran this script, or null outside git. A snapshot from before VERDICT-RUN has no such field. */
  readonly script: string | null;
}

/** This function gives the JSON text of a snapshot, with one row on each line. Thus a diff shows each changed verdict. */
function snapshotText(header: SnapshotHeader, rows: readonly GuardVerdict[], limits: readonly OverlapLimitRow[]): string {
  const head = JSON.stringify(header, null, 2).replace(/\n}$/, ",");
  const list = (key: string, items: readonly unknown[]): string => `  "${key}": [\n${items.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]`;
  // A snapshot with no router without lanes keeps its old form.
  return `${head}\n${[list("rows", rows), ...(limits.length > 0 ? [list("limits", limits)] : [])].join(",\n")}\n}\n`;
}

/** This function gives the run id and the commit from the path of an artifact that `gh run download <run> -D <dir>/<run>` wrote. */
function fromPath(file: string): { readonly run: number | null; readonly commit: string | null } {
  const parts = file.split(/[\\/]/);
  const run = parts.map((p) => /^(\d{8,})$/.exec(p)?.[1]).filter((p) => p !== undefined).pop();
  const commit = parts.map((p) => /-([0-9a-f]{40})$/.exec(p)?.[1]).filter((p) => p !== undefined).pop();
  return { run: run === undefined ? null : Number(run), commit: commit ?? null };
}

/** This function gives the commit of the checkout, or null outside git. */
function headCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const SIGN = { 1: "+", 0: "0", [-1]: "−" } as const;
const f3 = (v: number): string => (Math.abs(v) < 5e-4 ? "0" : v.toFixed(3));

function main(): void {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const file = args[0];
  if (file === undefined || file.startsWith("--")) {
    console.error(
      "Usage: node scripts/screen-verdict.ts <screen.jsonl> [--default <base>] [--json <out.json>] [--all-json <out.json>] [--snapshot] [--check <snapshot>] [--measures <names>] [--run <id>] [--commit <sha>] [--date <YYYY-MM-DD>] [--core <version>]",
    );
    process.exit(2);
  }
  const records = parseLines<LayoutRecord>(readFileSync(file, "utf8"));
  // FAIL-CLOSED: a verdict needs records, and each strategy needs a record on each input. A file of a failed run holds fewer.
  requireGrid(`screen-verdict ${file}`, records);
  const step = stepOf(records);
  const checkFile = opt("--check");
  const stored = checkFile === undefined ? undefined : (JSON.parse(readFileSync(checkFile, "utf8")) as { readonly base: string; readonly rows: readonly CheckRow[] });
  const base = opt("--default") ?? stored?.base ?? STEP_BASE[step] ?? "shared";
  const measures = opt("--measures")?.split(",").filter((m) => m.length > 0);
  const inRecords = records.filter((r) => r.step === step).map((r) => r.strategy);
  // A check reads the strategies of the snapshot, so a built-in strategy that was added or removed later does not move a row.
  const strategies =
    stored !== undefined
      ? [...new Set(stored.rows.map((r) => r.strategy))]
      : snapshotStrategies(inRecords, listStrategies(STRATEGIES, step as Step).map((s) => s.name), base);
  const rows = screenVerdicts(records, base, strategies.filter((s) => inRecords.includes(s)), measures);
  if (stored !== undefined) {
    const result = checkRows(stored.rows, rows);
    for (const line of [...result.moved, ...result.missing]) console.log(line);
    for (const line of result.added) console.log(`note: ${line}`);
    const bad = result.moved.length + result.missing.length;
    console.log(bad === 0 ? `The labels hold: ${stored.rows.length} rows of ${checkFile}.` : `The check fails: ${result.moved.length} moved and ${result.missing.length} missing of ${stored.rows.length} rows of ${checkFile}.`);
    if (bad > 0) process.exitCode = 1;
    return;
  }
  const limits = overlapLimitRows(records, (input) => familyOfRecord({ input } as LayoutRecord));
  const set = records[0]?.set;
  const path = fromPath(file);
  const run = opt("--run");
  const header: SnapshotHeader = {
    set,
    step,
    base,
    level: LEVEL,
    run: run === undefined ? path.run : Number(run),
    commit: opt("--commit") ?? path.commit ?? headCommit(),
    date: opt("--date") ?? new Date().toISOString().slice(0, 10),
    core: opt("--core") ?? (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version,
    script: headCommit(),
  };
  const snapshot = args.includes("--snapshot") ? fileURLToPath(new URL(`../../../docs/research/verdicts/${set}-${step}.json`, import.meta.url)) : undefined;
  for (const out of [opt("--json"), snapshot]) if (out !== undefined) writeFileSync(out, snapshotText(header, rows, limits));
  const allOut = opt("--all-json");
  if (allOut !== undefined) {
    const all = [...new Set(inRecords)].filter((s) => s !== base);
    writeFileSync(allOut, snapshotText(header, screenVerdicts(records, base, all, measures), limits));
  }
  for (const l of limits) console.log(`${l.strategy} ${l.guard}: ${l.label}, rise over ${l.base} ${f3(l.worst)} at most ${l.limit}, ${l.over} of ${l.of} inputs over, worst ${l.worstInput}`);
  const families = rows[0]?.families.map((f) => f.family) ?? [];
  console.log(`## The verdicts of the step \`${step}\` on \`${records[0]?.set}\` against \`${base}\`\n`);
  console.log(`The level is ${LEVEL}. The families: ${families.map((f) => `\`${f}\``).join(", ")}. A positive mean tells that the strategy is better.\n`);
  const power = signTestPower(families.length, LEVEL);
  console.log(
    power === undefined
      ? `The sign test over ${families.length} families passes at no count. It needs 6 families or more at the level ${LEVEL}.\n`
      : `The sign test over ${families.length} families passes at ${power} of ${families.length} families or more on one side, with no ties, at the level ${LEVEL}.\n`,
  );
  console.log("The columns `through` and `base through` are absolute counts of the breaks of `no-pass-through` over the records. A verdict does not show them.\n");
  console.log("| strategy | guard | label | old | stratified | pooled | p | family signs | against | through | base through |");
  console.log("|---|---|---|---|---:|---:|---:|---|---:|---:|---:|");
  for (const r of rows) {
    const signs = r.families.map((f) => SIGN[f.sign]).join(" ");
    const against = `${r.breadth.against} of ${r.breadth.of}${r.breadth.ties > 0 ? ` (${r.breadth.ties} ${r.breadth.ties === 1 ? "tie" : "ties"})` : ""}`;
    console.log(`| ${r.strategy} | ${r.guard} | ${r.label} | ${r.old} | ${f3(r.stratified)} | ${f3(r.pooled)} | ${r.p.toFixed(4)} | ${signs} | ${against} | ${r.through} | ${r.baseThrough} |`);
  }
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
