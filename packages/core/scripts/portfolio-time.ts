// The time of each strategy of the portfolio (PORTFOLIO): `pnpm portfolio:time [--sizes 10,24,40] [--seeds 0,1,2] [--repeats 5] [--slow 2000] [--members] [--stop 250] [--shard 0/8] --out time.jsonl`.
// The script routes the small boards of `exact-v1` at each size with each strategy of the gap screen (`scripts/screens/meas2.ts`) and each built-in router.
// It writes one line for each timed run: the strategy, the board, the time of the route and the time of the score of the portfolio (B1, B3 q95 and the hard rules).
// A run slower than `--slow` ms gets no more repeats. Start it only in CI, with the workflow `Portfolio`, because the times of a busy machine are not true.
// With `--members` (PORTFOLIO-FIT), the script times the members of the portfolio router (`MEMBER_FORMS`) instead, and the key of the router on each output (`keyMs`).
// The key is `portfolioKey` as the router calls it (FIT-COST): the guard with the facts of the output, the B1 and the hash (`hashMs`).
// Then each board also gets one line of the strategy `@key-setup`: the time to build the network of the stretch and to read the facts of the output of `shared`.
// After a size where the median time of a strategy is above `--stop` ms, the strategy skips the larger sizes.
// With `--breakdown` (PORTFOLIO-SPEED), the script times the parts of the setup of the key and the router on each board instead (`breakdownLines`).
// Then `--shard` splits the boards, not the strategies. `pnpm portfolio:time --summary <path,...>` writes the table of such lines, and times nothing.
// With `--breakdown`, `--forms fit` or `--forms k3` keeps only the forms of the router with that end of the id.
// With `--member-cost` (FIT-COST), the script times each member in the router (`costLines`): its run and the key of its output, with k = 8 at each rule and cap.
// On the same board, it also times each member alone and the key of its output alone. `--summary` writes the ratios of such lines (`costSummary`).
// With `--check-stretch`, the script times nothing. It routes each input of `exact-v1`, `exact-v1-bounds` and `screen-v1` with each strategy of the pool.
// Then it compares the stretch of each edge of `exactStretches` with the stretch of `exactStretchesReference` (`stretchCheck`). The summary counts each difference above `RECORD_EPS`.
// With `--guard-records`, the script times nothing. It routes the boards of `exact-v1` at the sizes `--sizes` with each member of the portfolio router (`guardRecord`).
// Each line is a record with the values of the guard: B1, the stretch of the model, the flag of mixed collections and the hard breaks. The sizes above 40 nodes have no optima.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { bundleStretch, inkSaved } from "../src/bench/measures/bundles.ts";
import { B1, MIXED, type OracleRecord } from "./oracle.ts";
import { MODEL_STRETCH } from "./portfolio.ts";
import { exactStretches, exactStretchesReference } from "../src/bench/exact/index.ts";
import { quantile } from "../src/bench/measures/stats.ts";
import { checkProperties } from "../src/bench/properties.ts";
import { mixedSegments } from "../src/bench/screen/gap.ts";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { RECORD_EPS } from "../src/bench/screen/hash.ts";
import { SCREEN_SETS, screenInputs } from "../src/bench/screen/set.ts";
import { EXACT_CLASSES, exactBoard, type ExactClass } from "../src/bench/screen/exact-set.ts";
import { MEMBER_FORMS, portfolioMember } from "../src/portfolio/members.ts";
import { portfolioBand } from "../src/portfolio/bands.ts";
import { portfolioFacts, portfolioKey } from "../src/portfolio/key.ts";
import { PORTFOLIO_BASE_MEMBER, routePortfolio, type PortfolioRouterOptions } from "../src/portfolio/router.ts";
import type { Graph, Result } from "../src/model.ts";
import { STRATEGIES } from "../src/strategies/builtins.ts";
import { asRouter, getStrategy, listStrategies, type Strategy } from "../src/strategies/model.ts";
import { strategies as gapStrategies } from "./screens/meas2.ts";

/** One timed run of a strategy on a board. */
export interface TimeRecord {
  readonly strategy: string;
  readonly cls: string;
  readonly seed: number;
  readonly nodes: number;
  readonly edges: number;
  readonly rep: number;
  /** The time of the route, in ms. */
  readonly ms: number;
  /** The time of the score of the portfolio on the output, in ms: B1, B3 q95 against `corners`, and the hard rules. */
  readonly scoreMs: number;
  /**
   * With `--members`: the time of the key of the portfolio router on the output, in ms: the guard with the facts of the output, the B1 and the hash.
   * The network of the stretch and the facts of the base are already built. For the base `shared`, the guard is 0 at once, as in the router.
   */
  readonly keyMs?: number;
  /** With `--members`: the time of the hash of the output, in ms. It is a part of `keyMs`. */
  readonly hashMs?: number;
  readonly skipped?: string;
}

/** The name of the lines of the setup of the key: the network of the stretch, and the facts of the output of `shared`. */
export const KEY_SETUP = "@key-setup";

/** The time of the key of the router on one output, in ms, and the part of the hash. */
export interface KeyTime {
  readonly keyMs: number;
  readonly hashMs: number;
}

/**
 * This function gives a timer of the key of the router on the graph `graph`, against the output `base` of `shared` (FIT-COST).
 * It builds the network of the stretch and the facts of the base first, as the router does before the second member.
 * The timer calls the key as the router does: the guard, the B1 and the hash. With `isBase`, the output is the base, so the guard is 0 at once.
 */
export function keyTimer(graph: Graph, base: Result): (result: Result, isBase: boolean) => KeyTime {
  const key = portfolioKey(graph, "collection", 1.5, () => base);
  // An output of `shared` that is not `base` itself builds the network and the facts of the base.
  key.hard(graph, asRouter(portfolioMember(PORTFOLIO_BASE_MEMBER)!).route(graph));
  return (result, isBase) => {
    const k = isBase ? portfolioKey(graph, "collection", 1.5, () => result) : key;
    const t = performance.now();
    k.hard(graph, result);
    for (const level of k.levels) level.value(graph, result);
    const h = performance.now();
    k.hash!(result);
    const end = performance.now();
    return { keyMs: end - t, hashMs: end - h };
  };
}

/** This function gives the members of the portfolio router, in the order of `MEMBER_FORMS`. */
export function memberStrategies(): Strategy<"router", object>[] {
  return Object.keys(MEMBER_FORMS).map((name) => portfolioMember(name)!);
}

/** This function gives the strategies of the pool: the built-in routers, then the strategies of the gap screen, without a second copy of a name. */
export function poolStrategies(): Strategy<"router", object>[] {
  const all = [...listStrategies(STRATEGIES, "router"), ...gapStrategies] as Strategy<"router", object>[];
  return all.filter((s, i) => all.findIndex((t) => t.name === s.name) === i);
}

/** The parts of the setup of the key in the lines of `--breakdown`: the network of the stretch, the shortest ways, the hard rules and the mixed segments of the base. */
export const SETUP_PARTS = ["@setup-network", "@setup-dist", "@setup-hard", "@setup-mixed"] as const;

/** The forms of the router in the lines of `--breakdown`: the default (the fit) and k = 3, at each rule and cap. */
export const BREAKDOWN_FORMS: readonly { readonly id: string; readonly options: PortfolioRouterOptions }[] = (["collection", "all"] as const).flatMap((rule) =>
  ([1.1, 1.25, 1.5] as const).flatMap((cap) => [
    { id: `${rule}-${cap}-fit`, options: { rule, cap } },
    { id: `${rule}-${cap}-k3`, options: { rule, cap, k: 3 } },
  ]),
);

/** One line of `--breakdown`: one part of the setup, or one pick of the router, on one board. */
export interface BreakdownRecord {
  /** `@shared`, a part of `SETUP_PARTS`, or `@router:<rule>-<cap>-<form>`. */
  readonly part: string;
  readonly cls: string;
  readonly seed: number;
  readonly nodes: number;
  readonly edges: number;
  readonly rep: number;
  readonly ms: number;
  /** For a pick: the run of the base, the runs of the other members, and the count of the members that ran. The rest of `ms` is the key and the pick. */
  readonly baseMs?: number;
  readonly membersMs?: number;
  readonly members?: number;
}

/**
 * This function times the parts of the setup of the key, and each form of the router, on one board (`--breakdown`).
 * Each repeat builds the setup from nothing. A pick slower than `slow` ms gets no more repeats.
 */
export function breakdownLines(
  head: { readonly cls: string; readonly seed: number; readonly graph: Graph },
  repeats: number,
  slow: number,
  forms: readonly { readonly id: string; readonly options: PortfolioRouterOptions }[] = BREAKDOWN_FORMS,
): BreakdownRecord[] {
  const { graph } = head;
  const at = { cls: head.cls, seed: head.seed, nodes: graph.nodes.length, edges: graph.edges.length };
  const shared = asRouter(portfolioMember("shared")!);
  const out: BreakdownRecord[] = [];
  shared.route(graph);
  for (let rep = 0; rep < repeats; rep++) {
    let t = performance.now();
    const base = shared.route(graph);
    out.push({ part: "@shared", ...at, rep, ms: performance.now() - t });
    t = performance.now();
    const stretches = exactStretches(graph);
    const network = performance.now() - t;
    t = performance.now();
    stretches(base.routes);
    const dist = performance.now() - t;
    t = performance.now();
    checkProperties(graph, base, 1_000_000);
    const hard = performance.now() - t;
    t = performance.now();
    mixedSegments(graph, base);
    const mixed = performance.now() - t;
    [network, dist, hard, mixed].forEach((ms, i) => out.push({ part: SETUP_PARTS[i]!, ...at, rep, ms }));
    if (network + dist > slow) break;
  }
  for (const form of forms) {
    for (let rep = 0; rep < repeats; rep++) {
      const t = performance.now();
      const r = routePortfolio(graph, form.options);
      const ms = performance.now() - t;
      const ran = r.trace.members.filter((m) => m.status === "ran");
      const baseMs = ran[0]?.ms ?? 0;
      const membersMs = ran.slice(1).reduce((sum, m) => sum + (m.ms ?? 0), 0);
      out.push({ part: `@router:${form.id}`, ...at, rep, ms, baseMs, membersMs, members: ran.length });
      if (ms > slow) break;
    }
  }
  return out;
}

/**
 * This function writes the table of the lines of `--breakdown` as Markdown. Each cell is the median over the boards of the median over the repeats, in ms.
 * The share of the setup is the setup over the pick of k = 3 under `collection` at 1.5. The key and the pick are the rest of that pick after the runs.
 */
export function breakdownSummary(lines: readonly BreakdownRecord[]): string {
  const sizes = [...new Set(lines.map((l) => l.nodes))].sort((a, b) => a - b);
  const med = (part: string, n: number, f: (l: BreakdownRecord) => number = (l) => l.ms): number | undefined => {
    const boards = new Map<string, number[]>();
    for (const l of lines) {
      if (l.part !== part || l.nodes !== n) continue;
      const k = `${l.cls}|${l.seed}`;
      if (!boards.has(k)) boards.set(k, []);
      boards.get(k)!.push(f(l));
    }
    const xs = [...boards.values()].map((v) => quantile(v, 0.5));
    return xs.length === 0 ? undefined : quantile(xs, 0.5);
  };
  const f1 = (v: number | undefined): string => (v === undefined ? "-" : v.toFixed(1));
  const pct = (v: number | undefined): string => (v === undefined || !Number.isFinite(v) ? "-" : `${(100 * v).toFixed(0)}%`);
  const k3 = "@router:collection-1.5-k3";
  const out = [
    "## The parts of the setup of the key (median ms)",
    "",
    `| nodes | \`shared\` | ${SETUP_PARTS.map((p) => `\`${p}\``).join(" | ")} | setup | k = 3 | key and pick in k = 3 | share of the setup |`,
    `|---:|---:|${SETUP_PARTS.map(() => "---:").join("|")}|---:|---:|---:|---:|`,
  ];
  for (const n of sizes) {
    const parts = SETUP_PARTS.map((p) => med(p, n));
    const setup = parts.every((p) => p !== undefined) ? parts.reduce((a, b) => a! + b!, 0)! : undefined;
    const pick = med(k3, n);
    const key = med(k3, n, (l) => l.ms - (l.baseMs ?? 0) - (l.membersMs ?? 0));
    out.push(`| ${n} | ${f1(med("@shared", n))} | ${parts.map(f1).join(" | ")} | ${f1(setup)} | ${f1(pick)} | ${f1(key)} | ${pct(setup === undefined || pick === undefined ? undefined : setup / pick)} |`);
  }
  // The q95 of a pick is over each timed pick of the size: each board and each repeat.
  const q95 = (part: string, n: number): number | undefined => {
    const xs = lines.filter((l) => l.part === part && l.nodes === n).map((l) => l.ms);
    return xs.length === 0 ? undefined : quantile(xs, 0.95);
  };
  out.push(
    "",
    "## The router (median ms, q95 ms, and the median count of the members that ran)",
    "",
    `| form | ${sizes.join(" | ")} |`,
    `|---|${sizes.map(() => "---:").join("|")}|`,
  );
  for (const form of BREAKDOWN_FORMS) {
    const part = `@router:${form.id}`;
    if (!lines.some((l) => l.part === part)) continue;
    out.push(`| \`${form.id}\` | ${sizes.map((n) => `${f1(med(part, n))}, ${f1(q95(part, n))} (${f1(med(part, n, (l) => l.members ?? 0))})`).join(" | ")} |`);
  }
  return out.join("\n") + "\n";
}

/** The forms of the router in the lines of `--member-cost` (FIT-COST): k = 8 at each rule and cap, so each member of each set runs. */
export const COST_FORMS: readonly { readonly id: string; readonly options: PortfolioRouterOptions }[] = (["collection", "all"] as const).flatMap((rule) =>
  ([1.1, 1.25, 1.5] as const).map((cap) => ({ id: `${rule}-${cap}-k8`, options: { rule, cap, k: 8 as const } })),
);

/** One line of `--member-cost` (FIT-COST). */
export interface CostRecord {
  /**
   * The kind of the line:
   * - `setup`: the setup of the key (the network of the stretch and the facts of the base)
   * - `alone`: a member alone, then the key on its output alone
   * - `router`: a member in a pick of the router
   * - `pick`: one whole pick of the router.
   */
  readonly kind: "setup" | "alone" | "router" | "pick";
  /** The member. A line of the setup has `@key-setup`, and a line of a pick has the id of the form. */
  readonly strategy: string;
  readonly form?: string;
  /** In the router: the place of the member in the pick. The base is 0. The key of the member at 1 also builds the setup. */
  readonly index?: number;
  readonly cls: string;
  readonly seed: number;
  readonly nodes: number;
  readonly edges: number;
  readonly rep: number;
  /** The time of the run of the member, of the setup or of the pick, in ms. */
  readonly runMs: number;
  /** The time of the key on the output of the member, in ms. In the router, it is the time from the end of the run to the start of the next member. */
  readonly keyMs: number;
  /** For `alone`: the part of the hash in `keyMs`. */
  readonly hashMs?: number;
  /** For `pick`: the count of the members that ran, with the base. */
  readonly members?: number;
}

/**
 * This function times each member in the router and alone on one board (`--member-cost`, FIT-COST).
 * - The setup of the key gets `repeats` lines.
 * - Each member of a form of `COST_FORMS` runs alone, then the key of the router runs on its output (`keyTimer`).
 * - Each form runs in the router with a clock that keeps each read. The contract reads the clock before and after each run, so the gap after a run is the key of its output.
 * A run or a pick slower than `slow` ms gets no more repeats.
 */
export function costLines(head: { readonly cls: string; readonly seed: number; readonly graph: Graph }, repeats: number, slow: number): CostRecord[] {
  const { graph } = head;
  const at = { cls: head.cls, seed: head.seed, nodes: graph.nodes.length, edges: graph.edges.length };
  const out: CostRecord[] = [];
  const base = asRouter(portfolioMember(PORTFOLIO_BASE_MEMBER)!).route(graph);
  for (let rep = 0; rep < repeats; rep++) {
    const t = performance.now();
    portfolioFacts(graph)(base);
    out.push({ kind: "setup", strategy: KEY_SETUP, ...at, rep, runMs: performance.now() - t, keyMs: 0 });
  }
  // The first pick of each form warms the code of each member, and gives the names of the members.
  const forms = COST_FORMS.map((form) => ({ form, names: routePortfolio(graph, form.options).members }));
  const timer = keyTimer(graph, base);
  for (const name of [...new Set(forms.flatMap((f) => f.names))]) {
    const router = asRouter(portfolioMember(name)!);
    for (let rep = 0; rep < repeats; rep++) {
      const t = performance.now();
      const result = router.route(graph);
      const runMs = performance.now() - t;
      out.push({ kind: "alone", strategy: name, ...at, rep, runMs, ...timer(result, name === PORTFOLIO_BASE_MEMBER) });
      if (runMs > slow) break;
    }
  }
  for (const { form } of forms) {
    for (let rep = 0; rep < repeats; rep++) {
      const reads: number[] = [];
      const now = (): number => {
        const x = performance.now();
        reads.push(x);
        return x;
      };
      const t = performance.now();
      const r = routePortfolio(graph, { ...form.options, now });
      const ms = performance.now() - t;
      const ran = r.trace.members.filter((m) => m.status !== "cut");
      out.push({ kind: "pick", strategy: form.id, form: form.id, ...at, rep, runMs: ms, keyMs: 0, members: ran.length });
      // The reads: the start, then two reads for each member that is not cut, then the end.
      let j = 1;
      r.trace.members.forEach((m, index) => {
        if (m.status === "cut") return;
        const runMs = reads[j + 1]! - reads[j]!;
        const keyMs = reads[j + 2]! - reads[j + 1]!;
        j += 2;
        if (m.status === "ran") out.push({ kind: "router", strategy: m.id, form: form.id, index, ...at, rep, runMs, keyMs });
      });
      if (ms > slow) break;
    }
  }
  return out;
}

/** One row of `costRows`: the medians of one member at one node count, in ms. */
export interface CostRow {
  readonly strategy: string;
  readonly nodes: number;
  readonly band: string;
  /** The run alone. */
  readonly alone: number;
  /** The key of the router on the output alone, and its part of the hash. */
  readonly key: number;
  readonly hash: number;
  /** The run and the key in the router. For the member at 1, the setup of the board is subtracted. */
  readonly router: number;
}

/** This function gives the median over the boards of the median over the lines of each board, for each group. */
function medianOf<T>(lines: readonly T[], group: (l: T) => string, board: (l: T) => string, value: (l: T) => number): Map<string, number> {
  const by = new Map<string, Map<string, number[]>>();
  for (const l of lines) {
    const g = group(l);
    if (!by.has(g)) by.set(g, new Map());
    const m = by.get(g)!;
    const b = board(l);
    if (!m.has(b)) m.set(b, []);
    m.get(b)!.push(value(l));
  }
  return new Map([...by].map(([g, m]) => [g, quantile([...m.values()].map((xs) => quantile(xs, 0.5)), 0.5)]));
}

const boardOf = (l: CostRecord): string => `${l.cls}|${l.seed}|${l.nodes}`;

/** This function gives the median setup of each board of the lines of `--member-cost`. */
function setupOf(lines: readonly CostRecord[]): Map<string, number> {
  return medianOf(
    lines.filter((l) => l.kind === "setup"),
    boardOf,
    () => "",
    (l) => l.runMs,
  );
}

/** This function gives the rows of the lines of `--member-cost`: each member other than the base, at each node count with lines in the router. */
export function costRows(lines: readonly CostRecord[]): CostRow[] {
  const setup = setupOf(lines);
  const sn = (l: CostRecord): string => `${l.strategy}|${l.nodes}`;
  const alone = lines.filter((l) => l.kind === "alone");
  const inRouter = lines.filter((l) => l.kind === "router" && l.strategy !== PORTFOLIO_BASE_MEMBER);
  const run = medianOf(alone, sn, boardOf, (l) => l.runMs);
  const key = medianOf(alone, sn, boardOf, (l) => l.keyMs);
  const hash = medianOf(alone, sn, boardOf, (l) => l.hashMs ?? 0);
  const router = medianOf(inRouter, sn, boardOf, (l) => l.runMs + l.keyMs - (l.index === 1 ? (setup.get(boardOf(l)) ?? 0) : 0));
  const rows: CostRow[] = [];
  for (const [g, r] of [...router].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const a = run.get(g);
    const k = key.get(g);
    if (a === undefined || k === undefined) continue;
    const [strategy, n] = g.split("|") as [string, string];
    const nodes = Number(n);
    rows.push({ strategy, nodes, band: portfolioBand(nodes).id, alone: a, key: k, hash: hash.get(g) ?? 0, router: r });
  }
  return rows;
}

/** One pick of the router against the model of the fit (`costPicks`). */
export interface CostPick {
  readonly form: string;
  readonly nodes: number;
  readonly band: string;
  readonly ms: number;
  /** The model with the key: the base and its key, the setup, and each member and its key, from the medians alone on the same board. */
  readonly model: number;
  /** The model without the key of each output: the base, the setup and each member. */
  readonly runs: number;
}

/** This function compares each pick of the lines of `--member-cost` with the model of the fit on the same board. */
export function costPicks(lines: readonly CostRecord[]): CostPick[] {
  const setup = setupOf(lines);
  const sb = (l: CostRecord): string => `${l.strategy}|${boardOf(l)}`;
  const alone = lines.filter((l) => l.kind === "alone");
  const run = medianOf(alone, sb, () => "", (l) => l.runMs);
  const key = medianOf(alone, sb, () => "", (l) => l.keyMs);
  const members = new Map<string, string[]>();
  for (const l of lines) {
    if (l.kind !== "router") continue;
    const k = `${l.form}|${boardOf(l)}|${l.rep}`;
    if (!members.has(k)) members.set(k, []);
    members.get(k)!.push(l.strategy);
  }
  const out: CostPick[] = [];
  for (const l of lines) {
    if (l.kind !== "pick") continue;
    const b = boardOf(l);
    const names = members.get(`${l.form}|${b}|${l.rep}`) ?? [];
    const runs = names.reduce((sum, s) => sum + (run.get(`${s}|${b}`) ?? NaN), 0) + (names.length > 1 ? (setup.get(b) ?? NaN) : 0);
    const model = runs + names.reduce((sum, s) => sum + (key.get(`${s}|${b}`) ?? NaN), 0);
    if (Number.isFinite(model)) out.push({ form: l.form!, nodes: l.nodes, band: portfolioBand(l.nodes).id, ms: l.runMs, model, runs });
  }
  return out;
}

/**
 * This function writes the table of the lines of `--member-cost` as Markdown (FIT-COST). For each band, it gives:
 * - the medians of the run alone, the key alone, the hash and the cost in the router, over the members and the node counts
 * - the ratio of the cost in the router to the run alone, and to the run and the key alone: the median, with the q10 and the q90
 * - the ratio of each pick to the model of the fit, with the key and without it.
 */
export function costSummary(lines: readonly CostRecord[]): string {
  const rows = costRows(lines);
  const picks = costPicks(lines);
  const f1 = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : "-");
  const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : "-");
  const spread = (xs: readonly number[]): string => (xs.length === 0 ? "-" : `${f2(quantile(xs, 0.5))} (${f2(quantile(xs, 0.1))} to ${f2(quantile(xs, 0.9))})`);
  const low = (band: string): number => Number(band.slice(1).split("-")[0]);
  const bands = [...new Set([...rows.map((r) => r.band), ...picks.map((p) => p.band)])].sort((a, b) => low(a) - low(b));
  const out = [
    "## The cost of each member in the router (FIT-COST)",
    "",
    "Each row is one member at one node count. The values are medians over the boards, in ms. A ratio gives the median over the rows, with the q10 and the q90.",
    "",
    "| band | rows | run alone | key alone | hash | in the router | router / run alone | router / (run + key) alone |",
    "|---|---:|---:|---:|---:|---:|---|---|",
  ];
  for (const band of bands) {
    const mine = rows.filter((r) => r.band === band);
    if (mine.length === 0) continue;
    const m = (f: (r: CostRow) => number): string => f1(quantile(mine.map(f), 0.5));
    out.push(
      `| ${band} | ${mine.length} | ${m((r) => r.alone)} | ${m((r) => r.key)} | ${m((r) => r.hash)} | ${m((r) => r.router)} | ${spread(mine.map((r) => r.router / r.alone))} | ${spread(mine.map((r) => r.router / (r.alone + r.key)))} |`,
    );
  }
  out.push(
    "",
    "## Each pick against the model of the fit",
    "",
    "The model adds the medians alone on the same board: the base, the setup and each member that ran, with the key of each output or without it.",
    "",
    "| band | picks | pick (median ms) | pick / model with the key | pick / model without the key |",
    "|---|---:|---:|---|---|",
  );
  for (const band of bands) {
    const mine = picks.filter((p) => p.band === band);
    if (mine.length === 0) continue;
    out.push(`| ${band} | ${mine.length} | ${f1(quantile(mine.map((p) => p.ms), 0.5))} | ${spread(mine.map((p) => p.ms / p.model))} | ${spread(mine.map((p) => p.ms / p.runs))} |`);
  }
  return out.join("\n") + "\n";
}

/** The screen sets of the check of the stretch (`--check-stretch`): the sets of the records of the portfolio. */
export const CHECK_SETS: readonly string[] = ["exact-v1", "exact-v1-bounds", "screen-v1"];

/** One line of `--check-stretch`: the largest difference of the stretch of an edge between the two functions, for one strategy on one input. */
export interface StretchCheck {
  readonly check: "stretch";
  readonly strategy: string;
  readonly input: string;
  readonly nodes: number;
  /** The count of the edges with a stretch in either function. */
  readonly edges: number;
  /** The count of the edges with a stretch in one function only. */
  readonly missing: number;
  readonly maxDiff: number;
  /** The largest stretch of the reference function, as the records keep it in `gap.stretch`, and the same value of `exactStretches`. */
  readonly max: number;
  readonly maxNew: number;
  readonly skipped?: string;
}

/** This function compares `exactStretches` with `exactStretchesReference` on the routes of one strategy on one graph. */
export function stretchCheck(strategy: Strategy<"router", object>, input: string, graph: Graph): StretchCheck {
  const head = { check: "stretch" as const, strategy: strategy.name, input, nodes: graph.nodes.length };
  if (graph.nodes.length > (strategy.maxNodes ?? Infinity)) return { ...head, edges: 0, missing: 0, maxDiff: 0, max: 1, maxNew: 1, skipped: `over ${strategy.maxNodes} nodes` };
  const routes = asRouter(strategy).route(graph).routes;
  const a = exactStretchesReference(graph)(routes);
  const b = exactStretches(graph)(routes);
  let missing = 0;
  let maxDiff = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k);
    const y = b.get(k);
    if (x === undefined || y === undefined) missing++;
    else maxDiff = Math.max(maxDiff, Math.abs(x - y));
  }
  const top = (m: Map<string, number>): number => Math.max(1, ...m.values());
  return { ...head, edges: new Set([...a.keys(), ...b.keys()]).size, missing, maxDiff, max: top(a), maxNew: top(b) };
}

/** This function writes the summary of the lines of `--check-stretch`: the counts of the records and of the differences above `RECORD_EPS`, by set. */
export function stretchCheckSummary(lines: readonly StretchCheck[]): string {
  const out = ["## The check of the cheaper stretch", "", `| set | records | edges | missing | largest difference | edges above ${RECORD_EPS} | records with another \`gap.stretch\` |`, "|---|---:|---:|---:|---:|---:|---:|"];
  for (const set of CHECK_SETS) {
    const mine = lines.filter((l) => l.input.startsWith(`${set}/`) && l.skipped === undefined);
    const edges = mine.reduce((n, l) => n + l.edges, 0);
    const missing = mine.reduce((n, l) => n + l.missing, 0);
    const largest = mine.reduce((m, l) => Math.max(m, l.maxDiff), 0);
    const above = mine.filter((l) => l.maxDiff > RECORD_EPS).length;
    const gap = mine.filter((l) => Math.abs(l.max - l.maxNew) > RECORD_EPS).length;
    out.push(`| \`${set}\` | ${mine.length} | ${edges} | ${missing} | ${largest.toExponential(2)} | ${above} | ${gap} |`);
  }
  return out.join("\n") + "\n";
}

/** The id of a board of `--guard-records`: `exact-large/<class>-n<nodes>/s<seed>`. The set has the boards of `exact-v1` at sizes without optima. */
export function largeInputId(cls: string, nodes: number, seed: number): string {
  return `exact-large/${cls}-n${nodes}/s${seed}`;
}

/** This function counts the breaks of each hard rule in a list of breaks. */
function ruleCounts(breaks: readonly { readonly rule: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of breaks) out[b.rule] = (out[b.rule] ?? 0) + 1;
  return out;
}

/**
 * This function gives the record of the guard of one strategy on one board (`--guard-records`): B1, the largest stretch of the model, the flag of mixed collections and the hard breaks.
 * The values are the values of the key of the router (`portfolioKey`). A strategy above its node limit gives a skipped record.
 */
export function guardRecord(strategy: Strategy<"router", object>, input: string, seed: number, graph: Graph): OracleRecord & { readonly nodes: number } {
  const head = { strategy: strategy.name, input, seed, nodes: graph.nodes.length };
  if (graph.nodes.length > (strategy.maxNodes ?? Infinity)) return { ...head, measures: {}, skipped: `over ${strategy.maxNodes} nodes` };
  const result = asRouter(strategy).route(graph);
  const stretch = Math.max(1, ...exactStretches(graph)(result.routes).values());
  return {
    ...head,
    measures: { [B1]: inkSaved(result.routes), [MODEL_STRETCH]: stretch, [MIXED]: mixedSegments(graph, result) > 0 ? 1 : 0 },
    hard: ruleCounts(checkProperties(graph, result, 1_000_000)),
  };
}

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const nums = (name: string, fallback: string): number[] => (opt(name) ?? fallback).split(",").map(Number);

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const summary = opt("--summary");
  if (summary !== undefined) {
    const lines = summary.split(",").flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as BreakdownRecord));
    const checks = lines.filter((l) => (l as unknown as { check?: string }).check === "stretch") as unknown as StretchCheck[];
    const costs = lines.filter((l) => (l as unknown as { kind?: string }).kind !== undefined) as unknown as CostRecord[];
    const parts = lines.filter((l) => l.part !== undefined);
    const md = [
      ...(parts.length > 0 ? [breakdownSummary(parts)] : []),
      ...(checks.length > 0 ? [stretchCheckSummary(checks)] : []),
      ...(costs.length > 0 ? [costSummary(costs)] : []),
    ].join("\n");
    if (opt("--out") !== undefined) writeFileSync(opt("--out")!, md);
    console.log(md);
    process.exit(0);
  }
  const sizes = nums("--sizes", "10,24,40");
  const seeds = nums("--seeds", "0,1,2");
  const repeats = Number(opt("--repeats") ?? "5");
  const slow = Number(opt("--slow") ?? "2000");
  const stop = Number(opt("--stop") ?? "Infinity");
  const members = args.includes("--members");
  const [shard, shards] = (opt("--shard") ?? "0/1").split("/").map(Number) as [number, number];
  const out = opt("--out") ?? "time.jsonl";
  if (args.includes("--breakdown")) {
    const boards = sizes.flatMap((n) => EXACT_CLASSES.flatMap((cls: ExactClass) => seeds.map((k) => ({ cls, n, k }))));
    const mine = boards.filter((_, i) => i % shards === shard);
    process.stderr.write(`${mine.length} of ${boards.length} boards in the shard ${shard}/${shards}.\n`);
    const only = opt("--forms");
    const forms = only === undefined ? BREAKDOWN_FORMS : BREAKDOWN_FORMS.filter((f) => f.id.endsWith(`-${only}`));
    const lines = mine.flatMap((b) => breakdownLines({ cls: b.cls, seed: b.k, graph: exactBoard(b.cls, b.n, b.k) }, repeats, slow, forms).map((l) => JSON.stringify(l)));
    writeFileSync(out, lines.join("\n") + "\n");
    process.exit(0);
  }
  if (args.includes("--member-cost")) {
    const boards = sizes.flatMap((n) => EXACT_CLASSES.flatMap((cls: ExactClass) => seeds.map((k) => ({ cls, n, k }))));
    const mine = boards.filter((_, i) => i % shards === shard);
    process.stderr.write(`${mine.length} of ${boards.length} boards in the shard ${shard}/${shards}.\n`);
    const lines = mine.flatMap((b) => costLines({ cls: b.cls, seed: b.k, graph: exactBoard(b.cls, b.n, b.k) }, repeats, slow).map((l) => JSON.stringify(l)));
    writeFileSync(out, lines.join("\n") + "\n");
    process.exit(0);
  }
  if (args.includes("--guard-records")) {
    const pool = memberStrategies().filter((_, i) => i % shards === shard);
    const boards = sizes.flatMap((n) => EXACT_CLASSES.flatMap((cls: ExactClass) => seeds.map((k) => ({ id: largeInputId(cls, n, k), k, graph: exactBoard(cls, n, k) }))));
    process.stderr.write(`${pool.length} members and ${boards.length} boards in the shard ${shard}/${shards}.\n`);
    const lines: string[] = [];
    for (const s of pool) {
      for (const b of boards) lines.push(JSON.stringify(guardRecord(s, b.id, b.k, b.graph)));
      process.stderr.write(`${s.name}: done\n`);
    }
    writeFileSync(out, lines.join("\n") + "\n");
    process.exit(0);
  }
  if (args.includes("--check-stretch")) {
    const pool = poolStrategies().filter((_, i) => i % shards === shard);
    const inputs = CHECK_SETS.flatMap((id) => screenInputs(SCREEN_SETS[id]!).map((input) => ({ id: input.id, graph: inputGraph(input) })));
    process.stderr.write(`${pool.length} strategies and ${inputs.length} inputs in the shard ${shard}/${shards}.\n`);
    const lines: string[] = [];
    for (const s of pool) {
      for (const i of inputs) lines.push(JSON.stringify(stretchCheck(s, i.id, i.graph)));
      process.stderr.write(`${s.name}: done\n`);
    }
    writeFileSync(out, lines.join("\n") + "\n");
    process.exit(0);
  }
  const pool = members ? memberStrategies() : poolStrategies();
  const mine = pool.filter((_, i) => i % shards === shard);
  process.stderr.write(`${mine.length} of ${pool.length} strategies in the shard ${shard}/${shards}.\n`);
  const corners = asRouter(getStrategy(STRATEGIES, "router", "corners"));
  const shared = asRouter(portfolioMember("shared")!);
  const boards = sizes.flatMap((n) => EXACT_CLASSES.flatMap((cls: ExactClass) => seeds.map((k) => ({ cls, k, graph: exactBoard(cls, n, k) }))));
  const base = new Map(boards.map((b) => [b, corners.route(b.graph).routes]));
  // With `--members`, each board has the timer of the key, warmed on the output of `shared`. Shard 0 writes the lines of the setup.
  const keys = new Map<(typeof boards)[number], (result: Result, isBase: boolean) => KeyTime>();
  const lines: string[] = [];
  if (members)
    for (const b of boards) {
      const out0 = shared.route(b.graph);
      for (let rep = 0; rep < repeats; rep++) {
        const t = performance.now();
        const f = portfolioFacts(b.graph);
        f(out0);
        const ms = performance.now() - t;
        if (shard === 0) lines.push(JSON.stringify({ strategy: KEY_SETUP, cls: b.cls, seed: b.k, nodes: b.graph.nodes.length, edges: b.graph.edges.length, rep, ms, scoreMs: 0 } satisfies TimeRecord));
      }
      keys.set(b, keyTimer(b.graph, out0));
    }
  for (const s of mine) {
    const router = asRouter(s);
    const slowAt = new Set<number>();
    for (const b of boards) {
      const head = { strategy: s.name, cls: b.cls, seed: b.k, nodes: b.graph.nodes.length, edges: b.graph.edges.length };
      if (b.graph.nodes.length > (s.maxNodes ?? Infinity)) {
        lines.push(JSON.stringify({ ...head, rep: 0, ms: 0, scoreMs: 0, skipped: `over ${s.maxNodes} nodes` } satisfies TimeRecord));
        continue;
      }
      if ([...slowAt].some((n) => n < b.graph.nodes.length)) {
        lines.push(JSON.stringify({ ...head, rep: 0, ms: 0, scoreMs: 0, skipped: `above ${stop} ms at a smaller size` } satisfies TimeRecord));
        continue;
      }
      // The first run warms the code of the strategy. It is not timed.
      let t = performance.now();
      router.route(b.graph);
      const first = performance.now() - t;
      const times: number[] = [];
      for (let rep = 0; rep < (first > slow ? 1 : repeats); rep++) {
        t = performance.now();
        const result = router.route(b.graph);
        const ms = performance.now() - t;
        t = performance.now();
        inkSaved(result.routes);
        bundleStretch(result.routes, base.get(b)!);
        checkProperties(b.graph, result, 1_000_000);
        const scoreMs = performance.now() - t;
        const key = members ? keys.get(b)!(result, s.name === PORTFOLIO_BASE_MEMBER) : undefined;
        times.push(ms + (key?.keyMs ?? 0));
        lines.push(JSON.stringify({ ...head, rep, ms, scoreMs, ...(key ?? {}) } satisfies TimeRecord));
      }
      times.sort((x, y) => x - y);
      if (times[Math.floor(times.length / 2)]! > stop) slowAt.add(b.graph.nodes.length);
    }
    process.stderr.write(`${s.name}: done\n`);
  }
  writeFileSync(out, lines.join("\n") + "\n");
}
