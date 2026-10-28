// The time of each strategy of the portfolio (PORTFOLIO): `pnpm portfolio:time [--sizes 10,24,40] [--seeds 0,1,2] [--repeats 5] [--slow 2000] [--members] [--stop 250] [--shard 0/8] --out time.jsonl`.
// The script routes the small boards of `exact-v1` at each size with each strategy of the gap screen (`scripts/screens/meas2.ts`) and each built-in router.
// It writes one line for each timed run: the strategy, the board, the time of the route and the time of the score of the portfolio (B1, B3 q95 and the hard rules).
// A run slower than `--slow` ms gets no more repeats. Start it only in CI, with the workflow `Portfolio`, because the times of a busy machine are not true.
// With `--members` (PORTFOLIO-FIT), the script times the members of the portfolio router (`MEMBER_FORMS`) instead, and the key of the router on each output (`keyMs`).
// Then each board also gets one line of the strategy `@key-setup`: the time to build the network of the stretch and to read the facts of the output of `shared`.
// After a size where the median time of a strategy is above `--stop` ms, the strategy skips the larger sizes.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { bundleStretch, inkSaved } from "../src/bench/measures/bundles.ts";
import { checkProperties } from "../src/bench/properties.ts";
import { EXACT_CLASSES, exactBoard, type ExactClass } from "../src/bench/screen/exact-set.ts";
import { MEMBER_FORMS, portfolioMember } from "../src/portfolio/members.ts";
import { portfolioFacts } from "../src/portfolio/key.ts";
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

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const nums = (name: string, fallback: string): number[] => (opt(name) ?? fallback).split(",").map(Number);

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const sizes = nums("--sizes", "10,24,40");
  const seeds = nums("--seeds", "0,1,2");
  const repeats = Number(opt("--repeats") ?? "5");
  const slow = Number(opt("--slow") ?? "2000");
  const stop = Number(opt("--stop") ?? "Infinity");
  const members = args.includes("--members");
  const [shard, shards] = (opt("--shard") ?? "0/1").split("/").map(Number) as [number, number];
  const out = opt("--out") ?? "time.jsonl";
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
