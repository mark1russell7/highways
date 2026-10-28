// The command line of the report of the portfolio router (PORTFOLIO-API, PORTFOLIO-FIT):
// `pnpm portfolio:api --records <path,...> [--pool <path,...>] [--out portfolio-api.md] [--json portfolio-api.json]`.
// `--records` gives the records of the screen module `scripts/screens/portfolio-api.ts` on `exact-v1`, `exact-v1-bounds` or `screen-v1`.
// On the exact sets, the report compares the gap closed of each form with the offline choice of `portfolio-sets.ts`, the best single strategy and the oracle.
// On `screen-v1`, `--pool` gives the records of all strategies, and the report compares the guarded B1. Each report also gives the times.
// The column `differ` counts the inputs (train and test) where the winner of the router is not the offline choice. It must be 0.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { quantile } from "../src/bench/measures/stats.ts";
import { GAP_CAPS, GAP_RULES, type GapRule } from "../src/bench/screen/gap.ts";
import { PORTFOLIO_BANDS, portfolioBand, type PortfolioCap, type PortfolioRule } from "../src/portfolio/bands.ts";
import { portfolioMember } from "../src/portfolio/members.ts";
import { PORTFOLIO_BASE_MEMBER, portfolioMembers } from "../src/portfolio/router.ts";
import { formName, PORTFOLIO_VARIANTS, type PortfolioVariant } from "./screens/portfolio-api.ts";
import { B1, B3_Q95, MIXED, readRecords, type OracleRecord } from "./oracle.ts";
import { capTable, choose, fallbackValue, MODEL_STRETCH, oracleValue, passes, PORTFOLIO_BASE, ruleTable, shareOf, type Run, type RunTable } from "./portfolio.ts";
import { chooseSets, midValue, readOptima, readShortRuns, readTimes, runTableOf, TRAIN_SEEDS } from "./portfolio-sets.ts";

export { formName };

/** This function gives a trace measure of a record, from the screen module. */
const traceOf = (r: OracleRecord, key: string): number | undefined => (r as OracleRecord & { trace?: { measures?: Readonly<Record<string, number>> } }).trace?.measures?.[key];

/** This function tells if a variant cuts by the time budget. Its output depends on the machine, so the report does not count its `same-twice` break. */
const timed = (v: PortfolioVariant): boolean => v.options.budgetMs !== undefined;

/** This function gives the names of the members that the router runs on an input with `nodes` nodes, as `routePortfolio` gives them. */
function routerNames(nodes: number, rule: GapRule, cap: number, v: PortfolioVariant): string[] {
  const o = { rule: rule as PortfolioRule, cap: cap as PortfolioCap, ...(v.options.k === undefined ? {} : { k: v.options.k }) };
  return portfolioMembers(nodes, o).filter((name) => name === PORTFOLIO_BASE_MEMBER || (portfolioMember(name)?.maxNodes ?? Infinity) >= nodes);
}

const med = (xs: readonly (number | undefined)[]): number => quantile(xs.filter((x): x is number => x !== undefined && Number.isFinite(x)), 0.5);
const f3 = (v: number | undefined): string => (v === undefined || Number.isNaN(v) ? "-" : v.toFixed(3));
const f1 = (v: number | undefined): string => (v === undefined || Number.isNaN(v) ? "-" : v.toFixed(1));
const pct = (v: number | undefined): string => (v === undefined || Number.isNaN(v) ? "-" : `${(100 * v).toFixed(0)}%`);
const code = (s: string): string => `\`${s}\``;

/**
 * This function gives the run of a record, with the flag `hard` when it has more breaks of a hard rule than the record of `shared` on the same input.
 * With `ignore`, the rules of `ignore` do not count.
 */
function runOf(r: OracleRecord, shared: OracleRecord | undefined, ignore: readonly string[] = []): Run | undefined {
  const b1 = r.measures[B1];
  if (b1 === undefined || !Number.isFinite(b1)) return undefined;
  const hard = Object.entries(r.hard ?? {}).some(([k, n]) => !ignore.includes(k) && n > (shared?.hard?.[k] ?? 0)) ? 1 : 0;
  const stretch = r.measures[MODEL_STRETCH];
  const q95 = r.measures[B3_Q95];
  return { b1, ...(stretch === undefined ? {} : { stretch }), ...(q95 === undefined ? {} : { q95 }), mixed: r.measures[MIXED] === 1, hard: { hard } };
}

/** This function adds the runs of the forms to a run table. */
function addForms(table: Map<string, Map<string, Run>>, records: readonly OracleRecord[]): void {
  const shared = new Map(records.filter((r) => r.strategy === PORTFOLIO_BASE).map((r) => [r.input, r]));
  for (const r of records) {
    if (!r.strategy.startsWith("portfolio-") || r.skipped !== undefined) continue;
    const v = PORTFOLIO_VARIANTS.find((x) => r.strategy.endsWith(`-${x.id}`));
    const run = runOf(r, shared.get(r.input), v !== undefined && timed(v) ? ["same-twice"] : []);
    if (run === undefined) continue;
    if (!table.has(r.input)) table.set(r.input, new Map());
    table.get(r.input)!.set(r.strategy, run);
  }
}

/** One row of the times: the median, the q95 and the largest time of a form on the inputs of a band, and the median of `shared`. */
export interface TimeRow {
  readonly band: string;
  readonly form: string;
  readonly inputs: number;
  readonly median: number;
  readonly q95: number;
  readonly max: number;
  readonly shared: number;
  /** The share of the inputs where the budget cut one or more members. */
  readonly cut: number;
}

/** This function gives the times of the forms on each band, and of `shared`, from the records. A board above 40 nodes is in the band `n25-40`. */
export function timeRows(records: readonly OracleRecord[]): TimeRow[] {
  const groups = new Map<string, OracleRecord[]>();
  for (const r of records) {
    if (r.skipped !== undefined) continue;
    const nodes = (r as OracleRecord & { nodes?: number }).nodes ?? 0;
    const key = `${portfolioBand(nodes).id}|${r.strategy}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const ms = (r: OracleRecord): number => (r as OracleRecord & { ms?: number }).ms ?? Number.NaN;
  const q = (xs: readonly number[], p: number): number => quantile(xs.filter((x) => Number.isFinite(x)), p);
  const out: TimeRow[] = [];
  for (const band of PORTFOLIO_BANDS)
    for (const rule of GAP_RULES)
      for (const cap of GAP_CAPS)
        for (const v of PORTFOLIO_VARIANTS) {
          const rs = groups.get(`${band.id}|${formName(rule, cap, v.id)}`);
          if (rs === undefined) continue;
          const shared = groups.get(`${band.id}|${PORTFOLIO_BASE}`) ?? [];
          const t = rs.map(ms);
          const cut = rs.filter((r) => (traceOf(r, "portfolio.cut") ?? 0) > 0).length / rs.length;
          out.push({ band: band.id, form: formName(rule, cap, v.id), inputs: rs.length, median: q(t, 0.5), q95: q(t, 0.95), max: Math.max(...t), shared: q(shared.map(ms), 0.5), cut });
        }
  return out;
}

/** One row of the exact report: the medians of the gap closed of one form on the test seeds of one band. */
export interface ExactRow {
  readonly band: string;
  readonly rule: GapRule;
  readonly cap: number;
  /** The variant of the form: `k3`, `k5`, `k8`, `k5-b16`, `k5-b50`, `k5-b100` or `fit`. */
  readonly variant: string;
  readonly test: number;
  /** The medians of the gap closed: the form, the offline choice of the set, the best single strategy and the oracle. */
  readonly form: number;
  readonly offline: number;
  readonly single: number;
  readonly oracle: number;
  readonly share: number;
  readonly offlineShare: number;
  /** The medians of B1 of the form and of the best single strategy, on the same inputs. */
  readonly formB1: number;
  readonly singleB1: number;
  /**
   * The count of the inputs of the band (train and test) where the winner of the form is not the offline choice of the same members.
   * A budget variant has no count, because its members depend on the machine.
   */
  readonly differ: number | undefined;
  /** The count of the inputs of the band with a record of the form. */
  readonly inputs: number;
}

/**
 * This function gives the exact report: each form against the offline choice, the best single strategy and the oracle, on the test seeds.
 * The offline choice of a variant `k<n>` runs the first n names of the set. A budget variant has the offline choice of its k. The fit has the members of `fit.ts`.
 */
export function exactRows(records: readonly OracleRecord[]): ExactRow[] {
  const short = readShortRuns();
  const optima = readOptima();
  const choices = chooseSets(short, optima, { times: readTimes() });
  const table = runTableOf(short);
  addForms(table, records);
  const byForm = new Map(records.filter((r) => r.strategy.startsWith("portfolio-") && r.skipped === undefined).map((r) => [`${r.input}|${r.strategy}`, r]));
  const pool = [...short.strategies];
  const nodes = new Map(short.inputs.map((i) => [i.input, i] as const));
  const out: ExactRow[] = [];
  for (const c of choices) {
    const rt = ruleTable(table, c.rule);
    const ct = capTable(rt, c.cap);
    const value = midValue(table as RunTable, short, c.rule, c.cap, optima);
    const fb = fallbackValue(ct, value, "cap");
    const b1Of = (i: string, s: string): number | undefined => {
      const row = ct.get(i);
      const r = row?.get(s);
      const b = row?.get(PORTFOLIO_BASE);
      if (b === undefined) return undefined;
      return r !== undefined && (s === PORTFOLIO_BASE || passes(r, b, "cap")) ? r.b1 : b.b1;
    };
    const band = short.inputs.filter((i) => portfolioBand(i.nodes).id === c.band && fb(i.input, PORTFOLIO_BASE) !== undefined).map((i) => i.input);
    const test = band.filter((i) => nodes.has(i) && !TRAIN_SEEDS.includes(nodes.get(i)!.seed));
    for (const v of PORTFOLIO_VARIANTS) {
      const form = formName(c.rule, c.cap, v.id);
      const names = (i: string): string[] => routerNames(nodes.get(i)!.nodes, c.rule, c.cap, v);
      const offlineOf = (i: string): string | undefined => choose(ct.get(i)!, names(i).slice(1), "cap");
      const have = test.filter((i) => table.get(i)?.has(form) === true);
      if (have.length === 0) continue;
      const formV = have.map((i) => fb(i, form));
      const offline = have.map((i) => {
        const s = offlineOf(i);
        return s === undefined ? undefined : value(i, s);
      });
      const singleV = have.map((i) => (c.single === undefined ? undefined : fb(i, c.single)));
      const oracleV = have.map((i) => oracleValue(i, pool, value));
      const all = band.filter((i) => byForm.has(`${i}|${form}`));
      const differ = timed(v)
        ? undefined
        : all.filter((i) => {
            const s = offlineOf(i);
            const won = traceOf(byForm.get(`${i}|${form}`)!, "portfolio.winner-index");
            return s === undefined || won === undefined || names(i)[won] !== s;
          }).length;
      const [fm, om, sm, orm] = [med(formV), med(offline), med(singleV), med(oracleV)];
      out.push({
        band: c.band,
        rule: c.rule,
        cap: c.cap,
        variant: v.id,
        test: have.length,
        form: fm,
        offline: om,
        single: sm,
        oracle: orm,
        share: shareOf(fm, sm, orm),
        offlineShare: shareOf(om, sm, orm),
        formB1: med(have.map((i) => b1Of(i, form))),
        singleB1: med(have.map((i) => (c.single === undefined ? undefined : b1Of(i, c.single)))),
        differ,
        inputs: all.length,
      });
    }
  }
  return out;
}

/** One row of the report on `screen-v1`: the guarded B1 of one form against `shared`, the best single strategy and the oracle of the pool. */
export interface ScreenRow {
  readonly rule: GapRule;
  readonly cap: number;
  readonly variant: string;
  readonly inputs: number;
  readonly shared: number;
  readonly form: number;
  readonly single: number;
  readonly singleName: string | undefined;
  readonly oracle: number;
  readonly share: number;
  /** The count of the inputs where the form has more hard breaks than `shared`. It must be 0. */
  readonly harder: number;
}

/**
 * This function gives the report on `screen-v1`. The records of `screen-v1` have no stretch of the model and no flag of mixed collections.
 * So the pool has the guard of `PORTFOLIO.md` on `screen-v1`: no more hard breaks than `shared`, and a B3 q95 not above that of `shared`.
 * A run that fails the guard has the B1 of `shared`. The router applies its own key, so its value is the B1 of its output.
 * Thus the pool has a looser rule than the router, and its best single strategy and its oracle are the same for each form.
 */
export function screenRows(records: readonly OracleRecord[], poolRecords: readonly OracleRecord[]): ScreenRow[] {
  const table = new Map<string, Map<string, Run>>();
  const shared = new Map(poolRecords.filter((r) => r.strategy === PORTFOLIO_BASE).map((r) => [r.input, r]));
  for (const r of poolRecords) {
    if (r.skipped !== undefined) continue;
    const run = runOf(r, shared.get(r.input));
    if (run === undefined) continue;
    if (!table.has(r.input)) table.set(r.input, new Map());
    table.get(r.input)!.set(r.strategy, run);
  }
  addForms(table, records);
  const pool = [...new Set(poolRecords.map((r) => r.strategy))];
  const out: ScreenRow[] = [];
  const value = (i: string, s: string): number | undefined => table.get(i)?.get(s)?.b1;
  const guarded = fallbackValue(table, value, "q95");
  const fb = (i: string, s: string): number | undefined => (s.startsWith("portfolio-") ? value(i, s) : guarded(i, s));
  const inputs = [...table.keys()].filter((i) => table.get(i)!.has(PORTFOLIO_BASE));
  for (const rule of GAP_RULES)
    for (const cap of GAP_CAPS) {
      let single: { s: string; m: number } | undefined;
      for (const s of pool.sort()) {
        const m = med(inputs.map((i) => fb(i, s)));
        if (single === undefined || m > single.m + 1e-9) single = { s, m };
      }
      for (const v of PORTFOLIO_VARIANTS) {
        const form = formName(rule, cap, v.id);
        const have = inputs.filter((i) => table.get(i)?.has(form) === true);
        if (have.length === 0) continue;
        const f = med(have.map((i) => fb(i, form)));
        const s = med(have.map((i) => (single === undefined ? undefined : fb(i, single.s))));
        const o = med(have.map((i) => oracleValue(i, pool, (x, y) => fb(x, y))));
        const harder = have.filter((i) => table.get(i)!.get(form)!.hard["hard"] === 1).length;
        out.push({ rule, cap, variant: v.id, inputs: have.length, shared: med(have.map((i) => fb(i, PORTFOLIO_BASE))), form: f, single: s, singleName: single?.s, oracle: o, share: shareOf(f, s, o), harder });
      }
    }
  return out;
}

/** This function writes the report as Markdown. */
export function apiReport(exact: readonly ExactRow[], screen: readonly ScreenRow[], times: readonly TimeRow[]): string {
  const lines: string[] = [];
  if (exact.length > 0)
    lines.push(
      "## The gap closed of the portfolio router on the test seeds (5 to 9)",
      "",
      "The column `offline` is the choice of `portfolio-sets.ts` from the records of the members. The column `differ` counts the inputs of the band (train and test) where the router has another winner.",
      "",
      `The count \`differ\` is ${exact.reduce((n, r) => n + (r.differ ?? 0), 0)} on ${exact.filter((r) => r.differ !== undefined).reduce((n, r) => n + r.inputs, 0)} records of the forms without a budget.`,
      "",
      "| band | rule | cap | variant | test | router | offline | best single | oracle | router share | offline share | router B1 | single B1 | differ |",
      "|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
      ...exact.map(
        (r) =>
          `| ${r.band} | ${code(r.rule)} | ${r.cap} | ${r.variant} | ${r.test} | ${f3(r.form)} | ${f3(r.offline)} | ${f3(r.single)} | ${f3(r.oracle)} | ${pct(r.share)} | ${pct(r.offlineShare)} | ${f3(r.formB1)} | ${f3(r.singleB1)} | ${r.differ ?? "-"} of ${r.inputs} |`,
      ),
      "",
    );
  if (screen.length > 0)
    lines.push(
      "## The guarded B1 of the portfolio router on `screen-v1`",
      "",
      "| rule | cap | variant | inputs | `shared` | router | best single | oracle | share | more hard breaks |",
      "|---|---|---|---:|---:|---:|---:|---:|---:|---:|",
      ...screen.map((r) => `| ${code(r.rule)} | ${r.cap} | ${r.variant} | ${r.inputs} | ${f3(r.shared)} | ${f3(r.form)} | ${f3(r.single)} (${r.singleName === undefined ? "-" : code(r.singleName)}) | ${f3(r.oracle)} | ${pct(r.share)} | ${r.harder} |`),
      "",
    );
  if (times.length > 0)
    lines.push(
      "## The time of the portfolio router",
      "",
      "| band | form | inputs | median ms | q95 ms | max ms | `shared` median ms | inputs with a cut |",
      "|---|---|---:|---:|---:|---:|---:|---:|",
      ...times.map((t) => `| ${t.band} | ${code(t.form)} | ${t.inputs} | ${f1(t.median)} | ${f1(t.q95)} | ${f1(t.max)} | ${f1(t.shared)} | ${pct(t.cut)} |`),
      "",
    );
  return lines.join("\n");
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const list = (name: string): string[] => (opt(name) ?? "").split(",").filter((x) => x.length > 0);
  const records = readRecords(list("--records"));
  const pool = list("--pool");
  const exact = records.some((r) => r.input.startsWith("exact-")) ? exactRows(records.filter((r) => r.input.startsWith("exact-"))) : [];
  const screen = pool.length > 0 ? screenRows(records.filter((r) => r.input.startsWith("screen-")), readRecords(pool)) : [];
  const times = timeRows(records);
  const md = apiReport(exact, screen, times);
  const out = opt("--out");
  if (out) writeFileSync(out, md);
  else process.stdout.write(md);
  const json = opt("--json");
  if (json) writeFileSync(json, JSON.stringify({ exact, screen, times }, null, 2));
}
