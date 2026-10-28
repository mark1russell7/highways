// The command line of the portfolio (PORTFOLIO): `pnpm portfolio --exact <path,...> --screen <path,...> [--time <path,...>] [--out portfolio.md] [--json portfolio.json]`.
// A portfolio runs `shared` and k more strategies on an input, and keeps the output with the best guarded B1. Its score needs only the outputs.
// The script reads the records of the workflow `Screen` and the times of the workflow `Portfolio`, and writes the tables of `docs/research/PORTFOLIO.md`.
// It chooses each set of k strategies greedily on one half of the seeds and tests it on the other half.
// The script reads only records, so it runs locally in a few seconds. The screens and the times run in CI.
// The test `src/bench/screen/portfolio.test.ts` examines the functions of this file on a small set of records.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { quantile } from "../src/bench/measures/stats.ts";
import { GAP_CAPS } from "../src/bench/screen/gap.ts";
import { RECORD_EPS } from "../src/bench/screen/hash.ts";
import { B1, B10, B3_Q95, DECISION_BOARDS, familyOf, halfFolds, pairedBootstrap, readRecords, type OracleRecord } from "./oracle.ts";
import type { TimeRecord } from "./portfolio-time.ts";

/** The name of the largest stretch of the routes, in the units of the exact model, in a record of `exact-v1`. */
export const MODEL_STRETCH = "route.bundle.stretch.model.max";

/** The values of one run that the portfolio and its tests read. */
export interface Run {
  readonly b1: number;
  readonly q95?: number;
  /** The largest stretch of the routes in the units of the exact model. Only the runs of `exact-v1` have it. */
  readonly stretch?: number;
  /** The gap closed (B10) with the rule of the run. Only the runs of `exact-v1` have it. */
  readonly b10?: number;
  readonly hard: Readonly<Record<string, number>>;
}

/** The runs of each input and each strategy. */
export type RunTable = ReadonlyMap<string, ReadonlyMap<string, Run>>;

/**
 * The guard of the portfolio. A run passes when each hard count is at most the count of the baseline on the same input, and:
 * - `q95`: its B3 q95 is at most the B3 q95 of the baseline (a difference of `RECORD_EPS` or less is a tie);
 * - `cap`: it has no B3 condition.
 * On `exact-v1`, each guard also needs the largest stretch at or below the largest cap of the gap closed (1.5). The stretch is a measure of the output.
 */
export type Guard = "q95" | "cap";

/** The baseline of the portfolio. The portfolio always runs it, because the guard compares each run with it. */
export const PORTFOLIO_BASE = "shared";

/** The sizes of the sets of the Pareto curve. */
export const PORTFOLIO_KS: readonly number[] = [1, 2, 3, 5, 8];

/** The frame budgets of the time table, in ms. */
export const FRAME_BUDGETS: readonly number[] = [16, 100];

/** This function gives the run table of records. A skipped run and a run without B1 are not in the table. */
export function runTable(records: readonly OracleRecord[]): Map<string, Map<string, Run>> {
  const table = new Map<string, Map<string, Run>>();
  for (const r of records) {
    if (!table.has(r.input)) table.set(r.input, new Map());
    const b1 = r.measures[B1];
    if (r.skipped !== undefined || b1 === undefined || !Number.isFinite(b1)) continue;
    const m = r.measures;
    table.get(r.input)!.set(r.strategy, {
      b1,
      ...(m[B3_Q95] === undefined ? {} : { q95: m[B3_Q95] }),
      ...(m[MODEL_STRETCH] === undefined ? {} : { stretch: m[MODEL_STRETCH] }),
      ...(m[B10] === undefined ? {} : { b10: m[B10] }),
      hard: r.hard ?? {},
    });
  }
  return table;
}

/** This function tells if the run `run` passes the guard `guard` against the run `base` of the baseline on the same input. */
export function passes(run: Run, base: Run, guard: Guard): boolean {
  for (const [rule, n] of Object.entries(run.hard)) if (n > (base.hard[rule] ?? 0)) return false;
  if (run.stretch !== undefined && run.stretch > GAP_CAPS[GAP_CAPS.length - 1]! + 1e-9) return false;
  if (guard === "q95") return run.q95 !== undefined && base.q95 !== undefined && run.q95 <= base.q95 + RECORD_EPS;
  return true;
}

/**
 * This function gives the choice of the portfolio on one input: the run with the best B1 among the baseline and the strategies of `set` that pass the guard.
 * A tie within `RECORD_EPS` goes to the first name: the baseline, then the order of `set`. It gives `undefined` when the input has no run of the baseline.
 */
export function choose(row: ReadonlyMap<string, Run>, set: readonly string[], guard: Guard, base: string = PORTFOLIO_BASE): string | undefined {
  const b = row.get(base);
  if (b === undefined) return undefined;
  let best = base;
  let bestB1 = b.b1;
  for (const s of set) {
    const r = row.get(s);
    if (r === undefined || s === base || !passes(r, b, guard)) continue;
    if (r.b1 > bestB1 + RECORD_EPS) {
      best = s;
      bestB1 = r.b1;
    }
  }
  return best;
}

/** The value of a run on an input: the gap closed on `exact-v1`, or the ratio of B1 to the B1 of the baseline on `screen-v1`. */
export type ValueOf = (input: string, strategy: string) => number | undefined;

/** This function gives the value of the gap closed (B10) of a run. */
export const gapValue =
  (table: RunTable): ValueOf =>
  (input, strategy) =>
    table.get(input)?.get(strategy)?.b10;

/** This function gives the ratio of the B1 of a run to the B1 of the baseline. An input where the baseline has a B1 of 0 has no ratio. */
export const ratioValue =
  (table: RunTable, base: string = PORTFOLIO_BASE): ValueOf =>
  (input, strategy) => {
    const b = table.get(input)?.get(base)?.b1;
    const r = table.get(input)?.get(strategy)?.b1;
    return b === undefined || r === undefined || !(b > 0) ? undefined : r / b;
  };

/** This function gives the values of the portfolio `set` on the inputs `inputs`, in order. An input without a value of the choice gives `undefined`. */
export function portfolioValues(table: RunTable, inputs: readonly string[], set: readonly string[], guard: Guard, value: ValueOf): (number | undefined)[] {
  return inputs.map((i) => {
    const row = table.get(i);
    const c = row === undefined ? undefined : choose(row, set, guard);
    return c === undefined ? undefined : value(i, c);
  });
}

const defined = (xs: readonly (number | undefined)[]): number[] => xs.filter((x): x is number => x !== undefined);
const mean = (xs: readonly number[]): number => (xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length);

/** The score of a set on train inputs: the median of the values, then the mean for a tie. A missing value counts as the value of the baseline. */
function setScore(table: RunTable, inputs: readonly string[], set: readonly string[], guard: Guard, value: ValueOf): [number, number] {
  const v = portfolioValues(table, inputs, set, guard, value).map((x, k) => x ?? value(inputs[k]!, PORTFOLIO_BASE) ?? 0);
  return [quantile(v, 0.5), mean(v)];
}

/**
 * This function chooses a set of `k` strategies greedily on the inputs `inputs`. Each step adds the strategy that gives the best median of the portfolio, then the best mean.
 * A tie goes to the first name in the sort order. The function stops early when no strategy improves the score.
 */
export function greedySet(table: RunTable, inputs: readonly string[], pool: readonly string[], k: number, guard: Guard, value: ValueOf): string[] {
  const set: string[] = [];
  let score = setScore(table, inputs, set, guard, value);
  const names = [...pool].filter((s) => s !== PORTFOLIO_BASE).sort();
  while (set.length < k) {
    let best: { s: string; score: [number, number] } | undefined;
    for (const s of names) {
      if (set.includes(s)) continue;
      const sc = setScore(table, inputs, [...set, s], guard, value);
      if (best === undefined || sc[0] > best.score[0] + RECORD_EPS || (Math.abs(sc[0] - best.score[0]) <= RECORD_EPS && sc[1] > best.score[1] + RECORD_EPS)) best = { s, score: sc };
    }
    if (best === undefined || !(best.score[0] > score[0] + RECORD_EPS || (Math.abs(best.score[0] - score[0]) <= RECORD_EPS && best.score[1] > score[1] + RECORD_EPS))) break;
    set.push(best.s);
    score = best.score;
  }
  return set;
}

/**
 * This function gives the strategy with the best median of `value` on `inputs`. With `strict`, the strategy must pass the guard on each input.
 * The strategy needs a value on at least `minShare` of the inputs (default 0.5).
 */
export function singleBest(
  table: RunTable,
  inputs: readonly string[],
  pool: readonly string[],
  value: ValueOf,
  o: { readonly strict?: Guard; readonly minShare?: number } = {},
): string | undefined {
  let best: { s: string; m: number } | undefined;
  for (const s of [...pool].sort()) {
    const ok = (i: string): boolean => {
      const row = table.get(i);
      const r = row?.get(s);
      const b = row?.get(PORTFOLIO_BASE);
      return r !== undefined && b !== undefined && (s === PORTFOLIO_BASE || passes(r, b, o.strict!));
    };
    if (o.strict !== undefined && !inputs.every(ok)) continue;
    const v = defined(inputs.map((i) => value(i, s)));
    if (v.length === 0 || v.length < (o.minShare ?? 0.5) * inputs.length) continue;
    const m = quantile(v, 0.5);
    if (best === undefined || m > best.m) best = { s, m };
  }
  return best?.s;
}

/** This function gives the oracle of an input: the best value over the strategies `keep` accepts. */
export function oracleValue(input: string, pool: readonly string[], value: ValueOf, keep: (s: string) => boolean = () => true): number | undefined {
  let best: number | undefined;
  for (const s of pool) {
    if (!keep(s)) continue;
    const v = value(input, s);
    if (v !== undefined && (best === undefined || v > best)) best = v;
  }
  return best;
}

/** The test of one size k over the splits: the values of the test inputs of all splits, and the choices of each split. */
export interface CurvePoint {
  readonly k: number;
  /** The set of each split. */
  readonly sets: readonly (readonly string[])[];
  /** The values of the test inputs of all splits together, in the same order: the portfolio, the best single strategy and the oracle. */
  readonly portfolio: readonly number[];
  readonly single: readonly number[];
  readonly oracle: readonly number[];
  readonly inputs: readonly string[];
  /** The share of the oracle gain over all test inputs, from the medians. */
  readonly share: number;
  /** The share of each split. */
  readonly shares: readonly number[];
}

/** One split: the train inputs and the test inputs. */
export interface Split {
  readonly name: string;
  readonly train: readonly string[];
  readonly test: readonly string[];
}

/** This function gives the share of the oracle gain from medians: `(portfolio - single) / (oracle - single)`. It is `NaN` when the oracle gains `RECORD_EPS` or less. */
export function shareOf(portfolio: number, single: number, oracleMedian: number): number {
  const gain = oracleMedian - single;
  return Math.abs(gain) <= RECORD_EPS ? Number.NaN : (portfolio - single) / gain;
}

/**
 * This function gives the Pareto curve of the portfolio: for each k, it chooses the set on the train inputs of each split and tests it on the test inputs.
 * The best single strategy of a split is the one with the best median on its train inputs, with a value on `singleShare` of them (default 1).
 * With `strict`, it must pass the guard on each train input. On a test input, its value is `singleOf` (default `value`).
 * The oracle of a test input is the best value of `oracleOf` over the pool. An input without each of the three values is not in the test.
 */
export function paretoCurve(
  table: RunTable,
  splits: readonly Split[],
  pool: readonly string[],
  guard: Guard,
  value: ValueOf,
  o: {
    readonly ks?: readonly number[];
    readonly strict?: Guard;
    readonly oracleOf?: ValueOf;
    readonly singleOf?: ValueOf;
    readonly singleShare?: number;
    readonly full?: boolean;
  } = {},
): CurvePoint[] {
  const ks = [...(o.ks ?? PORTFOLIO_KS), ...(o.full ? [pool.length] : [])];
  const oracleOf = o.oracleOf ?? value;
  const singleOf = o.singleOf ?? value;
  return ks.map((k) => {
    const sets: string[][] = [];
    const pf: number[] = [];
    const one: number[] = [];
    const orc: number[] = [];
    const ins: string[] = [];
    const shares: number[] = [];
    for (const sp of splits) {
      const set = k >= pool.length ? pool.filter((s) => s !== PORTFOLIO_BASE) : greedySet(table, sp.train, pool, k, guard, value);
      sets.push(set);
      const single = singleBest(table, sp.train, pool, value, { minShare: o.singleShare ?? 1, ...(o.strict === undefined ? {} : { strict: o.strict }) });
      const vals = portfolioValues(table, sp.test, set, guard, value);
      const mine = { pf: [] as number[], one: [] as number[], orc: [] as number[] };
      sp.test.forEach((i, n) => {
        const p = vals[n];
        const s = single === undefined ? undefined : singleOf(i, single);
        const q = oracleValue(i, pool, oracleOf);
        if (p === undefined || s === undefined || q === undefined) return;
        mine.pf.push(p);
        mine.one.push(s);
        mine.orc.push(q);
        ins.push(i);
      });
      pf.push(...mine.pf);
      one.push(...mine.one);
      orc.push(...mine.orc);
      shares.push(shareOf(quantile(mine.pf, 0.5), quantile(mine.one, 0.5), quantile(mine.orc, 0.5)));
    }
    return { k, sets, portfolio: pf, single: one, oracle: orc, inputs: ins, share: shareOf(quantile(pf, 0.5), quantile(one, 0.5), quantile(orc, 0.5)), shares };
  });
}

/** This function gives the share of pairs of runs on one input whose order by B1 is the reverse of their order by B10. A pair with a tie on either side does not count. */
export function discordance(row: ReadonlyMap<string, Run>): { readonly pairs: number; readonly reversed: number } {
  const runs = [...row.values()].filter((r) => r.b10 !== undefined);
  let pairs = 0;
  let reversed = 0;
  for (let a = 0; a < runs.length; a++)
    for (let b = a + 1; b < runs.length; b++) {
      const d1 = runs[a]!.b1 - runs[b]!.b1;
      const d10 = runs[a]!.b10! - runs[b]!.b10!;
      if (Math.abs(d1) <= RECORD_EPS || Math.abs(d10) <= RECORD_EPS) continue;
      pairs++;
      if (Math.sign(d1) !== Math.sign(d10)) reversed++;
    }
  return { pairs, reversed };
}

/** The time of a set of strategies at one size: the median and the q95 over the boards, one after the other and in parallel. */
export interface SetTime {
  readonly nodes: number;
  readonly serial: { readonly median: number; readonly q95: number };
  readonly parallel: { readonly median: number; readonly q95: number };
  /** The median time of `shared` alone on the same boards, with its score. */
  readonly shared: number;
}

/**
 * This function gives the time of the portfolio `set` at each size. The portfolio runs `corners` (the base of B3), `shared` and each strategy of `set`, and scores each output.
 * For each board, a strategy takes the median of its repeats. One after the other is the sum of the runs. In parallel is the longest run.
 */
export function setTimes(times: readonly TimeRecord[], set: readonly string[]): SetTime[] {
  const cell = new Map<string, number[]>();
  for (const t of times) {
    if (t.skipped !== undefined) continue;
    const key = `${t.strategy}|${t.nodes}|${t.cls}|${t.seed}`;
    if (!cell.has(key)) cell.set(key, []);
    cell.get(key)!.push(t.ms + t.scoreMs);
  }
  const cornersCell = new Map<string, number[]>();
  for (const t of times) {
    if (t.skipped !== undefined || t.strategy !== "corners") continue;
    const key = `${t.nodes}|${t.cls}|${t.seed}`;
    if (!cornersCell.has(key)) cornersCell.set(key, []);
    cornersCell.get(key)!.push(t.ms);
  }
  const sizes = [...new Set(times.map((t) => t.nodes))].sort((a, b) => a - b);
  const members = [PORTFOLIO_BASE, ...set.filter((s) => s !== PORTFOLIO_BASE)];
  return sizes.map((nodes) => {
    const boards = [...new Set(times.filter((t) => t.nodes === nodes).map((t) => `${t.cls}|${t.seed}`))];
    const serial: number[] = [];
    const parallel: number[] = [];
    const shared: number[] = [];
    for (const b of boards) {
      const one = members.map((s) => cell.get(`${s}|${nodes}|${b}`));
      // A strategy without a time on the board (a skip) does not run there.
      const runs = one.filter((x): x is number[] => x !== undefined).map((x) => quantile(x, 0.5));
      const c = cornersCell.get(`${nodes}|${b}`);
      const cm = c === undefined ? 0 : quantile(c, 0.5);
      if (runs.length === 0) continue;
      serial.push(cm + runs.reduce((a, x) => a + x, 0));
      parallel.push(Math.max(cm, ...runs));
      shared.push(runs[0]!);
    }
    const q = (xs: number[]): { median: number; q95: number } => ({ median: quantile(xs, 0.5), q95: quantile(xs, 0.95) });
    return { nodes, serial: q(serial), parallel: q(parallel), shared: quantile(shared, 0.5) };
  });
}

/** The time of one strategy at one size: the median and the q95 of the route alone, over the boards and the repeats. */
export function strategyTimes(times: readonly TimeRecord[]): Map<string, Map<number, { median: number; q95: number; score: number; runs: number }>> {
  const groups = new Map<string, TimeRecord[]>();
  for (const t of times) {
    if (t.skipped !== undefined) continue;
    const key = `${t.strategy}|${t.nodes}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const out = new Map<string, Map<number, { median: number; q95: number; score: number; runs: number }>>();
  for (const [key, ts] of groups) {
    const [s, n] = key.split("|") as [string, string];
    if (!out.has(s)) out.set(s, new Map());
    const ms = ts.map((t) => t.ms);
    out.get(s)!.set(Number(n), { median: quantile(ms, 0.5), q95: quantile(ms, 0.95), score: quantile(ts.map((t) => t.scoreMs), 0.5), runs: ts.length });
  }
  return out;
}

/** This function gives the splits of seeds of a set: the first half of the seeds of each family to the second half, and the reverse. */
export function seedSplits(inputs: readonly string[]): Split[] {
  const seedOf = (i: string): number => Number(i.split("/s").pop());
  return halfFolds(inputs, seedOf).map((f) => ({ name: f.name, train: f.groups.flatMap((g) => g.train), test: f.groups.flatMap((g) => g.test) }));
}

/**
 * This function gives the splits of `screen-v1` on the boards that decide. The first split trains on the seeds 0 and 1 and tests on the seed 2.
 * The second split trains on the seed 2 and tests on the seeds 0 and 1. A board with 1 seed is in the train of the first split and the test of the second split.
 */
export function screenSplits(inputs: readonly string[]): Split[] {
  const seedOf = (i: string): number => Number(i.split("/s").pop());
  const mine = inputs.filter((i) => DECISION_BOARDS.includes(familyOf(i)));
  const late = mine.filter((i) => seedOf(i) >= 2);
  const early = mine.filter((i) => seedOf(i) < 2);
  return [
    { name: "seeds 0 and 1 to the seed 2", train: early, test: late },
    { name: "the seed 2 to the seeds 0 and 1", train: late, test: early },
  ];
}

const f3 = (v: number): string => (Number.isNaN(v) ? "-" : v.toFixed(3));
const pct = (v: number): string => (Number.isNaN(v) ? "-" : `${(100 * v).toFixed(0)}%`);
const ms = (v: number): string => (Number.isNaN(v) ? "-" : v < 10 ? v.toFixed(2) : v.toFixed(0));
const code = (s: string): string => `\`${s}\``;
const setText = (set: readonly string[]): string => (set.length === 0 ? "none" : set.map(code).join(", "));

/** The text of the report and its data. */
export interface PortfolioReport {
  readonly markdown: string;
  readonly data: Record<string, unknown>;
}

/** This function makes the tables of the portfolio for the records of `exact-v1` and of `screen-v1`, and the times of the workflow `Portfolio`. */
export function portfolioReport(exact: readonly OracleRecord[], screen: readonly OracleRecord[], times: readonly TimeRecord[] = []): PortfolioReport {
  const lines: string[] = [];
  const data: Record<string, unknown> = {};
  const fullSets: { corpus: string; guard: Guard; k: number; set: string[] }[] = [];

  if (exact.length > 0) {
    const table = runTable(exact);
    const pool = [...new Set(exact.map((r) => r.strategy))].sort();
    const inputs = [...table.keys()].sort();
    const value = gapValue(table);

    // The claim: the order of B1 on an input is the order of B10.
    const disc = inputs.map((i) => discordance(table.get(i)!));
    const pairs = disc.reduce((a, d) => a + d.pairs, 0);
    const reversed = disc.reduce((a, d) => a + d.reversed, 0);
    const argmaxDiffer = inputs.filter((i) => {
      const row = table.get(i)!;
      const withValue = [...row].filter(([, r]) => r.b10 !== undefined);
      if (withValue.length === 0) return false;
      const byB1 = withValue.reduce((a, b) => (b[1].b1 > a[1].b1 ? b : a));
      const byB10 = withValue.reduce((a, b) => (b[1].b10! > a[1].b10! ? b : a));
      return Math.abs(byB1[1].b10! - byB10[1].b10!) > RECORD_EPS;
    }).length;
    const q95Pass = inputs.map((i) => {
      const row = table.get(i)!;
      const b = row.get(PORTFOLIO_BASE);
      return b === undefined ? 0 : [...row].filter(([s, r]) => s !== PORTFOLIO_BASE && passes(r, b, "q95") && r.b1 > b.b1 + RECORD_EPS).length;
    });
    lines.push(
      "## The check of the claim on `exact-v1`",
      "",
      `| check | value |`,
      `|---|---:|`,
      `| inputs | ${inputs.length} |`,
      `| strategies | ${pool.length} |`,
      `| pairs of runs on one input with a strict order by B1 and by B10 | ${pairs} |`,
      `| pairs where the order by B10 is the reverse of the order by B1 | ${reversed} (${pct(reversed / pairs)}) |`,
      `| inputs where the run with the best B1 does not have the best B10 | ${argmaxDiffer} |`,
      `| median count of strategies that pass the guard \`q95\` with more B1 than \`shared\` | ${quantile(q95Pass, 0.5)} |`,
      "",
    );
    data["claim"] = { pairs, reversed, argmaxDiffer, q95Pass };

    const splits = seedSplits(inputs);
    for (const guard of ["q95", "cap"] as const) {
      const curve = paretoCurve(table, splits, pool, guard, value, { full: true });
      lines.push(
        `## \`exact-v1\`: the gap closed (B10) of the portfolio with the guard \`${guard}\``,
        "",
        `The best single strategy of each split has a value on each of its train inputs: ${splits.map((sp) => code(singleBest(table, sp.train, pool, value, { minShare: 1 }) ?? "-")).join(" and ")}.`,
        "",
        "| k | test inputs | portfolio median | interval | best single | gain over the single | gain interval | oracle | share of the oracle gain | share of each split | set of the first split | set of the second split |",
        "|---:|---:|---:|---|---:|---:|---|---:|---:|---|---|---|",
        ...curve.map((p) => {
          const boot = pairedBootstrap(p.portfolio, p.single);
          const kText = p.k >= pool.length ? `all ${pool.length - 1}` : String(p.k);
          const sets = p.k >= pool.length ? ["all", "all"] : p.sets.map(setText);
          return `| ${kText} | ${p.inputs.length} | ${f3(boot.a.median)} | ${f3(boot.a.lo)} to ${f3(boot.a.hi)} | ${f3(boot.b.median)} | ${f3(boot.diff.median)} | ${f3(boot.diff.lo)} to ${f3(boot.diff.hi)} | ${f3(quantile(p.oracle, 0.5))} | ${pct(p.share)} | ${p.shares.map(pct).join(" / ")} | ${sets[0]} | ${sets[1]} |`;
        }),
        "",
      );
      data[`exact-${guard}`] = curve;
      for (const k of PORTFOLIO_KS) fullSets.push({ corpus: "exact-v1", guard, k, set: greedySet(table, inputs, pool, k, guard, value) });
    }
  }

  if (screen.length > 0) {
    const table = runTable(screen);
    const pool = [...new Set(screen.map((r) => r.strategy))].sort();
    const inputs = [...table.keys()].filter((i) => (table.get(i)?.get(PORTFOLIO_BASE)?.b1 ?? 0) > 0).sort();
    const ratio = ratioValue(table);
    // The value of a run under the guard: its ratio when it passes, or 1 (the baseline) when it does not.
    const guarded: ValueOf = (i, s) => {
      const row = table.get(i);
      const r = row?.get(s);
      const b = row?.get(PORTFOLIO_BASE);
      if (r === undefined || b === undefined) return undefined;
      return passes(r, b, "q95") ? ratio(i, s) : 1;
    };
    const splits = screenSplits(inputs);
    const curve = paretoCurve(table, splits, pool, "q95", ratio, { strict: "q95", oracleOf: guarded, singleOf: guarded, full: true });
    lines.push(
      "## `screen-v1`: the guarded B1 of the portfolio",
      "",
      "The values are ratios to the B1 of `shared`. The best single strategy passes the guard on each train input. On a test input where it fails the guard, it falls back to `shared` (ratio 1).",
      "",
      "| k | test inputs | portfolio / `shared` | best single / `shared` | oracle / `shared` | share of the oracle gain | share of each split | set of the first split | set of the second split |",
      "|---:|---:|---:|---:|---:|---:|---|---|---|",
      ...curve.map((p) => {
        const kText = p.k >= pool.length ? `all ${pool.length - 1}` : String(p.k);
        const sets = p.k >= pool.length ? ["all", "all"] : p.sets.map(setText);
        return `| ${kText} | ${p.inputs.length} | ${f3(quantile(p.portfolio, 0.5))} | ${f3(quantile(p.single, 0.5))} | ${f3(quantile(p.oracle, 0.5))} | ${pct(p.share)} | ${p.shares.map(pct).join(" / ")} | ${sets[0]} | ${sets[1]} |`;
      }),
      "",
      "The portfolio over the best single strategy on each board that decides, on the test inputs:",
      "",
      `| k | ${DECISION_BOARDS.map(code).join(" | ")} | boards at 15% or more |`,
      `|---:|${DECISION_BOARDS.map(() => "---:").join("|")}|---:|`,
      ...curve.map((p) => {
        const byBoard = DECISION_BOARDS.map((b) => {
          const idx = p.inputs.map((i, n) => [i, n] as const).filter(([i]) => familyOf(i) === b);
          return idx.length === 0 ? Number.NaN : quantile(idx.map(([, n]) => p.portfolio[n]! / p.single[n]!), 0.5);
        });
        const kText = p.k >= pool.length ? `all ${pool.length - 1}` : String(p.k);
        return `| ${kText} | ${byBoard.map(f3).join(" | ")} | ${byBoard.filter((v) => v >= 1.15 - RECORD_EPS).length} of ${byBoard.filter((v) => !Number.isNaN(v)).length} |`;
      }),
      "",
    );
    data["screen"] = curve;
    const decision = inputs.filter((i) => DECISION_BOARDS.includes(familyOf(i)));
    for (const k of PORTFOLIO_KS) fullSets.push({ corpus: "screen-v1", guard: "q95", k, set: greedySet(table, decision, pool, k, "q95", ratio) });

    // The sets of `exact-v1` on `screen-v1`: does a set of one corpus work on the other?
    const transfer = fullSets.filter((f) => f.corpus === "exact-v1");
    if (transfer.length > 0) {
      const single = singleBest(table, decision, pool, ratio, { strict: "q95", minShare: 1 });
      lines.push(
        "The sets that `exact-v1` chooses on all of its inputs, on the boards that decide of `screen-v1`:",
        "",
        `| guard of the choice | k | portfolio / \`shared\` | best single / \`shared\` (${single === undefined ? "-" : code(single)}) |`,
        "|---|---:|---:|---:|",
        ...transfer.map((f) => {
          const v = defined(portfolioValues(table, decision, f.set, "q95", ratio));
          const s = defined(decision.map((i) => (single === undefined ? undefined : ratio(i, single))));
          return `| \`${f.guard}\` | ${f.k} | ${f3(quantile(v, 0.5))} | ${f3(quantile(s, 0.5))} |`;
        }),
        "",
      );
    }
  }

  lines.push(
    "## The sets on all inputs",
    "",
    "The greedy choice on all inputs of each corpus. The time table uses these sets.",
    "",
    "| corpus | guard | k | set |",
    "|---|---|---:|---|",
    ...fullSets.map((f) => `| \`${f.corpus}\` | \`${f.guard}\` | ${f.k} | ${setText(f.set)} |`),
    "",
  );
  data["sets"] = fullSets;

  if (times.length > 0) {
    const per = strategyTimes(times);
    const sizes = [...new Set(times.map((t) => t.nodes))].sort((a, b) => a - b);
    const sharedAt = (n: number): number => per.get(PORTFOLIO_BASE)?.get(n)?.median ?? Number.NaN;
    const machine = times.length;
    lines.push(
      "## The time of each strategy",
      "",
      `The table gives the time of the route alone, in ms, over ${machine} timed runs. The column \`× shared\` is the median divided by the median of \`shared\` at the same size.`,
      "",
      `| size | strategies | median of the medians | strategies under 16 ms | strategies under 100 ms | \`shared\` median | \`shared\` q95 | score median of \`shared\` |`,
      "|---:|---:|---:|---:|---:|---:|---:|---:|",
      ...sizes.map((n) => {
        const meds = [...per.values()].flatMap((m) => (m.get(n) ? [m.get(n)!.median] : []));
        const sh = per.get(PORTFOLIO_BASE)?.get(n);
        return `| ${n} | ${meds.length} | ${ms(quantile(meds, 0.5))} | ${meds.filter((v) => v <= 16).length} | ${meds.filter((v) => v <= 100).length} | ${ms(sh?.median ?? Number.NaN)} | ${ms(sh?.q95 ?? Number.NaN)} | ${ms(sh?.score ?? Number.NaN)} |`;
      }),
      "",
    );
    const named = [...new Set([PORTFOLIO_BASE, "corners", ...fullSets.flatMap((f) => f.set)])];
    lines.push(
      "The strategies of the sets:",
      "",
      `| strategy | ${sizes.map((n) => `${n} median | ${n} q95 | ${n} × shared`).join(" | ")} |`,
      `|---|${sizes.map(() => "---:|---:|---:").join("|")}|`,
      ...named.map((s) => {
        const m = per.get(s);
        return `| ${code(s)} | ${sizes
          .map((n) => {
            const t = m?.get(n);
            return t === undefined ? "- | - | -" : `${ms(t.median)} | ${ms(t.q95)} | ${f3(t.median / sharedAt(n))}`;
          })
          .join(" | ")} |`;
      }),
      "",
      "## The time of each set",
      "",
      "Each set also runs `corners` (the base of B3) and `shared` (the base of the guard), and scores each output. The times are in ms, over the boards of each size.",
      "",
      "| corpus | guard | k | size | one after the other: median | q95 | × shared | in parallel: median | q95 | × shared | fits 16 ms | fits 100 ms |",
      "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|",
      ...fullSets.flatMap((f) =>
        setTimes(times, f.set).map((t) => {
          const fit = (b: number): string => (t.serial.q95 <= b ? "both" : t.parallel.q95 <= b ? "in parallel" : t.serial.median <= b ? "median only" : "no");
          return `| \`${f.corpus}\` | \`${f.guard}\` | ${f.k} | ${t.nodes} | ${ms(t.serial.median)} | ${ms(t.serial.q95)} | ${f3(t.serial.median / t.shared)} | ${ms(t.parallel.median)} | ${ms(t.parallel.q95)} | ${f3(t.parallel.median / t.shared)} | ${fit(16)} | ${fit(100)} |`;
        }),
      ),
      "",
      "A set fits a budget `both` when the q95 one after the other is in the budget, and `in parallel` when only the q95 in parallel is in it.",
      "",
    );
    data["times"] = Object.fromEntries([...per].map(([s, m]) => [s, Object.fromEntries(m)]));
    data["setTimes"] = fullSets.map((f) => ({ ...f, times: setTimes(times, f.set) }));
  }
  return { markdown: lines.join("\n"), data };
}

/** This function reads the lines of the time files. */
function readTimes(paths: readonly string[]): TimeRecord[] {
  return readRecords(paths) as unknown as TimeRecord[];
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const paths = (name: string): string[] => (opt(name) ?? "").split(",").filter((p) => p.length > 0);
  const report = portfolioReport(readRecords(paths("--exact")), readRecords(paths("--screen")), readTimes(paths("--time")));
  writeFileSync(opt("--out") ?? "portfolio.md", report.markdown + "\n");
  if (opt("--json")) writeFileSync(opt("--json")!, JSON.stringify(report.data, null, 1));
  console.log(report.markdown);
}
