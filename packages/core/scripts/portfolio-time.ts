// The time of each strategy of the portfolio (PORTFOLIO): `pnpm portfolio:time [--sizes 10,24,40] [--seeds 0,1,2] [--repeats 5] [--slow 2000] [--shard 0/8] --out time.jsonl`.
// The script routes the small boards of `exact-v1` at each size with each strategy of the gap screen (`scripts/screens/meas2.ts`) and each built-in router.
// It writes one line for each timed run: the strategy, the board, the time of the route and the time of the score of the portfolio (B1, B3 q95 and the hard rules).
// A run slower than `--slow` ms gets no more repeats. Start it only in CI, with the workflow `Portfolio`, because the times of a busy machine are not true.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { bundleStretch, inkSaved } from "../src/bench/measures/bundles.ts";
import { checkProperties } from "../src/bench/properties.ts";
import { EXACT_CLASSES, exactBoard, type ExactClass } from "../src/bench/screen/exact-set.ts";
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
  readonly skipped?: string;
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
  const [shard, shards] = (opt("--shard") ?? "0/1").split("/").map(Number) as [number, number];
  const out = opt("--out") ?? "time.jsonl";
  const pool = poolStrategies();
  const mine = pool.filter((_, i) => i % shards === shard);
  process.stderr.write(`${mine.length} of ${pool.length} strategies in the shard ${shard}/${shards}.\n`);
  const corners = asRouter(getStrategy(STRATEGIES, "router", "corners"));
  const boards = sizes.flatMap((n) => EXACT_CLASSES.flatMap((cls: ExactClass) => seeds.map((k) => ({ cls, k, graph: exactBoard(cls, n, k) }))));
  const base = new Map(boards.map((b) => [b, corners.route(b.graph).routes]));
  const lines: string[] = [];
  for (const s of mine) {
    const router = asRouter(s);
    for (const b of boards) {
      const head = { strategy: s.name, cls: b.cls, seed: b.k, nodes: b.graph.nodes.length, edges: b.graph.edges.length };
      if (b.graph.nodes.length > (s.maxNodes ?? Infinity)) {
        lines.push(JSON.stringify({ ...head, rep: 0, ms: 0, scoreMs: 0, skipped: `over ${s.maxNodes} nodes` } satisfies TimeRecord));
        continue;
      }
      // The first run warms the code of the strategy. It is not timed.
      let t = performance.now();
      router.route(b.graph);
      const first = performance.now() - t;
      for (let rep = 0; rep < (first > slow ? 1 : repeats); rep++) {
        t = performance.now();
        const result = router.route(b.graph);
        const ms = performance.now() - t;
        t = performance.now();
        inkSaved(result.routes);
        bundleStretch(result.routes, base.get(b)!);
        checkProperties(b.graph, result, 1_000_000);
        const scoreMs = performance.now() - t;
        lines.push(JSON.stringify({ ...head, rep, ms, scoreMs } satisfies TimeRecord));
      }
    }
    process.stderr.write(`${s.name}: done\n`);
  }
  writeFileSync(out, lines.join("\n") + "\n");
}
