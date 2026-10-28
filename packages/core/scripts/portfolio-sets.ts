// The command line of the sets of the portfolio router (PORTFOLIO-API, PORTFOLIO-FIT):
// `pnpm portfolio:sets [--records <path,...>] [--runs <file>] [--time <path,...> --time-source <id>] [--sets <file>] [--fit <file>] [--out portfolio-sets.md] [--json portfolio-sets.json]`.
// The script chooses the greedy set of each rule, cap and size band, and writes them to `src/portfolio/sets.ts`.
// With `--time`, it reads the times of the members from the workflow `Portfolio` (`portfolio:time --members`), and writes the summary of the times (`TIMES_PATH`).
// Without `--time`, it reads that summary. The greedy pool of a band has only the members that take 50 ms or less with the key on their output. The fit goes to `src/portfolio/fit.ts`.
// With `--records`, it reads the records of the workflow `Screen` on `exact-v1` and `exact-v1-bounds`, and writes the short table of the runs (`--runs`).
// Without `--records`, it reads the short table of the runs. The test `src/portfolio/sets.test.ts` checks that `src/portfolio/sets.ts` is current.
// With `--large`, it adds the records of `portfolio:time --guard-records` to the short table (PORTFOLIO-SPEED). Those boards have more than 40 nodes and no optima.
// There the value of a run is its B1 under the guard, and the oracle is the best member of the pool (`LARGE_SET`).
// With `--setup-time <path,...> --setup-source <id>`, it keeps the times of the members, and takes the times of the setup of the key from other lines (`withSetup`).
// Each band splits its seeds: the seeds 0 to 4 choose the set, and the seeds 5 to 9 test it. The script reads only records, so it runs locally in a few seconds.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { quantile } from "../src/bench/measures/stats.ts";
import { gapInterval, optimumInterval } from "../src/bench/screen/bounds.ts";
import { GAP_BASELINES, GAP_CAPS, GAP_RULES, type ExactOptimaFile, type ExactOptimum, type GapRule } from "../src/bench/screen/gap.ts";
import { PORTFOLIO_BANDS, PORTFOLIO_KS_API, portfolioBand, type PortfolioBand } from "../src/portfolio/bands.ts";
import { KEY_SETUP, type TimeRecord } from "./portfolio-time.ts";
import { B1, MIXED, readRecords, type OracleRecord } from "./oracle.ts";
import { capTable, choose, fallbackValue, greedySet, MODEL_STRETCH, oracleValue, PORTFOLIO_BASE, portfolioValues, ruleTable, shareOf, singleBest, type Run, type RunTable, type ValueOf } from "./portfolio.ts";

/** The name of the run of the baseline of each rule in the records: `shared` for `collection`, and `hw:shared-ways-all` for `all`. */
export const BASE_RUNS: Readonly<Record<GapRule, string>> = { collection: GAP_BASELINES.collection, all: `hw:${GAP_BASELINES.all}` };

/** The largest cap of the gap closed. A run above it has no value at any cap, so the short table does not keep it. */
const TOP_CAP = GAP_CAPS[GAP_CAPS.length - 1]!;

/** One input of the short table: its id, size and seed, the B1 of the baseline of each rule, and its runs. */
export interface ShortInput {
  readonly input: string;
  readonly nodes: number;
  readonly seed: number;
  readonly base: Readonly<Partial<Record<GapRule, number>>>;
  /** Each run: the index of the strategy, B1, the stretch of the model, 1 when it mixes collections, and 1 when it has more hard breaks than `shared`. */
  readonly runs: readonly (readonly [number, number, number, number, number])[];
}

/** The short table of the runs (`portfolio-runs/1`): the values that the choice of the sets reads, from the records of CI. */
export interface ShortRuns {
  readonly schema: "portfolio-runs/1";
  /** The CI runs of the records. */
  readonly sources: readonly string[];
  readonly strategies: readonly string[];
  readonly inputs: readonly ShortInput[];
}

const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/**
 * This function gives the short table of the runs of records. It keeps `shared`, and each run at or below the largest cap.
 * A run with more breaks of a hard rule than `shared` on the same input gets the flag `hard`. The numbers keep 6 decimals.
 */
export function shortRuns(records: readonly OracleRecord[], sources: readonly string[]): ShortRuns {
  const byInput = new Map<string, OracleRecord[]>();
  for (const r of records) {
    if (r.skipped !== undefined) continue;
    if (!byInput.has(r.input)) byInput.set(r.input, []);
    byInput.get(r.input)!.push(r);
  }
  const strategies = [...new Set(records.map((r) => r.strategy))].sort();
  const index = new Map(strategies.map((s, i) => [s, i]));
  const inputs: ShortInput[] = [];
  for (const input of [...byInput.keys()].sort()) {
    const rs = byInput.get(input)!;
    const shared = rs.find((r) => r.strategy === PORTFOLIO_BASE);
    if (shared === undefined) continue;
    const base: Partial<Record<GapRule, number>> = {};
    for (const rule of GAP_RULES) {
      const b = rs.find((r) => r.strategy === BASE_RUNS[rule])?.measures[B1];
      if (b !== undefined && Number.isFinite(b)) base[rule] = r6(b);
    }
    const runs: [number, number, number, number, number][] = [];
    for (const r of rs) {
      const b1 = r.measures[B1];
      const stretch = r.measures[MODEL_STRETCH];
      if (b1 === undefined || !Number.isFinite(b1) || stretch === undefined) continue;
      if (r.strategy !== PORTFOLIO_BASE && stretch > TOP_CAP + 1e-9) continue;
      const hard = Object.entries(r.hard ?? {}).some(([k, n]) => n > (shared.hard?.[k] ?? 0)) ? 1 : 0;
      runs.push([index.get(r.strategy)!, r6(b1), r6(stretch), r.measures[MIXED] === 1 ? 1 : 0, hard]);
    }
    runs.sort((a, b) => a[0] - b[0]);
    const nodes = (rs[0] as OracleRecord & { nodes?: number }).nodes ?? 0;
    inputs.push({ input, nodes, seed: rs[0]!.seed, base, runs });
  }
  return { schema: "portfolio-runs/1", sources, strategies, inputs };
}

/** This function gives the run table of a short table. A run with the flag `hard` gets one break of the rule `hard`, so the guard `cap` refuses it. */
export function runTableOf(short: ShortRuns): Map<string, Map<string, Run>> {
  const table = new Map<string, Map<string, Run>>();
  for (const i of short.inputs) {
    const row = new Map<string, Run>();
    for (const [s, b1, stretch, mixed, hard] of i.runs) row.set(short.strategies[s]!, { b1, stretch, mixed: mixed === 1, hard: { hard } });
    table.set(i.input, row);
  }
  return table;
}

/** The set of the boards above 40 nodes (PORTFOLIO-SPEED): the boards of `exact-v1` at larger sizes, without optima. Its inputs have the id `exact-large/...`. */
export const LARGE_SET = "exact-large";

/**
 * This function adds the inputs of the short table `extra` to the short table `short`. An input of `short` does not change.
 * A strategy that `short` does not have goes at the end of its list, so the index of each run of `short` stays the same.
 */
export function mergeShortRuns(short: ShortRuns, extra: ShortRuns): ShortRuns {
  const strategies = [...short.strategies, ...extra.strategies.filter((s) => !short.strategies.includes(s))];
  const index = new Map(strategies.map((s, i) => [s, i]));
  const have = new Set(short.inputs.map((i) => i.input));
  const inputs = [
    ...short.inputs,
    ...extra.inputs
      .filter((i) => !have.has(i.input))
      .map((i) => ({ ...i, runs: i.runs.map(([s, ...rest]) => [index.get(extra.strategies[s]!)!, ...rest] as const).sort((a, b) => a[0] - b[0]) })),
  ];
  return { schema: short.schema, sources: [...short.sources, ...extra.sources.filter((s) => !short.sources.includes(s))], strategies, inputs };
}

/**
 * This function gives the gap closed of the rule `rule` at the cap `cap` for each run: the midpoint of its interval over the interval of the optimum, as `BOUNDS.md` gives it.
 * A run with a stretch above the cap has no value, and under `collection` a run that mixes collections has no value.
 * The baseline `shared` is the fallback output, so it has a value at each cap, also above the cap.
 * At a proven optimum, the interval has a width of 0, so the midpoint is the gap closed itself.
 * An input of `LARGE_SET` has no optimum. There the value is the B1 of the run, with the same guard. The share of the oracle gain does not change with the scale of the value.
 */
export function midValue(table: RunTable, short: ShortRuns, rule: GapRule, cap: number, optima: readonly ExactOptimum[]): ValueOf {
  const opt = new Map(optima.filter((o) => o.rule === rule && Math.abs(o.cap - cap) <= 1e-9).flatMap((o) => (optimumInterval(o) ? [[o.input, optimumInterval(o)!] as const] : [])));
  const base = new Map(short.inputs.map((i) => [i.input, i.base[rule]]));
  return (input, strategy) => {
    const r = table.get(input)?.get(strategy);
    if (r === undefined) return undefined;
    if (rule === "collection" && r.mixed === true) return undefined;
    if (strategy !== PORTFOLIO_BASE && (r.stretch === undefined || r.stretch > cap + 1e-9)) return undefined;
    if (input.startsWith(`${LARGE_SET}/`)) return r.b1;
    const o = opt.get(input);
    const b = base.get(input);
    if (o === undefined || b === undefined) return undefined;
    return gapInterval(r.b1, b, o)?.mid;
  };
}

/** The time budget of one route of the portfolio router on the CI runner, in ms. A member that takes more alone at the top size of a band is not in the pool of the band. */
export const BAND_BUDGET_MS = 50;

/**
 * The target of the model of the time of the fit, in ms: the sum of the medians of the base, the setup of the key, and each member with the key on its output.
 * Without a margin, it is `BAND_BUDGET_MS`. A margin below it covers the noise between two CI runs (FIT-COST).
 */
export const FIT_TARGET_MS = 45;

/** The summary of the times of the members (`portfolio-times/2`): the median time of each strategy at each size on the CI runner. */
export interface MemberTimes {
  readonly schema: "portfolio-times/2";
  /** The CI run of the times. */
  readonly source: string;
  readonly sizes: readonly number[];
  /**
   * The median time of the route of each strategy alone at each node count, in ms, with 2 decimals.
   * The time of `@key-setup` builds the network of the stretch and reads the facts of the output of `shared`.
   * A size without a time is a size that the strategy skipped: above its node limit, or after a size where it was slow.
   */
  readonly ms: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /**
   * The median time of the key of the router on the output of each strategy, at each node count, in ms, with 2 decimals (FIT-COST).
   * The key is the guard with the facts of the output, the B1 and the hash. For `shared`, it is the B1 and the hash.
   */
  readonly keyMs: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

/** This function gives the summary of the times of the lines of `portfolio:time --members`: the median over the boards of the median over the repeats. */
export function memberTimes(records: readonly TimeRecord[], source: string): MemberTimes {
  const runs = new Map<string, [number, number][]>();
  const skipped = new Set<string>();
  for (const r of records) {
    const size = `${r.strategy}|${r.nodes}`;
    if (r.skipped !== undefined) {
      skipped.add(size);
      continue;
    }
    const board = `${size}|${r.cls}|${r.seed}`;
    if (!runs.has(board)) runs.set(board, []);
    runs.get(board)!.push([r.ms, r.keyMs ?? 0]);
  }
  const boards = new Map<string, [number, number][]>();
  for (const [board, xs] of runs) {
    const size = board.split("|").slice(0, 2).join("|");
    if (!boards.has(size)) boards.set(size, []);
    boards.get(size)!.push([quantile(xs.map((x) => x[0]), 0.5), quantile(xs.map((x) => x[1]), 0.5)]);
  }
  const ms: Record<string, Record<string, number>> = {};
  const keyMs: Record<string, Record<string, number>> = {};
  const r2 = (v: number): number => Math.round(v * 100) / 100;
  for (const [size, xs] of [...boards].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (skipped.has(size)) continue;
    const [strategy, nodes] = size.split("|") as [string, string];
    (ms[strategy] ??= {})[nodes] = r2(quantile(xs.map((x) => x[0]), 0.5));
    if (strategy !== KEY_SETUP) (keyMs[strategy] ??= {})[nodes] = r2(quantile(xs.map((x) => x[1]), 0.5));
  }
  const sizes = [...new Set(records.map((r) => r.nodes))].sort((a, b) => a - b);
  return { schema: "portfolio-times/2", source, sizes, ms, keyMs };
}

/** This function gives the cost of a strategy in the router at `nodes` nodes: its route alone and the key on its output. A size without a time gives `undefined`. */
export function costIn(times: MemberTimes, strategy: string, nodes: number): number | undefined {
  const t = times.ms[strategy]?.[String(nodes)];
  return t === undefined ? undefined : t + (times.keyMs?.[strategy]?.[String(nodes)] ?? 0);
}

/**
 * This function gives the summary `times` with the times of the setup of the key (`KEY_SETUP`) of the summary `setup` (PORTFOLIO-SPEED).
 * A change of the setup does not change the time of a member, so the members keep their times. The source names both runs.
 */
export function withSetup(times: MemberTimes, setup: MemberTimes): MemberTimes {
  const at = setup.ms[KEY_SETUP];
  if (at === undefined) throw new Error(`The times of the run ${setup.source} have no lines of ${KEY_SETUP}.`);
  return { ...times, source: `${times.source}, with the setup of the key from ${setup.source}`, ms: { ...times.ms, [KEY_SETUP]: at } };
}

/** This function gives the sizes of the times that fall in a band. The last band also has the sizes above its `maxNodes`. */
function bandSizes(times: MemberTimes, band: PortfolioBand, bands: readonly PortfolioBand[]): number[] {
  const i = bands.findIndex((b) => b.id === band.id);
  const lo = i <= 0 ? 0 : bands[i - 1]!.maxNodes;
  const last = i === bands.length - 1;
  return times.sizes.filter((n) => n > lo && (last || n <= band.maxNodes));
}

/**
 * This function tells if a strategy takes `BAND_BUDGET_MS` or less at the top size of the band, at or below `maxNodes`, with the key on its output (`costIn`).
 * A strategy without a time there does not.
 */
export function fastIn(times: MemberTimes, strategy: string, band: PortfolioBand, bands: readonly PortfolioBand[] = PORTFOLIO_BANDS): boolean {
  const sizes = bandSizes(times, band, bands).filter((n) => n <= band.maxNodes);
  if (sizes.length === 0) return false;
  const t = costIn(times, strategy, Math.max(...sizes));
  return t !== undefined && t <= BAND_BUDGET_MS;
}

/**
 * This function gives the fit of a set in a band: the members of the default of the router, each with its node limit.
 * At each size of the band, the prefix of the set runs while the model time stays at or below `FIT_TARGET_MS`.
 * The model time is the base, plus the setup of the key with the first member, plus each member. Each strategy counts its route alone and the key on its output (`costIn`).
 * A member leaves at the first size where it is not in the prefix. Its node limit is the last size where it is in the prefix. A member with no such size is not in the fit.
 */
export function fitOf(set: readonly string[], times: MemberTimes, band: PortfolioBand, bands: readonly PortfolioBand[] = PORTFOLIO_BANDS): [string, number][] {
  const alive = new Set(set);
  const limit = new Map<string, number>();
  for (const n of bandSizes(times, band, bands)) {
    const at = (s: string): number | undefined => (s === KEY_SETUP ? times.ms[s]?.[String(n)] : costIn(times, s, n));
    let total = at(PORTFOLIO_BASE) ?? Infinity;
    let open = true;
    for (const [j, s] of set.entries()) {
      const t = at(s);
      const add = t === undefined ? Infinity : t + (j === 0 ? (at(KEY_SETUP) ?? Infinity) : 0);
      if (!open || !alive.has(s) || total + add > FIT_TARGET_MS) {
        open = false;
        alive.delete(s);
        continue;
      }
      total += add;
      limit.set(s, n);
    }
  }
  return set.filter((s) => limit.has(s)).map((s) => [s, limit.get(s)!]);
}

/** The seeds that choose the sets. The other seeds (5 to 9) test them. */
export const TRAIN_SEEDS: readonly number[] = [0, 1, 2, 3, 4];

/** The test of one set on the test inputs of one band, rule and cap. */
export interface SetTest {
  readonly k: number;
  readonly set: readonly string[];
  /** The medians over the test inputs: the portfolio, the best single strategy of the train inputs, and the oracle. */
  readonly portfolio: number;
  readonly single: number;
  readonly oracle: number;
  /** The share of the oracle gain: `(portfolio - single) / (oracle - single)`. */
  readonly share: number;
  /** The count of the test inputs where the base `shared` wins, because no member of the set passes the guard with more B1. */
  readonly baseWins: number;
  /** The share of the set of the band up to 12 nodes, on the same test inputs. Only the larger bands have it. */
  readonly smallShare?: number;
  readonly smallPortfolio?: number;
  /** The share of the oracle gain of the set on its own train inputs (in sample). */
  readonly trainShare: number;
}

/** The choice of one band, rule and cap: the set of up to 8 strategies, the best single strategy, and the test of each k. */
export interface BandChoice {
  readonly band: string;
  readonly rule: GapRule;
  readonly cap: number;
  readonly train: number;
  readonly test: number;
  readonly single: string | undefined;
  /** The greedy set of the largest k on the train inputs. The set of a smaller k is its first k strategies. */
  readonly set: readonly string[];
  readonly tests: readonly SetTest[];
  /** The median gap closed of the base `shared` on the test inputs. */
  readonly base: number;
  /** The members of the pool that take more than `BAND_BUDGET_MS` in the band, with the key on their output. They are not in the pool of the greedy choice. */
  readonly slow: readonly string[];
  /** With the times: the fit of the set (`fitOf`), and its test on the test inputs. */
  readonly fit?: { readonly members: readonly (readonly [string, number])[]; readonly test: SetTest };
}

/**
 * This function chooses the greedy sets of each band, rule and cap on the train inputs, and tests them on the test inputs.
 * The choice has the guard `cap`: a run with more hard breaks than `shared` does not count. The value is the gap closed of `midValue`.
 * An input counts at a cap only when the baseline `shared` has a value there.
 * The best single strategy has the best median on the train inputs. On an input where it fails the guard, the rule or the cap, it falls back to `shared`.
 * With the times `o.times`, the pool of a band has only the timed strategies that pass `fastIn`, and each choice gets its fit.
 */
export function chooseSets(
  short: ShortRuns,
  optima: readonly ExactOptimum[],
  o: { readonly bands?: readonly PortfolioBand[]; readonly ks?: readonly number[]; readonly times?: MemberTimes } = {},
): BandChoice[] {
  const bands = o.bands ?? PORTFOLIO_BANDS;
  const ks = o.ks ?? PORTFOLIO_KS_API;
  const kMax = Math.max(...ks);
  const table = runTableOf(short);
  const pool = [...short.strategies];
  const out: BandChoice[] = [];
  for (const rule of GAP_RULES) {
    const rt = ruleTable(table, rule);
    for (const cap of GAP_CAPS) {
      const value = midValue(table, short, rule, cap, optima);
      const ct = capTable(rt, cap);
      const fb = fallbackValue(ct, value, "cap");
      const ok = (i: string): boolean => fb(i, PORTFOLIO_BASE) !== undefined;
      const sets = new Map<string, readonly string[]>();
      for (const band of bands) {
        const mine = short.inputs.filter((i) => portfolioBand(i.nodes, bands).id === band.id && ok(i.input));
        const train = mine.filter((i) => TRAIN_SEEDS.includes(i.seed)).map((i) => i.input);
        const test = mine.filter((i) => !TRAIN_SEEDS.includes(i.seed)).map((i) => i.input);
        const times = o.times;
        const bandPool = times === undefined ? pool : pool.filter((s) => s === PORTFOLIO_BASE || fastIn(times, s, band, bands));
        const slow = times === undefined ? [] : pool.filter((s) => s !== PORTFOLIO_BASE && times.ms[s] !== undefined && !bandPool.includes(s));
        const set = greedySet(ct, train, bandPool, kMax, "cap", value);
        sets.set(band.id, set);
        const single = singleBest(ct, train, pool, fb, { minShare: 1 });
        const med = (xs: readonly (number | undefined)[]): number => quantile(xs.filter((x): x is number => x !== undefined), 0.5);
        const singleMed = med(test.map((i) => (single === undefined ? undefined : fb(i, single))));
        const oracleMed = med(test.map((i) => oracleValue(i, pool, value)));
        const small = sets.get(bands[0]!.id);
        const trainSingle = med(train.map((i) => (single === undefined ? undefined : fb(i, single))));
        const trainOracle = med(train.map((i) => oracleValue(i, pool, value)));
        const testOf = (k: number, s: readonly string[]): SetTest => {
          const p = med(portfolioValues(ct, test, s, "cap", value));
          const baseWins = test.filter((i) => choose(ct.get(i)!, s, "cap") === PORTFOLIO_BASE).length;
          const trainShare = shareOf(med(portfolioValues(ct, train, s, "cap", value)), trainSingle, trainOracle);
          const t: SetTest = { k, set: s, portfolio: p, single: singleMed, oracle: oracleMed, share: shareOf(p, singleMed, oracleMed), baseWins, trainShare };
          if (band.id === bands[0]!.id || small === undefined) return t;
          const sp = med(portfolioValues(ct, test, small.slice(0, k), "cap", value));
          return { ...t, smallPortfolio: sp, smallShare: shareOf(sp, singleMed, oracleMed) };
        };
        const tests = ks.map((k) => testOf(k, set.slice(0, k)));
        const base = med(test.map((i) => fb(i, PORTFOLIO_BASE)));
        const choice: BandChoice = { band: band.id, rule, cap, train: train.length, test: test.length, single, set, tests, base, slow };
        if (times === undefined) out.push(choice);
        else {
          const members = fitOf(set, times, band, bands);
          out.push({ ...choice, fit: { members, test: testOf(members.length, members.map(([s]) => s)) } });
        }
      }
    }
  }
  return out;
}

/** This function writes the source of `src/portfolio/sets.ts` from the choices. The file is data: the key is `<rule>|<cap>|<band>`. */
export function setsSource(choices: readonly BandChoice[], sources: readonly string[]): string {
  const lines = [
    "// This file is generated by `scripts/portfolio-sets.ts` (`pnpm portfolio:sets`). Do not edit it. The test `sets.test.ts` checks that it is current.",
    `// The records come from the CI runs ${sources.join(", ")}.`,
    'import type { PortfolioCap, PortfolioRule } from "./bands.ts";',
    "",
    "/**",
    " * The greedy set of each rule, cap and size band, by the key `<rule>|<cap>|<band>`. The set of k strategies is the first k names.",
    " * Each set comes from the train seeds (0 to 4) of its band. The base `shared` is not in a set: the portfolio always runs it first.",
    " */",
    "export const PORTFOLIO_SETS: Readonly<Record<`${PortfolioRule}|${PortfolioCap}|${string}`, readonly string[]>> = {",
    ...choices.map((c) => `  "${c.rule}|${c.cap}|${c.band}": [${c.set.map((s) => JSON.stringify(s)).join(", ")}],`),
    "};",
    "",
  ];
  return lines.join("\n");
}

/** This function writes the source of `src/portfolio/fit.ts` from the choices with a fit. The key is `<rule>|<cap>|<band>`. */
export function fitSource(choices: readonly BandChoice[], source: string): string {
  const lines = [
    "// This file is generated by `scripts/portfolio-sets.ts` (`pnpm portfolio:sets`). Do not edit it. The test `sets.test.ts` checks that it is current.",
    `// The times come from the CI run ${source} (the workflow \`Portfolio\`, \`portfolio:time --members\`).`,
    'import type { PortfolioCap, PortfolioRule } from "./bands.ts";',
    "",
    "/**",
    " * The fit of each rule, cap and size band, by the key `<rule>|<cap>|<band>`: the members of the default of the portfolio router, in their order.",
    ` * Each member has a node limit: it runs only on an input with that many nodes or fewer. The limits keep the model time at or below ${FIT_TARGET_MS} ms.`,
    " * The base `shared` is not in a fit: the portfolio always runs it first.",
    " */",
    "export const PORTFOLIO_FIT: Readonly<Record<`${PortfolioRule}|${PortfolioCap}|${string}`, readonly (readonly [string, number])[]>> = {",
    ...choices.map((c) => `  "${c.rule}|${c.cap}|${c.band}": [${(c.fit?.members ?? []).map(([s, n]) => `[${JSON.stringify(s)}, ${n}]`).join(", ")}],`),
    "};",
    "",
  ];
  return lines.join("\n");
}

const f3 = (v: number | undefined): string => (v === undefined || Number.isNaN(v) ? "-" : v.toFixed(3));
const pct = (v: number | undefined): string => (v === undefined || Number.isNaN(v) ? "-" : `${(100 * v).toFixed(0)}%`);
const code = (s: string): string => `\`${s}\``;

/** This function writes the tables of the choices as Markdown: the keep-rate of each band, rule, cap and k on the test seeds. */
export function setsReport(choices: readonly BandChoice[], ks: readonly number[] = PORTFOLIO_KS_API): string {
  const lines = [
    "## The share of the oracle gain on the test seeds (5 to 9)",
    "",
    "Each set comes from the seeds 0 to 4 of its band. The column `10-node set` applies the set of the band up to 12 nodes to the same test inputs.",
    "",
    "The column `base wins` counts the test inputs where the base `shared` wins at the middle k.",
    "",
    `| band | rule | cap | train | test | base | best single | oracle | ${ks.map((k) => `k = ${k} | 10-node set k = ${k}`).join(" | ")} | base wins |`,
    `|---|---|---:|---:|---:|---:|---:|---:|${ks.map(() => "---:|---:").join("|")}|---:|`,
    ...choices.map((c) => {
      const t0 = c.tests[0]!;
      return `| ${c.band} | ${code(c.rule)} | ${c.cap} | ${c.train} | ${c.test} | ${f3(c.base)} | ${f3(t0.single)} | ${f3(t0.oracle)} | ${c.tests.map((t) => `${pct(t.share)} | ${pct(t.smallShare)}`).join(" | ")} | ${c.tests[Math.floor(c.tests.length / 2)]!.baseWins} of ${c.test} |`;
    }),
    "",
    "## The share of the oracle gain on the train seeds (0 to 4, in sample)",
    "",
    `| band | rule | cap | train | ${ks.map((k) => `k = ${k}`).join(" | ")} |`,
    `|---|---|---:|---:|${ks.map(() => "---:").join("|")}|`,
    ...choices.map((c) => `| ${c.band} | ${code(c.rule)} | ${c.cap} | ${c.train} | ${c.tests.map((t) => pct(t.trainShare)).join(" | ")} |`),
    "",
    "## The sets",
    "",
    "| band | rule | cap | best single of the train seeds | set |",
    "|---|---|---:|---|---|",
    ...choices.map((c) => `| ${c.band} | ${code(c.rule)} | ${c.cap} | ${c.single === undefined ? "-" : code(c.single)} | ${c.set.map(code).join(", ")} |`),
    "",
  ];
  if (choices.some((c) => c.fit !== undefined))
    lines.push(
      "## The fit of the default",
      "",
      `Each member runs up to its node limit. The model time of the fit is at or below ${FIT_TARGET_MS} ms. The column \`slow\` counts the members that take more than ${BAND_BUDGET_MS} ms in the band, with the key on their output.`,
      "",
      "| band | rule | cap | slow | members (node limit) | share at the fit | share at k = 5 |",
      "|---|---|---:|---:|---|---:|---:|",
      ...choices.map(
        (c) =>
          `| ${c.band} | ${code(c.rule)} | ${c.cap} | ${c.slow.length} | ${(c.fit?.members ?? []).map(([s, n]) => `${code(s)} (${n})`).join(", ") || "the base alone"} | ${pct(c.fit?.test.share)} | ${pct(c.tests.find((t) => t.k === 5)?.share)} |`,
      ),
      "",
    );
  return lines.join("\n");
}

const here = dirname(fileURLToPath(import.meta.url));
/** The default paths: the short table of the runs, the file of the sets and the files of the optima. */
export const RUNS_PATH = join(here, "data/portfolio-runs.json.gz");
export const SETS_PATH = join(here, "../src/portfolio/sets.ts");
export const FIT_PATH = join(here, "../src/portfolio/fit.ts");
export const TIMES_PATH = join(here, "data/portfolio-times.json");

/** This function reads the summary of the times of the members. */
export function readTimes(path: string = TIMES_PATH): MemberTimes {
  return JSON.parse(readFileSync(path, "utf8")) as MemberTimes;
}
export const OPTIMA_PATHS: readonly string[] = [join(here, "../src/bench/exact/optima-exact-v1.json"), join(here, "../src/bench/exact/optima-exact-v1-bounds.json")];

/** This function reads the short table of the runs: a JSON file in gzip. */
export function readShortRuns(path: string = RUNS_PATH): ShortRuns {
  return JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as ShortRuns;
}

/** This function reads the optima of `exact-v1` and `exact-v1-bounds`. */
export function readOptima(paths: readonly string[] = OPTIMA_PATHS): ExactOptimum[] {
  return paths.flatMap((f) => (JSON.parse(readFileSync(f, "utf8")) as ExactOptimaFile).optima);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const paths = (name: string): string[] => (opt(name) ?? "").split(",").filter((p) => p.length > 0);
  const runsPath = opt("--runs") ?? RUNS_PATH;
  const records = paths("--records");
  let short: ShortRuns;
  if (records.length > 0) {
    short = shortRuns(readRecords(records), paths("--sources"));
    writeFileSync(runsPath, gzipSync(JSON.stringify(short), { level: 9 }));
  } else {
    if (!existsSync(runsPath)) throw new Error(`There is no short table of the runs at ${runsPath}. Give --records.`);
    short = readShortRuns(runsPath);
  }
  const large = paths("--large");
  if (large.length > 0) {
    short = mergeShortRuns(short, shortRuns(readRecords(large), paths("--large-sources")));
    writeFileSync(runsPath, gzipSync(JSON.stringify(short), { level: 9 }));
  }
  const timePaths = paths("--time");
  let times: MemberTimes;
  if (timePaths.length > 0) {
    const lines = timePaths.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as TimeRecord));
    times = memberTimes(lines, opt("--time-source") ?? "local");
    writeFileSync(TIMES_PATH, JSON.stringify(times, null, 1) + "\n");
  } else times = readTimes();
  const setupPaths = paths("--setup-time");
  if (setupPaths.length > 0) {
    const lines = setupPaths.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as TimeRecord));
    times = withSetup(times, memberTimes(lines, opt("--setup-source") ?? "local"));
    writeFileSync(TIMES_PATH, JSON.stringify(times, null, 1) + "\n");
  }
  const choices = chooseSets(short, readOptima(), { times });
  writeFileSync(opt("--sets") ?? SETS_PATH, setsSource(choices, short.sources));
  writeFileSync(opt("--fit") ?? FIT_PATH, fitSource(choices, times.source));
  const md = setsReport(choices);
  writeFileSync(opt("--out") ?? "portfolio-sets.md", md + "\n");
  if (opt("--json")) writeFileSync(opt("--json")!, JSON.stringify(choices, null, 1));
  console.log(md);
  console.log(`The short table has ${short.inputs.length} inputs and ${short.strategies.length} strategies.`);
}
