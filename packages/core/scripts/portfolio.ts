// The command line of the portfolio (PORTFOLIO): `pnpm portfolio --exact <path,...> --screen <path,...> [--time <path,...>] [--optima <file>] [--out portfolio.md] [--json portfolio.json]`.
// A portfolio runs `shared` and k more strategies on an input, and keeps the output with the best guarded B1. Its score needs only the outputs.
// The script reads the records of the workflow `Screen` and the times of the workflow `Portfolio`, and writes the tables of `docs/research/PORTFOLIO.md`.
// It chooses each set of k strategies greedily on one half of the seeds and tests it on the other half.
// PORTFOLIO-RULE adds the forms with the rule of the caller: the portfolio chooses only among the runs that obey the rule, and measures against the oracle of that rule.
// The optima of `--optima` (default `src/bench/exact/optima-exact-v1.json`) give the gap closed at one cap for each run.
// EXACT-BOUNDS adds a form for each cap of the gap closed (1.1, 1.25 and 1.5), and the greedy sets of each rule and cap on all inputs.
// The script reads only records, so it runs locally in a few seconds. The screens and the times run in CI.
// The test `src/bench/screen/portfolio.test.ts` examines the functions of this file on a small set of records.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { quantile } from "../src/bench/measures/stats.ts";
import { GAP_CAPS, GAP_RULES, gapCap, gapClosed, optimumKey, type ExactOptimaFile, type ExactOptimum, type GapRule } from "../src/bench/screen/gap.ts";
import { RECORD_EPS } from "../src/bench/screen/hash.ts";
import { selectBest, type SelectCandidate, type SelectLevel } from "../src/bench/screen/portfolio-pick.ts";
import { PORTFOLIO_B1, portfolioB1Spec } from "../src/portfolio/key.ts";
import { B1, B10, B3_Q95, DECISION_BOARDS, familyOf, halfFolds, MIXED, pairedBootstrap, readRecords, type OracleRecord } from "./oracle.ts";
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
  /** This value is `true` when a shared segment of the run holds edges of two collections. Then the rule of the run is `all`. Only the runs of `exact-v1` have it. */
  readonly mixed?: boolean;
  /** The gap closed of each rule at the cap of the run. Only the runs of `exact-v1` have it. */
  readonly gaps?: Readonly<Partial<Record<GapRule, number>>>;
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

/** This function gives the name of the gap closed of the rule `rule` at the cap of the run, in a record of `exact-v1`. */
export const ruleGapName = (rule: GapRule): string => `${B10}.${rule}`;

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
      ...(m[MIXED] === undefined ? {} : { mixed: m[MIXED] === 1 }),
      ...(GAP_RULES.some((g) => m[ruleGapName(g)] !== undefined)
        ? { gaps: Object.fromEntries(GAP_RULES.flatMap((g) => (m[ruleGapName(g)] === undefined ? [] : [[g, m[ruleGapName(g)]!]]))) }
        : {}),
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
 * The rank is `selectBest` of the contract with the B1 level of the portfolio router (PORTFOLIO-FIT). Thus the router and this function make the same choice.
 * Of the runs within the `minEffect` of the best B1, the first name wins: the baseline, then the order of `set`.
 * It gives `undefined` when the input has no run of the baseline.
 */
export function choose(row: ReadonlyMap<string, Run>, set: readonly string[], guard: Guard, base: string = PORTFOLIO_BASE): string | undefined {
  const b = row.get(base);
  if (b === undefined) return undefined;
  const candidates: SelectCandidate[] = [{ id: base, values: { [PORTFOLIO_B1]: b.b1 } }];
  for (const s of set) {
    const r = row.get(s);
    if (r === undefined || s === base || !passes(r, b, guard)) continue;
    candidates.push({ id: s, values: { [PORTFOLIO_B1]: r.b1 } });
  }
  return selectBest(candidates, B1_LEVELS).winner;
}

/** The one level of the rank of `choose`: the B1 level of the key of the portfolio router. */
const B1_LEVELS: readonly SelectLevel[] = [{ id: PORTFOLIO_B1, spec: portfolioB1Spec() }];

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
 * The best single strategy of a split is the one with the best median of `singleBy` (default `value`) on its train inputs, with a value on `singleShare` of them (default 1).
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
    readonly singleBy?: ValueOf;
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
      const single = singleBest(table, sp.train, pool, o.singleBy ?? value, { minShare: o.singleShare ?? 1, ...(o.strict === undefined ? {} : { strict: o.strict }) });
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

/** The causes of a reversed pair: the two runs have the same rule and the same cap, the same rule and another cap, or another rule. */
export type ReversalCause = "same" | "cap" | "rule";

/** The rule of a run on `exact-v1`: `all` when a shared segment holds edges of two collections, else `collection`. */
export const ruleOf = (run: Run): GapRule => (run.mixed === true ? "all" : "collection");

/**
 * This function counts the pairs of `discordance` by cause. The cap of a run is the smallest cap at or above its stretch.
 * For one input, one rule and one cap, B10 is a linear map of B1 with a positive slope. Thus the cause `same` has no reversed pair.
 */
export function discordanceByCause(row: ReadonlyMap<string, Run>): Record<ReversalCause, { pairs: number; reversed: number }> {
  const out: Record<ReversalCause, { pairs: number; reversed: number }> = { same: { pairs: 0, reversed: 0 }, cap: { pairs: 0, reversed: 0 }, rule: { pairs: 0, reversed: 0 } };
  const runs = [...row.values()].filter((r) => r.b10 !== undefined);
  for (let a = 0; a < runs.length; a++)
    for (let b = a + 1; b < runs.length; b++) {
      const x = runs[a]!;
      const y = runs[b]!;
      const d1 = x.b1 - y.b1;
      const d10 = x.b10! - y.b10!;
      if (Math.abs(d1) <= RECORD_EPS || Math.abs(d10) <= RECORD_EPS) continue;
      const cause: ReversalCause = ruleOf(x) !== ruleOf(y) ? "rule" : gapCap(x.stretch ?? Infinity) !== gapCap(y.stretch ?? Infinity) ? "cap" : "same";
      out[cause].pairs++;
      if (Math.sign(d1) !== Math.sign(d10)) out[cause].reversed++;
    }
  return out;
}

/**
 * This function tells if a run obeys the rule of a caller. The rule is a parameter of the caller:
 * - `collection`: collections cannot mix. A run obeys when no shared segment holds edges of two collections.
 * - `all`: collections can mix. Each run obeys.
 */
export function obeys(run: Run, rule: GapRule): boolean {
  return rule === "all" || run.mixed !== true;
}

/** This function gives the run table with only the runs that obey the rule `rule`. The portfolio of the rule chooses only among these runs. */
export function ruleTable(table: RunTable, rule: GapRule): Map<string, Map<string, Run>> {
  return new Map([...table].map(([i, row]) => [i, new Map([...row].filter(([, r]) => obeys(r, rule)))]));
}

/** This function gives the gap closed of the rule `rule` at the cap of each run. A run that does not obey the rule has no value. */
export const ruleValue =
  (table: RunTable, rule: GapRule): ValueOf =>
  (input, strategy) => {
    const r = table.get(input)?.get(strategy);
    return r === undefined || !obeys(r, rule) ? undefined : r.gaps?.[rule];
  };

/**
 * This function gives the B1 of the baseline of each rule on each input, from the gap closed of the runs: `base = (b1 - g * optimum) / (1 - g)`.
 * It takes the median over the runs with `|1 - g|` of 0.5 or more, at the cap of each run. The records do not hold the baseline of `all`.
 */
export function ruleBaselines(table: RunTable, optima: readonly ExactOptimum[]): Map<string, Partial<Record<GapRule, number>>> {
  const opt = new Map(optima.map((o) => [optimumKey(o.input, o.rule, o.cap), o]));
  const out = new Map<string, Partial<Record<GapRule, number>>>();
  for (const [input, row] of table) {
    const bases: Partial<Record<GapRule, number>> = {};
    for (const rule of GAP_RULES) {
      const xs: number[] = [];
      for (const r of row.values()) {
        const g = r.gaps?.[rule];
        const cap = r.stretch === undefined ? undefined : gapCap(r.stretch);
        const o = cap === undefined ? undefined : opt.get(optimumKey(input, rule, cap));
        if (g === undefined || o === undefined || o.b1 === null || Math.abs(1 - g) < 0.5) continue;
        xs.push((r.b1 - g * o.b1) / (1 - g));
      }
      if (xs.length > 0) bases[rule] = quantile(xs, 0.5);
    }
    out.set(input, bases);
  }
  return out;
}

/**
 * This function gives the gap closed of the rule `rule` at the one cap `cap` for each run: `(b1 - base) / (the optimum at the cap - base)`.
 * A run with a stretch above the cap has no value. A run that does not obey the rule, or an input without a proven optimum at the cap, has no value.
 * The baseline `shared` is the fallback output of the portfolio. Thus it has a value at each cap, also when its own stretch is above the cap.
 * For one input, the value is a linear map of B1 with a positive slope. Thus the best B1 also has the best value.
 */
export function capValue(table: RunTable, rule: GapRule, cap: number, optima: readonly ExactOptimum[], bases: ReadonlyMap<string, Partial<Record<GapRule, number>>>): ValueOf {
  const opt = new Map(optima.filter((o) => o.rule === rule && Math.abs(o.cap - cap) <= 1e-9 && o.proven && o.b1 !== null).map((o) => [o.input, o.b1!]));
  return (input, strategy) => {
    const r = table.get(input)?.get(strategy);
    const o = opt.get(input);
    const base = bases.get(input)?.[rule];
    if (r === undefined || !obeys(r, rule) || o === undefined || base === undefined) return undefined;
    if (strategy !== PORTFOLIO_BASE && (r.stretch === undefined || r.stretch > cap + 1e-9)) return undefined;
    return gapClosed(r.b1, base, o);
  };
}

/** This function gives the value of a run when it passes the guard, else the value of the baseline on the same input. A missing run falls back too. */
export function fallbackValue(table: RunTable, value: ValueOf, guard: Guard): ValueOf {
  return (input, strategy) => {
    const row = table.get(input);
    const r = row?.get(strategy);
    const b = row?.get(PORTFOLIO_BASE);
    if (b === undefined) return undefined;
    return r !== undefined && (strategy === PORTFOLIO_BASE || passes(r, b, guard)) ? value(input, strategy) : value(input, PORTFOLIO_BASE);
  };
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

/** The one cap of the forms of PORTFOLIO-RULE: the largest cap of the gap closed. The guard `cap` already refuses each run above it. */
export const RULE_CAP = GAP_CAPS[GAP_CAPS.length - 1]!;

/** The caps of the forms at one cap (EXACT-BOUNDS): each cap of the gap closed, from small to large. */
export const RULE_CAPS: readonly number[] = GAP_CAPS;

/** The sizes of the greedy sets on all inputs of each rule and cap (EXACT-BOUNDS). The item PORTFOLIO-API builds a strategy from these sets. */
export const API_KS: readonly number[] = [3, 5, 8];

/**
 * This function gives the run table with only the runs at or below the cap `cap`. The portfolio of the cap chooses only among these runs.
 * A run without a stretch has no value at a cap, so it is not in the table. The baseline `shared` stays in the table as the fallback output, also above the cap.
 */
export function capTable(table: RunTable, cap: number): Map<string, Map<string, Run>> {
  return new Map([...table].map(([i, row]) => [i, new Map([...row].filter(([s, r]) => s === PORTFOLIO_BASE || (r.stretch !== undefined && r.stretch <= cap + 1e-9)))]));
}

/** One form of the portfolio of PORTFOLIO-RULE: the rule of the caller, and the cap of the value (`undefined` for the cap of each run). */
export interface RuleForm {
  readonly rule: GapRule;
  readonly cap?: number;
  readonly curve: readonly CurvePoint[];
  /** The best single strategy of each split. */
  readonly singles: readonly (string | undefined)[];
  /** The greedy sets on all inputs of the splits, for each size of `API_KS`. Only the forms at one cap have them. */
  readonly sets: readonly { readonly k: number; readonly set: readonly string[] }[];
  /** The inputs of the form. At one cap, an input counts only when the baseline has a gap closed there: the optimum at the cap is above the baseline of the rule. */
  readonly inputs: number;
}

/**
 * This function gives the Pareto curves of the forms of PORTFOLIO-RULE on `exact-v1`, with the guard `cap`.
 * For each rule, the portfolio chooses by B1 only among the runs that obey the rule. It measures the choice by the gap closed of that rule, against the oracle of that rule.
 * The value is at the cap of each run, and also at each cap of `caps` (default `RULE_CAPS`) when `optima` holds the optima.
 * At one cap, the portfolio chooses only among the runs at or below the cap (`capTable`).
 * The best single strategy of a split falls back to `shared` on an input where it fails the guard, the rule or the cap.
 * Each form at one cap also gets the greedy sets on all inputs of the splits, for each size of `apiKs` (default `API_KS`).
 */
export function ruleForms(
  table: RunTable,
  splits: readonly Split[],
  pool: readonly string[],
  optima: readonly ExactOptimum[] = [],
  o: { readonly ks?: readonly number[]; readonly full?: boolean; readonly caps?: readonly number[]; readonly apiKs?: readonly number[] } = {},
): RuleForm[] {
  const bases = optima.length > 0 ? ruleBaselines(table, optima) : new Map<string, Partial<Record<GapRule, number>>>();
  const forms: RuleForm[] = [];
  for (const rule of GAP_RULES) {
    const rt = ruleTable(table, rule);
    const values: { cap?: number; value: ValueOf }[] = [
      { value: ruleValue(table, rule) },
      ...(optima.length > 0 ? (o.caps ?? RULE_CAPS).map((cap) => ({ cap, value: capValue(table, rule, cap, optima, bases) })) : []),
    ];
    const all = [...new Set(splits.flatMap((sp) => [...sp.train, ...sp.test]))].sort();
    for (const v of values) {
      const ct = v.cap === undefined ? rt : capTable(rt, v.cap);
      const fb = fallbackValue(ct, v.value, "cap");
      const ok = (i: string): boolean => v.cap === undefined || fb(i, PORTFOLIO_BASE) !== undefined;
      const sp = splits.map((x) => ({ ...x, train: x.train.filter(ok), test: x.test.filter(ok) }));
      const mine = all.filter(ok);
      const curve = paretoCurve(ct, sp, pool, "cap", v.value, { singleBy: fb, singleOf: fb, full: o.full ?? true, ...(o.ks === undefined ? {} : { ks: o.ks }) });
      const singles = sp.map((x) => singleBest(ct, x.train, pool, fb, { minShare: 1 }));
      const sets = v.cap === undefined ? [] : (o.apiKs ?? API_KS).map((k) => ({ k, set: greedySet(ct, mine, pool, k, "cap", v.value) }));
      forms.push({ rule, ...(v.cap === undefined ? {} : { cap: v.cap }), curve, singles, sets, inputs: mine.length });
    }
  }
  return forms;
}

/** This function makes the tables of the portfolio for the records of `exact-v1` and of `screen-v1`, and the times of the workflow `Portfolio`. The optima give the forms at one cap. */
export function portfolioReport(exact: readonly OracleRecord[], screen: readonly OracleRecord[], times: readonly TimeRecord[] = [], optima: readonly ExactOptimum[] = []): PortfolioReport {
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
    let capCurve: CurvePoint[] = [];
    for (const guard of ["q95", "cap"] as const) {
      const curve = paretoCurve(table, splits, pool, guard, value, { full: true });
      if (guard === "cap") capCurve = curve;
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

    // PORTFOLIO-RULE: the reversed pairs by cause, and the portfolio with the rule of the caller.
    const causes = inputs.map((i) => discordanceByCause(table.get(i)!));
    const sum = (c: ReversalCause, f: "pairs" | "reversed"): number => causes.reduce((a, d) => a + d[c][f], 0);
    const causeText: Record<ReversalCause, string> = { same: "the same rule and the same cap", cap: "the same rule and another cap", rule: "another rule" };
    lines.push(
      "## `exact-v1`: the reversed pairs by cause (PORTFOLIO-RULE)",
      "",
      "| the two runs have | pairs | reversed | share |",
      "|---|---:|---:|---:|",
      ...(["same", "cap", "rule"] as const).map((c) => `| ${causeText[c]} | ${sum(c, "pairs")} | ${sum(c, "reversed")} | ${pct(sum(c, "reversed") / sum(c, "pairs"))} |`),
      "",
    );
    data["causes"] = Object.fromEntries((["same", "cap", "rule"] as const).map((c) => [c, { pairs: sum(c, "pairs"), reversed: sum(c, "reversed") }]));
    const forms = ruleForms(table, splits, pool, optima);
    const proven = (rule: GapRule, cap: number): number =>
      new Set(optima.filter((x) => x.rule === rule && Math.abs(x.cap - cap) <= 1e-9 && x.proven && x.b1 !== null).map((x) => x.input)).size;
    const capText = (f: { cap?: number }): string => (f.cap === undefined ? "the cap of each run" : `the cap ${f.cap}`);
    const kOf = (p: CurvePoint): string => (p.k >= pool.length ? `all ${pool.length - 1}` : String(p.k));
    const rows = [
      { name: "the old form", rule: "the rule of each run", cap: "the cap of each run", curve: capCurve },
      ...forms.map((f) => ({ name: f.cap === undefined ? "(input, rule)" : "(input, rule, cap)", rule: code(f.rule), cap: capText(f), curve: f.curve })),
    ];
    lines.push(
      "## `exact-v1`: the portfolio with the rule of the caller (PORTFOLIO-RULE)",
      "",
      `The guard is \`cap\`. At one cap, the portfolio chooses only among the runs at or below the cap. The inputs with a proven optimum at each cap: ${RULE_CAPS.map((c) => `${c}: ${GAP_RULES.map((r) => `${proven(r, c)} of ${inputs.length} for ${code(r)}`).join(", ")}`).join("; ")}.`,
      "",
      `| form | rule | cap | best single | oracle | oracle gain | ${[...PORTFOLIO_KS.map((k) => `k = ${k}`), "all"].join(" | ")} |`,
      `|---|---|---|---:|---:|---:|${[...PORTFOLIO_KS, 0].map(() => "---:").join("|")}|`,
      ...rows.map((r) => {
        const p0 = r.curve[0]!;
        const single = quantile(p0.single, 0.5);
        const orc = quantile(p0.oracle, 0.5);
        return `| ${r.name} | ${r.rule} | ${r.cap} | ${f3(single)} | ${f3(orc)} | ${f3(orc - single)} | ${r.curve.map((p) => pct(p.share)).join(" | ")} |`;
      }),
      "",
      ...forms.flatMap((f) => [
        `### The rule ${code(f.rule)} at ${capText(f)}`,
        "",
        `The best single strategy of each split: ${f.singles.map((x) => code(x ?? "-")).join(" and ")}.`,
        "",
        "| k | test inputs | portfolio median | best single | oracle | share of the oracle gain | share of each split | set of the first split | set of the second split |",
        "|---:|---:|---:|---:|---:|---:|---|---|---|",
        ...f.curve.map((p) => {
          const sets = p.k >= pool.length ? ["all", "all"] : p.sets.map(setText);
          return `| ${kOf(p)} | ${p.inputs.length} | ${f3(quantile(p.portfolio, 0.5))} | ${f3(quantile(p.single, 0.5))} | ${f3(quantile(p.oracle, 0.5))} | ${pct(p.share)} | ${p.shares.map(pct).join(" / ")} | ${sets[0]} | ${sets[1]} |`;
        }),
        "",
      ]),
    );
    const capForms = forms.filter((f) => f.cap !== undefined);
    if (capForms.length > 0)
      lines.push(
        "## `exact-v1`: the greedy sets of each rule and cap on all inputs (EXACT-BOUNDS)",
        "",
        "The greedy choice on all inputs, with the guard `cap`, for the rule and the cap of the caller. Each set also runs `shared`. The item PORTFOLIO-API builds a strategy from these sets.",
        "",
        "| rule | cap | inputs | k | oracle gain | set |",
        "|---|---:|---:|---:|---:|---|",
        ...capForms.flatMap((f) => {
          const p0 = f.curve[0]!;
          const gain = quantile(p0.oracle, 0.5) - quantile(p0.single, 0.5);
          return f.sets.map((x) => `| ${code(f.rule)} | ${f.cap} | ${f.inputs} | ${x.k} | ${f3(gain)} | ${setText(x.set)} |`);
        }),
        "",
      );
    data["ruleForms"] = forms;
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
      ...(["single", "shared"] as const).flatMap((against) => [
        against === "single"
          ? "The portfolio over the best single strategy on each board that decides, on the test inputs:"
          : "The portfolio over `shared` on each board that decides, on the test inputs:",
        "",
        `| k | ${DECISION_BOARDS.map(code).join(" | ")} | boards at 15% or more |`,
        `|---:|${DECISION_BOARDS.map(() => "---:").join("|")}|---:|`,
        ...curve.map((p) => {
          const byBoard = DECISION_BOARDS.map((b) => {
            const idx = p.inputs.map((i, n) => [i, n] as const).filter(([i]) => familyOf(i) === b);
            return idx.length === 0 ? Number.NaN : quantile(idx.map(([, n]) => p.portfolio[n]! / (against === "single" ? p.single[n]! : 1)), 0.5);
          });
          const kText = p.k >= pool.length ? `all ${pool.length - 1}` : String(p.k);
          return `| ${kText} | ${byBoard.map(f3).join(" | ")} | ${byBoard.filter((v) => v >= 1.15 - RECORD_EPS).length} of ${byBoard.filter((v) => !Number.isNaN(v)).length} |`;
        }),
        "",
      ]),
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
  const optimaPath = opt("--optima") ?? join(dirname(fileURLToPath(import.meta.url)), "../src/bench/exact/optima-exact-v1.json");
  const optima = optimaPath !== "none" && existsSync(optimaPath) ? (JSON.parse(readFileSync(optimaPath, "utf8")) as ExactOptimaFile).optima : [];
  const report = portfolioReport(readRecords(paths("--exact")), readRecords(paths("--screen")), readTimes(paths("--time")), optima);
  writeFileSync(opt("--out") ?? "portfolio.md", report.markdown + "\n");
  if (opt("--json")) writeFileSync(opt("--json")!, JSON.stringify(report.data, null, 1));
  console.log(report.markdown);
}
