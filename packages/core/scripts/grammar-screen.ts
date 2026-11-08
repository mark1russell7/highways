// The grammar screen (D23 step 4): the screen of the step `router` on the points of one shard of a file of `grammar-points.ts`.
// Start it from `packages/core`: `node scripts/grammar-screen.ts --points <file> --shard <k> [--set screen-v1] [--families <a,b>] [--limit <n>] [--out <dir>]`.
// Each point routes with `routeConfig`, so the screen adds no algorithm. The screen runs no built-in router, because the named points of the grammar are the routers.
// The script writes `shard-<k>.jsonl`, one record of the form `layout-record/1` for each point and input, and `shard-<k>.json`, the cost of the shard.
// The workflow `Grammar screen` starts it in CI. Locally, start it only on one small family and a few points, for example `--families tiny-uniform --limit 4`.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { recordLines, screen, SCREEN_SETS } from "../src/bench/screen/index.ts";
import { routeConfig, routeSpace } from "../src/route-space.ts";
import type { Strategy } from "../src/strategies/model.ts";
import { readShard, type GrammarPoint } from "./grammar-points-rows.ts";

/** The form of the cost file of a shard. */
export const GRAMMAR_COST_SCHEMA = "grammar-cost/1";

/** The cost of one shard: the points, the inputs, the records and the time. */
export interface GrammarCost {
  readonly schema: string;
  readonly set: string;
  readonly shard: number;
  readonly points: number;
  readonly inputs: number;
  readonly records: number;
  readonly skipped: number;
  /** The time of the whole screen of the shard, in seconds. */
  readonly seconds: number;
  readonly cpu: string;
  readonly node: string;
}

/** This function gives a router strategy for a point of the grammar. Its name is the id of the point, and it routes with `routeConfig`. */
export function pointStrategy(point: GrammarPoint): Strategy<"router", object> {
  return { step: "router", name: point.id, describe: `The point ${point.index} of the grammar.`, defaults: {}, run: (graph) => routeConfig(graph, point.config) };
}

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (process.argv[1]?.endsWith("grammar-screen.ts")) {
  const pointsFile = opt("--points");
  if (pointsFile === undefined) throw new Error("Give the file of the points with --points.");
  const shard = Number(opt("--shard") ?? "0");
  const setId = opt("--set") ?? "screen-v1";
  const set = SCREEN_SETS[setId];
  if (!set) throw new Error(`There is no screen set "${setId}". The sets are ${Object.keys(SCREEN_SETS).join(", ")}.`);
  const families = opt("--families")?.split(",").filter((x) => x.length > 0);
  const limit = opt("--limit") === undefined ? undefined : Number(opt("--limit"));
  const out = opt("--out") ?? "out/grammar-screen";

  const all = readShard(JSON.parse(readFileSync(pointsFile, "utf8")), routeSpace, shard);
  const points = limit === undefined ? all : all.slice(0, limit);
  const start = performance.now();
  const report = screen("router", points.map(pointStrategy), { set, baseline: false, ...(families?.length ? { families } : {}), log: (line) => process.stderr.write(`${line}\n`) });
  const seconds = (performance.now() - start) / 1000;

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `shard-${shard}.jsonl`), recordLines(report.records));
  const cost: GrammarCost = {
    schema: GRAMMAR_COST_SCHEMA,
    set: setId,
    shard,
    points: points.length,
    inputs: report.summary.inputs,
    records: report.records.length,
    skipped: report.records.filter((r) => r.skipped !== undefined).length,
    seconds: Math.round(seconds * 10) / 10,
    cpu: cpus()[0]?.model.trim() ?? "unknown",
    node: process.version,
  };
  writeFileSync(join(out, `shard-${shard}.json`), `${JSON.stringify(cost, null, 2)}\n`);
  console.log(`Shard ${shard}: ${cost.points} points on ${cost.inputs} inputs, ${cost.records} records in ${cost.seconds} s (${(seconds / Math.max(1, cost.points)).toFixed(2)} s for each point).`);
}
