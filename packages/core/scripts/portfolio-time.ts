// The time of each strategy of the portfolio (PORTFOLIO): `pnpm portfolio:time [--sizes 10,24,40] [--seeds 0,1,2] [--repeats 5] [--slow 2000] [--members] [--stop 250] [--shard 0/8] --out time.jsonl`.
// The script routes the small boards of `exact-v1` at each size with each strategy of the gap screen (`scripts/screens/meas2.ts`) and each built-in router.
// It writes one line for each timed run: the strategy, the board, the time of the route and the time of the score of the portfolio (B1, B3 q95 and the hard rules).
// A run slower than `--slow` ms gets no more repeats. Start it only in CI, with the workflow `Portfolio`, because the times of a busy machine are not true.
// With `--members` (PORTFOLIO-FIT), the script times the members of the portfolio router (`MEMBER_FORMS`) instead, and the key of the router on each output (`keyMs`).
// Then each board also gets one line of the strategy `@key-setup`: the time to build the network of the stretch and to read the facts of the output of `shared`.
// After a size where the median time of a strategy is above `--stop` ms, the strategy skips the larger sizes.
// With `--breakdown` (PORTFOLIO-SPEED), the script times the parts of the setup of the key and the router on each board instead (`breakdownLines`).
// Then `--shard` splits the boards, not the strategies. `pnpm portfolio:time --summary <path,...>` writes the table of such lines, and times nothing.
// With `--check-stretch`, the script times nothing. It routes each input of `exact-v1`, `exact-v1-bounds` and `screen-v1` with each strategy of the pool.
// Then it compares the stretch of each edge of `exactStretches` with the stretch of `exactStretchesReference` (`stretchCheck`). The summary counts each difference above `RECORD_EPS`.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { bundleStretch, inkSaved } from "../src/bench/measures/bundles.ts";
import { exactStretches, exactStretchesReference } from "../src/bench/exact/index.ts";
import { quantile } from "../src/bench/measures/stats.ts";
import { checkProperties } from "../src/bench/properties.ts";
import { mixedSegments } from "../src/bench/screen/gap.ts";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { RECORD_EPS } from "../src/bench/screen/hash.ts";
import { SCREEN_SETS, screenInputs } from "../src/bench/screen/set.ts";
import { EXACT_CLASSES, exactBoard, type ExactClass } from "../src/bench/screen/exact-set.ts";
import { MEMBER_FORMS, portfolioMember } from "../src/portfolio/members.ts";
import { portfolioFacts } from "../src/portfolio/key.ts";
import { routePortfolio, type PortfolioRouterOptions } from "../src/portfolio/router.ts";
import type { Graph } from "../src/model.ts";
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
  /** With `--members`: the time of the key of the portfolio router on the output, in ms. The network of the stretch is already built. */
  readonly keyMs?: number;
  readonly skipped?: string;
}

/** The name of the lines of the setup of the key: the network of the stretch, and the facts of the output of `shared`. */
export const KEY_SETUP = "@key-setup";

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
export function breakdownLines(head: { readonly cls: string; readonly seed: number; readonly graph: Graph }, repeats: number, slow: number): BreakdownRecord[] {
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
  for (const form of BREAKDOWN_FORMS) {
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
  out.push("", "## The router (median ms, and the median count of the members that ran)", "", `| form | ${sizes.join(" | ")} |`, `|---|${sizes.map(() => "---:").join("|")}|`);
  for (const form of BREAKDOWN_FORMS) {
    const part = `@router:${form.id}`;
    out.push(`| \`${form.id}\` | ${sizes.map((n) => `${f1(med(part, n))} (${f1(med(part, n, (l) => l.members ?? 0))})`).join(" | ")} |`);
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
    const md = breakdownSummary(lines.filter((l) => l.part !== undefined)) + (checks.length > 0 ? "\n" + stretchCheckSummary(checks) : "");
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
    const lines = mine.flatMap((b) => breakdownLines({ cls: b.cls, seed: b.k, graph: exactBoard(b.cls, b.n, b.k) }, repeats, slow).map((l) => JSON.stringify(l)));
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
  // With `--members`, each board has the facts function of the key, warmed on the output of `shared`. Shard 0 writes the lines of the setup.
  const facts = new Map<(typeof boards)[number], (r: ReturnType<typeof shared.route>) => unknown>();
  const lines: string[] = [];
  if (members)
    for (const b of boards) {
      const out0 = shared.route(b.graph);
      for (let rep = 0; rep < repeats; rep++) {
        const t = performance.now();
        const f = portfolioFacts(b.graph);
        f(out0);
        const ms = performance.now() - t;
        facts.set(b, f);
        if (shard === 0) lines.push(JSON.stringify({ strategy: KEY_SETUP, cls: b.cls, seed: b.k, nodes: b.graph.nodes.length, edges: b.graph.edges.length, rep, ms, scoreMs: 0 } satisfies TimeRecord));
      }
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
        let keyMs: number | undefined;
        if (members) {
          t = performance.now();
          facts.get(b)!(result);
          inkSaved(result.routes);
          keyMs = performance.now() - t;
        }
        times.push(ms + (keyMs ?? 0));
        lines.push(JSON.stringify({ ...head, rep, ms, scoreMs, ...(keyMs === undefined ? {} : { keyMs }) } satisfies TimeRecord));
      }
      times.sort((x, y) => x - y);
      if (times[Math.floor(times.length / 2)]! > stop) slowAt.add(b.graph.nodes.length);
    }
    process.stderr.write(`${s.name}: done\n`);
  }
  writeFileSync(out, lines.join("\n") + "\n");
}
