// The command line of the oracle bound (ORACLE): `pnpm oracle --exact <path,...> --screen <path,...> [--out oracle.md] [--json oracle.json]`.
// The script reads the records of the workflow `Screen` (files `screen.jsonl`, or folders that hold them) and writes the tables of `docs/research/ORACLE.md`.
// The oracle of an input is the best strategy of the whole portfolio on that input. The script compares it with the best single strategy.
// The script reads only records, so it runs locally in a few seconds. The screens themselves run in CI.
// The test `src/bench/screen/oracle.test.ts` examines the functions of this file on a small set of records.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { quantile } from "../src/bench/measures/stats.ts";
import { GAP_BOOTSTRAP, type BootstrapMedian } from "../src/bench/screen/gap.ts";
import { mulberry32, RECORD_EPS } from "../src/bench/screen/hash.ts";
import { MEASURES } from "../src/bench/screen/measures.ts";
import { SCREEN_SETS } from "../src/bench/screen/set.ts";

/** The fields of a record of the form `layout-record/1` that the oracle reads. */
export interface OracleRecord {
  readonly strategy: string;
  readonly input: string;
  readonly seed: number;
  readonly skipped?: string;
  readonly measures: Readonly<Record<string, number>>;
  readonly hard?: Readonly<Record<string, number>>;
}

/** The better side of a measure. */
export type Better = "higher" | "lower";

/** A value for each input and each strategy. A missing value is a run without a value of the measure. */
export type ValueTable = ReadonlyMap<string, ReadonlyMap<string, number>>;

/** The name of the ink saved (B1) in a record. */
export const B1 = "route.bundle.ink-saved";
/** The name of the B3 q95 in a record. */
export const B3_Q95 = "route.bundle.stretch.q95";
/** The name of the gap closed (B10) with the rule of each run, in a record of `exact-v1`. */
export const B10 = "route.bundle.gap-closed";
/** The name of the flag of a run with a shared segment that holds edges of two collections. */
export const MIXED = "route.bundle.gap-closed.mixed";

/** This function gives the family of an input id `<set>/<family>/s<seed>`. */
export function familyOf(input: string): string {
  return input.split("/")[1] ?? input;
}

/** This function reads the records of files and folders. A folder gives each `screen.jsonl` in it, at any depth. */
export function readRecords(paths: readonly string[]): OracleRecord[] {
  const files = (p: string): string[] =>
    statSync(p).isDirectory()
      ? readdirSync(p)
          .sort()
          .flatMap((n) => files(join(p, n)))
      : p.endsWith(".jsonl")
        ? [p]
        : [];
  return paths.flatMap(files).flatMap((f) =>
    readFileSync(f, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as OracleRecord),
  );
}

/** This function gives the table of a value over records. The function `value` gives `undefined` for a run without a value. A skipped run has no value. */
export function valueTable(records: readonly OracleRecord[], value: (r: OracleRecord) => number | undefined): Map<string, Map<string, number>> {
  const table = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (!table.has(r.input)) table.set(r.input, new Map());
    if (r.skipped !== undefined) continue;
    const v = value(r);
    if (v !== undefined && Number.isFinite(v)) table.get(r.input)!.set(r.strategy, v);
  }
  return table;
}

/** The best value of one input, and each strategy within `RECORD_EPS` of it. */
export interface OracleCell {
  readonly value: number;
  readonly winners: readonly string[];
}

/** This function tells if `a` is better than `b` on the side `better`. */
const isBetter = (a: number, b: number, better: Better): boolean => (better === "higher" ? a > b : a < b);

/**
 * This function gives the oracle of each input: the best value over the strategies that `keep` accepts.
 * Each strategy within `RECORD_EPS` of the best value is a winner, because a difference of `RECORD_EPS` or less is a tie.
 * An input without a value has no cell.
 */
export function oracle(table: ValueTable, better: Better, keep: (strategy: string, input: string) => boolean = () => true): Map<string, OracleCell> {
  const out = new Map<string, OracleCell>();
  for (const [input, row] of table) {
    let best: number | undefined;
    for (const [s, v] of row) if (keep(s, input) && (best === undefined || isBetter(v, best, better))) best = v;
    if (best === undefined) continue;
    const winners = [...row].filter(([s, v]) => keep(s, input) && Math.abs(v - best) <= RECORD_EPS).map(([s]) => s);
    out.set(input, { value: best, winners: winners.sort() });
  }
  return out;
}

/** The best single strategy: one strategy for each input, with the best median. */
export interface SingleBest {
  readonly strategy: string;
  readonly median: number;
  /** The number of inputs with a value. */
  readonly values: number;
}

/**
 * This function gives the strategy with the best median over the inputs `inputs`. A strategy needs a value on at least `minShare` of the inputs.
 * The function `keep` can refuse a strategy. A tie of medians goes to the first name in the sort order.
 */
export function bestSingle(
  table: ValueTable,
  better: Better,
  o: { readonly inputs?: readonly string[]; readonly minShare?: number; readonly keep?: (strategy: string) => boolean } = {},
): SingleBest | undefined {
  const inputs = o.inputs ?? [...table.keys()];
  const names = [...new Set(inputs.flatMap((i) => [...(table.get(i)?.keys() ?? [])]))].sort();
  let best: SingleBest | undefined;
  for (const s of names) {
    if (o.keep && !o.keep(s)) continue;
    const values = inputs.map((i) => table.get(i)?.get(s)).filter((v): v is number => v !== undefined);
    if (values.length === 0 || values.length < (o.minShare ?? 0.5) * inputs.length) continue;
    const median = quantile(values, 0.5);
    if (best === undefined || isBetter(median, best.median, better)) best = { strategy: s, median, values: values.length };
  }
  return best;
}

/** The paired bootstrap of two lists of values on the same inputs: the interval of each median and of the difference of the medians. */
export interface PairedBootstrap {
  readonly a: BootstrapMedian;
  readonly b: BootstrapMedian;
  /** The median of `a` minus the median of `b`, with its interval. */
  readonly diff: BootstrapMedian;
}

/**
 * This function gives the paired bootstrap of `a` and `b`. The value `a[i]` and the value `b[i]` come from the same input.
 * Each sample takes the inputs with replacement from the seed of `GAP_BOOTSTRAP`, and it takes both values of each input.
 */
export function pairedBootstrap(a: readonly number[], b: readonly number[], o: { readonly runs?: number; readonly level?: number; readonly seed?: number } = {}): PairedBootstrap {
  if (a.length !== b.length) throw new Error("The two lists of a paired bootstrap must have the same length.");
  const nan = { median: Number.NaN, lo: Number.NaN, hi: Number.NaN };
  if (a.length === 0) return { a: nan, b: nan, diff: nan };
  const runs = o.runs ?? GAP_BOOTSTRAP.runs;
  const tail = (1 - (o.level ?? GAP_BOOTSTRAP.level)) / 2;
  const r = mulberry32(o.seed ?? GAP_BOOTSTRAP.seed);
  const ma: number[] = [];
  const mb: number[] = [];
  const md: number[] = [];
  const sa = new Array<number>(a.length);
  const sb = new Array<number>(a.length);
  for (let k = 0; k < runs; k++) {
    for (let j = 0; j < a.length; j++) {
      const i = Math.floor(r() * a.length);
      sa[j] = a[i]!;
      sb[j] = b[i]!;
    }
    const x = quantile(sa, 0.5);
    const y = quantile(sb, 0.5);
    ma.push(x);
    mb.push(y);
    md.push(x - y);
  }
  const box = (values: readonly number[], m: number): BootstrapMedian => ({ median: m, lo: quantile(values, tail), hi: quantile(values, 1 - tail) });
  const a50 = quantile(a, 0.5);
  const b50 = quantile(b, 0.5);
  return { a: box(ma, a50), b: box(mb, b50), diff: box(md, a50 - b50) };
}

/** The guarded B1 of a screen: the ratio of B1 to the B1 of the baseline, and the strategies that pass the guard on each input. */
export interface GuardedB1 {
  /** The ratio of B1 to the B1 of the baseline when the run passes the guard, or 1 (the baseline) when it does not. */
  readonly ratio: Map<string, Map<string, number>>;
  /** The strategies that pass the guard on each input. */
  readonly pass: Map<string, Set<string>>;
}

/**
 * This function gives the guarded B1 of records. A run passes the guard when its B3 q95 is at most the B3 q95 of the baseline on the same input.
 * A difference of `RECORD_EPS` or less is a tie, so it passes. With `hard`, each hard count of the run must also be at most the count of the baseline.
 * A run that does not pass falls back to the baseline: its ratio is 1. An input where the baseline has a B1 of 0 has no ratio.
 */
export function guardedB1(records: readonly OracleRecord[], o: { readonly base?: string; readonly hard?: boolean } = {}): GuardedB1 {
  const base = o.base ?? "shared";
  const bases = new Map(records.filter((r) => r.strategy === base && r.skipped === undefined).map((r) => [r.input, r]));
  const ratio = new Map<string, Map<string, number>>();
  const pass = new Map<string, Set<string>>();
  for (const r of records) {
    const b = bases.get(r.input);
    if (b === undefined || r.skipped !== undefined) continue;
    const b1 = r.measures[B1];
    const base1 = b.measures[B1];
    const q = r.measures[B3_Q95];
    const bq = b.measures[B3_Q95];
    if (b1 === undefined || base1 === undefined || !(base1 > 0) || q === undefined || bq === undefined) continue;
    let ok = q <= bq + RECORD_EPS;
    if (ok && o.hard) for (const [rule, n] of Object.entries(r.hard ?? {})) if (n > (b.hard?.[rule] ?? 0)) ok = false;
    if (!ratio.has(r.input)) ratio.set(r.input, new Map());
    if (!pass.has(r.input)) pass.set(r.input, new Set());
    ratio.get(r.input)!.set(r.strategy, ok ? b1 / base1 : 1);
    if (ok) pass.get(r.input)!.add(r.strategy);
  }
  return { ratio, pass };
}

/** One split of a realistic selector: it chooses a strategy for each group on the inputs `train` and tests the choice on the inputs `test`. */
export interface Fold {
  readonly name: string;
  readonly groups: readonly { readonly group: string; readonly train: readonly string[]; readonly test: readonly string[] }[];
}

/** The result of one split of a realistic selector. */
export interface FoldResult {
  readonly name: string;
  /** The choice of each group. */
  readonly choices: Readonly<Record<string, string>>;
  /** The test inputs with a value of the selector, the best single strategy and the oracle. */
  readonly inputs: number;
  /** The test inputs without a value of the choice. */
  readonly missing: number;
  /** The medians over the test inputs. */
  readonly selector: number;
  readonly single: number;
  readonly oracle: number;
  /** The gain of the selector over the best single strategy, as a share of the gain of the oracle. It is `NaN` when the oracle gains nothing. */
  readonly share: number;
  /** The values of the test inputs, in the same order: the selector, the best single strategy and the oracle. */
  readonly values: { readonly selector: readonly number[]; readonly single: readonly number[]; readonly oracle: readonly number[] };
}

/** This function gives the share of the oracle gain that a selector keeps, from medians. It is `NaN` when the oracle gains `RECORD_EPS` or less. */
export function gainShare(selector: number, single: number, oracleMedian: number): number {
  const gain = oracleMedian - single;
  return Math.abs(gain) <= RECORD_EPS ? Number.NaN : (selector - single) / gain;
}

/** This function gives the share of the oracle gain over the test inputs of all splits together. Each input of a set of complete splits is a test input once. */
export function pooledShare(fits: readonly FoldResult[]): { readonly inputs: number; readonly selector: number; readonly single: number; readonly oracle: number; readonly share: number } {
  const all = (k: "selector" | "single" | "oracle"): number[] => fits.flatMap((f) => f.values[k]);
  const [selector, single, oracleMedian] = (["selector", "single", "oracle"] as const).map((k) => quantile(all(k), 0.5)) as [number, number, number];
  return { inputs: all("selector").length, selector, single, oracle: oracleMedian, share: gainShare(selector, single, oracleMedian) };
}

/**
 * This function tests a realistic selector. For each split and group, it chooses the best single strategy on the train inputs, with `bestSingle`.
 * On the test inputs, it compares the value of the choice with the value of the strategy `single` and with the oracle.
 */
export function crossFit(table: ValueTable, better: Better, folds: readonly Fold[], single: string, oracleCells: ReadonlyMap<string, OracleCell>): FoldResult[] {
  return folds.map((fold) => {
    const choices: Record<string, string> = {};
    const sel: number[] = [];
    const one: number[] = [];
    const orc: number[] = [];
    let missing = 0;
    for (const g of fold.groups) {
      const choice = bestSingle(table, better, { inputs: g.train })?.strategy;
      if (choice === undefined) continue;
      choices[g.group] = choice;
      for (const i of g.test) {
        const v = table.get(i)?.get(choice);
        const s = table.get(i)?.get(single);
        const o = oracleCells.get(i)?.value;
        if (v === undefined) missing++;
        if (v === undefined || s === undefined || o === undefined) continue;
        sel.push(v);
        one.push(s);
        orc.push(o);
      }
    }
    const [selector, s1, oracleMedian] = [sel, one, orc].map((x) => quantile(x, 0.5)) as [number, number, number];
    const share = gainShare(selector, s1, oracleMedian);
    return { name: fold.name, choices, inputs: sel.length, missing, selector, single: s1, oracle: oracleMedian, share, values: { selector: sel, single: one, oracle: orc } };
  });
}

/** The count of the inputs where a strategy is a winner of the oracle, and where it is the only winner. */
export interface WinnerCount {
  readonly strategy: string;
  readonly wins: number;
  readonly sole: number;
  readonly inputs: readonly string[];
}

/** This function counts the wins of each strategy in the oracle cells, from most to fewest. A tie gives a win to each winner. */
export function winnerCounts(cells: ReadonlyMap<string, OracleCell>): WinnerCount[] {
  const m = new Map<string, { wins: number; sole: number; inputs: string[] }>();
  for (const [input, c] of cells)
    for (const s of c.winners) {
      const e = m.get(s) ?? { wins: 0, sole: 0, inputs: [] };
      e.wins++;
      if (c.winners.length === 1) e.sole++;
      e.inputs.push(input);
      m.set(s, e);
    }
  return [...m]
    .map(([strategy, e]) => ({ strategy, ...e }))
    .sort((a, b) => b.wins - a.wins || b.sole - a.sole || (a.strategy < b.strategy ? -1 : 1));
}

/** One row of the table of each measure: the best single strategy, its median, the median of the oracle and their ratio. */
export interface MeasureRow {
  readonly measure: string;
  readonly id: string;
  readonly better: Better;
  readonly single: string;
  readonly singleMedian: number;
  readonly oracleMedian: number;
  /** The median of the oracle divided by the median of the best single strategy. It is `NaN` when the median of the strategy is 0. */
  readonly ratio: number;
}

/** This function gives the row of each measure of `MEASURES` that the records have, without a guard. A strategy needs a value on each input. */
export function measureRows(records: readonly OracleRecord[]): MeasureRow[] {
  const names = new Set(records.flatMap((r) => Object.keys(r.measures)));
  const rows: MeasureRow[] = [];
  for (const m of MEASURES) {
    if (!names.has(m.name)) continue;
    const table = valueTable(records, (r) => r.measures[m.name]);
    const single = bestSingle(table, m.better, { minShare: 1 });
    if (single === undefined) continue;
    const cells = oracle(table, m.better);
    const oracleMedian = quantile(
      [...cells.values()].map((c) => c.value),
      0.5,
    );
    const ratio = single.median === 0 ? Number.NaN : oracleMedian / single.median;
    rows.push({ measure: m.name, id: m.id, better: m.better, single: single.strategy, singleMedian: single.median, oracleMedian, ratio });
  }
  return rows;
}

/** The features of an input that the note compares with the winners. */
export interface InputFeatures {
  readonly input: string;
  readonly family: string;
  readonly nodes: number;
  readonly edges: number;
  readonly edgeShape: string;
  /** The share of the edge ends at a fixed plug: a plug with a place `at`. */
  readonly fixedShare: number;
  /** The number of collections of the edges. */
  readonly collections: number;
}

/** This function gives the features of each input of a screen set, from its generators. */
export function inputFeatures(setId: string): InputFeatures[] {
  const set = SCREEN_SETS[setId];
  if (set === undefined) throw new Error(`There is no screen set "${setId}".`);
  return set.families.flatMap((f) =>
    Array.from({ length: f.seeds }, (_, k) => {
      const g = f.make(k);
      const fixed = new Map(g.nodes.map((n) => [n.id, new Set((n.ports ?? []).filter((p) => p.at !== undefined).map((p) => p.id))]));
      const ends = g.edges.flatMap((e) => [e.source, e.target]);
      const fixedEnds = ends.filter((e) => e.port !== undefined && fixed.get(e.node)?.has(e.port)).length;
      const collections = new Set(g.edges.map((e) => e.data?.["collection"]).filter((c) => typeof c === "string")).size;
      return {
        input: `${set.id}/${f.name}/s${k}`,
        family: f.name,
        nodes: g.nodes.length,
        edges: g.edges.length,
        edgeShape: String(f.cell.edgeShape ?? "-"),
        fixedShare: ends.length === 0 ? 0 : fixedEnds / ends.length,
        collections,
      };
    }),
  );
}

/** This function gives the folds of a selector that chooses for each family: the first half of the seeds and the second half, in both directions. */
export function halfFolds(inputs: readonly string[], seedOf: (input: string) => number): Fold[] {
  const families = [...new Set(inputs.map(familyOf))];
  const halves = families.map((family) => {
    const mine = inputs.filter((i) => familyOf(i) === family).sort((a, b) => seedOf(a) - seedOf(b));
    const cut = Math.ceil(mine.length / 2);
    return { family, a: mine.slice(0, cut), b: mine.slice(cut) };
  });
  return [
    { name: "first half to second half", groups: halves.filter((h) => h.b.length > 0).map((h) => ({ group: h.family, train: h.a, test: h.b })) },
    { name: "second half to first half", groups: halves.filter((h) => h.b.length > 0).map((h) => ({ group: h.family, train: h.b, test: h.a })) },
  ];
}

const f3 = (v: number): string => (Number.isNaN(v) ? "-" : v.toFixed(3));
const pct = (v: number): string => (Number.isNaN(v) ? "-" : `${(100 * v).toFixed(0)}%`);
const code = (s: string): string => `\`${s}\``;

/** The baselines of the screens. They are not ideas of the catalog. */
export const BASELINES: readonly string[] = ["shared", "shared-all", "corners", "trunks", "straight", "plugs", "shared-ways", "shared-ways-all"];

/**
 * This function gives the ideas of the catalog whose records name a strategy, with the verdict of each one.
 * It gives `undefined` for a baseline. A strategy name without a record gives an empty list.
 */
export function ideasOf(strategy: string, ideas: readonly { id: string; stage: string; result?: { verdict?: string; records?: readonly string[] } }[]): string[] | undefined {
  const name = strategy.includes(":") ? strategy.slice(strategy.indexOf(":") + 1) : strategy;
  if (BASELINES.includes(name)) return undefined;
  return ideas.filter((i) => (i.result?.records ?? []).some((r) => r.split("/").pop()?.split("@")[0] === name)).map((i) => `${i.id} ${i.result?.verdict ?? i.stage}`);
}

/** The text of the report and its data. */
export interface OracleReport {
  readonly markdown: string;
  readonly data: Record<string, unknown>;
}

/** The boards of the screen that decides of waves 2 and 3, on `screen-v1`. */
export const DECISION_BOARDS: readonly string[] = ["small-clustered", "dense-groups", "hub-chain", "many-groups"];

/** This function makes the tables of the oracle for the records of `exact-v1` and of `screen-v1`. */
export function oracleReport(exact: readonly OracleRecord[], screen: readonly OracleRecord[], ideas: Parameters<typeof ideasOf>[1] = []): OracleReport {
  const lines: string[] = [];
  const data: Record<string, unknown> = {};
  const seedOf = (input: string): number => Number(input.split("/s").pop());
  const mark = (s: string): string => {
    const found = ideasOf(s, ideas);
    return found === undefined ? "baseline" : found.length === 0 ? "no record" : found.join(", ");
  };

  // exact-v1: the gap closed with the rule of each run.
  // The strategies that mix collections on some input of `exact-v1`. The rule `collection` does not let them share a link.
  const mixes = new Set(exact.filter((r) => r.measures[MIXED] === 1).map((r) => r.strategy));
  if (exact.length > 0) {
    const table = valueTable(exact, (r) => r.measures[B10]);
    const single = bestSingle(table, "higher")!;
    const cells = oracle(table, "higher");
    const nonMixing = oracle(table, "higher", (s) => !mixes.has(s));
    const singleNon = bestSingle(table, "higher", { keep: (s) => !mixes.has(s) })!;
    const paired = [...cells].filter(([i]) => table.get(i)?.has(single.strategy));
    const boot = pairedBootstrap(
      paired.map(([, c]) => c.value),
      paired.map(([i]) => table.get(i)!.get(single.strategy)!),
    );
    const pairedNon = [...nonMixing].filter(([i]) => table.get(i)?.has(singleNon.strategy));
    const bootNon = pairedBootstrap(
      pairedNon.map(([, c]) => c.value),
      pairedNon.map(([i]) => table.get(i)!.get(singleNon.strategy)!),
    );
    const families = [...new Set([...table.keys()].map(familyOf))].sort();
    lines.push(
      "## `exact-v1`: the gap closed (B10)",
      "",
      `| portfolio | inputs | best single | its median | oracle median | oracle interval | gain | gain interval |`,
      `|---|---:|---|---:|---:|---|---:|---|`,
      `| all ${new Set(exact.map((r) => r.strategy)).size} strategies | ${paired.length} | ${code(single.strategy)} | ${f3(boot.b.median)} | ${f3(boot.a.median)} | ${f3(boot.a.lo)} to ${f3(boot.a.hi)} | ${f3(boot.diff.median)} | ${f3(boot.diff.lo)} to ${f3(boot.diff.hi)} |`,
      `| the strategies that never mix collections | ${pairedNon.length} | ${code(singleNon.strategy)} | ${f3(bootNon.b.median)} | ${f3(bootNon.a.median)} | ${f3(bootNon.a.lo)} to ${f3(bootNon.a.hi)} | ${f3(bootNon.diff.median)} | ${f3(bootNon.diff.lo)} to ${f3(bootNon.diff.hi)} |`,
      "",
      `The oracle has a value on ${cells.size} of ${table.size} inputs. Its median over all of them is ${f3(quantile([...cells.values()].map((c) => c.value), 0.5))}.`,
      `On ${[...cells.values()].filter((c) => c.value > 1 + RECORD_EPS).length} inputs, the oracle is above 1. With each value clipped at 1, the median is ${f3(quantile([...cells.values()].map((c) => Math.min(1, c.value)), 0.5))}.`,
      "",
      `| class | best single | oracle | gain |`,
      `|---|---:|---:|---:|`,
      ...families.map((fam) => {
        const mine = paired.filter(([i]) => familyOf(i) === fam);
        const o = quantile(
          mine.map(([, c]) => c.value),
          0.5,
        );
        const s = quantile(
          mine.map(([i]) => table.get(i)!.get(single.strategy)!),
          0.5,
        );
        return `| ${code(fam)} | ${f3(s)} | ${f3(o)} | ${f3(o - s)} |`;
      }),
      "",
    );
    const folds = halfFolds([...table.keys()], seedOf);
    const fits = crossFit(table, "higher", folds, single.strategy, cells);
    const meanShare = fits.reduce((a, f) => a + f.share, 0) / fits.length;
    const pooled = pooledShare(fits);
    lines.push(
      "### The realistic selector on `exact-v1`",
      "",
      "| split | test inputs | no value | selector | best single | oracle | share of the oracle gain | choices |",
      "|---|---:|---:|---:|---:|---:|---:|---|",
      ...fits.map(
        (f) =>
          `| ${f.name} | ${f.inputs} | ${f.missing} | ${f3(f.selector)} | ${f3(f.single)} | ${f3(f.oracle)} | ${pct(f.share)} | ${Object.entries(f.choices)
            .map(([g, s]) => `${g}: ${code(s)}`)
            .join(", ")} |`,
      ),
      `| mean of the splits | | | | | | ${pct(meanShare)} | |`,
      `| both splits together | ${pooled.inputs} | | ${f3(pooled.selector)} | ${f3(pooled.single)} | ${f3(pooled.oracle)} | ${pct(pooled.share)} | |`,
      "",
    );
    const feats = new Map(inputFeatures("exact-v1").map((f) => [f.input, f]));
    const wins = winnerCounts(cells).filter((w) => w.wins >= 2);
    lines.push(
      "### The winners on `exact-v1`",
      "",
      "| strategy | wins | sole wins | uniform | clustered | hubs | fanout | mean collections | ideas |",
      "|---|---:|---:|---:|---:|---:|---:|---:|---|",
      ...wins.map((w) => {
        const by = (fam: string): number => w.inputs.filter((i) => familyOf(i) === fam).length;
        const col = w.inputs.reduce((a, i) => a + (feats.get(i)?.collections ?? 0), 0) / w.inputs.length;
        return `| ${code(w.strategy)} | ${w.wins} | ${w.sole} | ${by("uniform")} | ${by("clustered")} | ${by("hubs")} | ${by("fanout")} | ${col.toFixed(1)} | ${mark(w.strategy)} |`;
      }),
      "",
    );
    data["exact"] = { single, singleNon, boot, bootNon, fits, meanShare, pooled, wins, cells: Object.fromEntries(cells), features: Object.fromEntries(feats) };
  }

  // screen-v1: B1 under the guard of the B3 q95 of `shared`.
  if (screen.length > 0) {
    const feats = new Map(inputFeatures("screen-v1").map((f) => [f.input, f]));
    const variants = [
      { key: "screen", title: "", hard: false, records: screen },
      { key: "screenHard", title: " and the hard rules", hard: true, records: screen },
      ...(mixes.size > 0 ? [{ key: "screenNoMix", title: ", without the strategies that mix collections", hard: false, records: screen.filter((r) => !mixes.has(r.strategy)) }] : []),
    ];
    for (const variant of variants) {
      const hard = variant.key !== "screen";
      const g = guardedB1(variant.records, { hard: variant.hard });
      const decision = [...g.ratio.keys()].filter((i) => DECISION_BOARDS.includes(familyOf(i)));
      const strictKeep = (s: string): boolean => decision.every((i) => g.pass.get(i)?.has(s) ?? false);
      const single = bestSingle(g.ratio, "higher", { inputs: decision, minShare: 1, keep: strictKeep })!;
      const fallback = bestSingle(g.ratio, "higher", { inputs: decision, minShare: 1 })!;
      const cells = oracle(g.ratio, "higher", (s, i) => g.pass.get(i)?.has(s) ?? false);
      const boards = [...new Set([...g.ratio.keys()].map(familyOf))];
      const rows = boards.map((board) => {
        const mine = [...g.ratio.keys()].filter((i) => familyOf(i) === board);
        const o = mine.map((i) => cells.get(i)!.value);
        const s = mine.map((i) => g.ratio.get(i)!.get(single.strategy)!);
        const fb = mine.map((i) => g.ratio.get(i)!.get(fallback.strategy)!);
        const liftFallback = quantile(
          mine.map((_, k) => o[k]! / fb[k]!),
          0.5,
        );
        const own = bestSingle(g.ratio, "higher", { inputs: mine, minShare: 1, keep: (x) => mine.every((i) => g.pass.get(i)?.has(x) ?? false) })!;
        const lift = quantile(
          mine.map((_, k) => o[k]! / s[k]!),
          0.5,
        );
        return { board, inputs: mine.length, oracle: quantile(o, 0.5), single: quantile(s, 0.5), fallback: quantile(fb, 0.5), own, lift, liftFallback, decision: DECISION_BOARDS.includes(board) };
      });
      const hits = rows.filter((r) => r.decision && r.lift >= 1.15 - RECORD_EPS).length;
      const hitsFallback = rows.filter((r) => r.decision && r.liftFallback >= 1.15 - RECORD_EPS).length;
      lines.push(
        `## \`screen-v1\`: B1 under the guard${variant.title}`,
        "",
        `The best single strategy passes the guard on each input of the ${DECISION_BOARDS.length} boards that decide: ${code(single.strategy)}. ` +
          `With a fall back to \`shared\` where a run fails the guard, the best single strategy is ${code(fallback.strategy)}.`,
        "",
        "| board | inputs | oracle / `shared` | best single / `shared` | oracle / best single | single with fall back / `shared` | oracle / single with fall back | best single of the board | its ratio |",
        "|---|---:|---:|---:|---:|---:|---:|---|---:|",
        ...rows.map(
          (r) =>
            `| ${code(r.board)}${r.decision ? "" : " (not in the decision)"} | ${r.inputs} | ${f3(r.oracle)} | ${f3(r.single)} | ${f3(r.lift)} | ${f3(r.fallback)} | ${f3(r.liftFallback)} | ${code(r.own.strategy)} | ${f3(r.own.median)} |`,
        ),
        "",
        `The oracle is 15% or more above the best single strategy on ${hits} of the ${DECISION_BOARDS.length} boards that decide. ` +
          `It is 15% or more above the single strategy with a fall back on ${hitsFallback} of them.`,
        "",
      );
      if (!hard) {
        // The realistic selector: the boards with 3 seeds choose on one part of the seeds. A board with 1 seed chooses on the other boards that decide.
        const folds: Fold[] = [];
        const multi = DECISION_BOARDS.filter((b) => decision.filter((i) => familyOf(i) === b).length > 1);
        folds.push(...halfFolds(decision.filter((i) => multi.includes(familyOf(i))), seedOf));
        for (const b of DECISION_BOARDS.filter((x) => !multi.includes(x) && decision.some((i) => familyOf(i) === x)))
          folds.push({ name: `${b} from the other boards`, groups: [{ group: b, train: decision.filter((i) => familyOf(i) !== b), test: decision.filter((i) => familyOf(i) === b) }] });
        const fits = crossFit(g.ratio, "higher", folds, single.strategy, cells);
        const fitsFallback = crossFit(g.ratio, "higher", folds, fallback.strategy, cells);
        const mean = (xs: readonly FoldResult[]): number => {
          const ok = xs.filter((f) => !Number.isNaN(f.share));
          return ok.reduce((a, f) => a + f.share, 0) / ok.length;
        };
        const meanShare = mean(fits);
        const meanShareFallback = mean(fitsFallback);
        const pooled = pooledShare(fits);
        const pooledFallback = pooledShare(fitsFallback);
        lines.push(
          "### The realistic selector on `screen-v1`",
          "",
          "| split | test inputs | selector / `shared` | best single / `shared` | oracle / `shared` | share of the oracle gain | share against the single with fall back | choices |",
          "|---|---:|---:|---:|---:|---:|---:|---|",
          ...fits.map(
            (f, k) =>
              `| ${f.name} | ${f.inputs} | ${f3(f.selector)} | ${f3(f.single)} | ${f3(f.oracle)} | ${pct(f.share)} | ${pct(fitsFallback[k]!.share)} | ${Object.entries(f.choices)
                .map(([b, s]) => `${b}: ${code(s)}`)
                .join(", ")} |`,
          ),
          `| mean of the splits | | | | | ${pct(meanShare)} | ${pct(meanShareFallback)} | |`,
          `| all splits together | ${pooled.inputs} | ${f3(pooled.selector)} | ${f3(pooled.single)} | ${f3(pooled.oracle)} | ${pct(pooled.share)} | ${pct(pooledFallback.share)} | |`,
          "",
        );
        const wins = winnerCounts(cells);
        lines.push(
          "### The winner of each input of `screen-v1`",
          "",
          "| input | nodes | edges | edge shape | fixed plugs | collections | oracle / `shared` | winners |",
          "|---|---:|---:|---|---:|---:|---:|---|",
          ...[...cells].map(([i, c]) => {
            const f = feats.get(i)!;
            return `| ${code(i)} | ${f.nodes} | ${f.edges} | ${code(f.edgeShape)} | ${pct(f.fixedShare)} | ${f.collections} | ${f3(c.value)} | ${c.winners.length > 6 ? `${c.winners.slice(0, 3).map(code).join(", ")} and ${c.winners.length - 3} more` : c.winners.map(code).join(", ")} |`;
          }),
          "",
          "| strategy | wins | sole wins | boards | ideas |",
          "|---|---:|---:|---|---|",
          ...wins
            .filter((w) => w.wins >= 2)
            .map((w) => `| ${code(w.strategy)} | ${w.wins} | ${w.sole} | ${[...new Set(w.inputs.map(familyOf))].join(", ")} | ${mark(w.strategy)} |`),
          "",
        );
        data["screen"] = { single, fallback, rows, hits, hitsFallback, fits, fitsFallback, meanShare, meanShareFallback, pooled, pooledFallback, wins, cells: Object.fromEntries(cells), features: Object.fromEntries(feats) };
      } else data[variant.key] = { single, fallback, rows, hits, hitsFallback };
    }

    const measures = measureRows(screen);
    lines.push(
      "## `screen-v1`: each measure without a guard",
      "",
      `The values are the medians over the ${new Set(screen.map((r) => r.input)).size} inputs. For a measure where lower is better, a ratio below 1 is a gain.`,
      "",
      "| measure | id | better | best single | its median | oracle median | ratio |",
      "|---|---|---|---|---:|---:|---:|",
      ...measures.map((m) => `| ${code(m.measure)} | ${m.id} | ${m.better} | ${code(m.single)} | ${f3(m.singleMedian)} | ${f3(m.oracleMedian)} | ${f3(m.ratio)} |`),
      "",
    );
    data["measures"] = measures;
  }
  return { markdown: lines.join("\n"), data };
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const paths = (name: string): string[] => (opt(name) ?? "").split(",").filter((p) => p.length > 0);
  const ideasDir = new URL("../../../docs/research/ideas/", import.meta.url);
  const ideas = ["highway", "wild", "fields", "nature", "rules"].flatMap((f) => {
    const j = JSON.parse(readFileSync(new URL(`${f}.json`, ideasDir), "utf8")) as unknown;
    return (Array.isArray(j) ? j : (j as { ideas: unknown[] }).ideas) as Parameters<typeof ideasOf>[1];
  });
  const report = oracleReport(readRecords(paths("--exact")), readRecords(paths("--screen")), ideas);
  writeFileSync(opt("--out") ?? "oracle.md", report.markdown + "\n");
  if (opt("--json")) writeFileSync(opt("--json")!, JSON.stringify(report.data, null, 1));
  console.log(report.markdown);
}
