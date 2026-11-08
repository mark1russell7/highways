// The join of the grammar screen (D23 step 4): the files of each shard of `grammar-screen.ts` become one record of the cost and of each point.
// Start it from `packages/core`: `node scripts/grammar-join.ts --points <file> --in <dir> --out <file>`.
// The join refuses a missing shard, a shard with another count of points, and a point with no record of an input (FAIL-CLOSED).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { median } from "@mark1russell7/rigor-statistics";
import type { OutputHashes } from "@mark1russell7/strategy-space";
import { routeSpace } from "../src/route-space.ts";
import type { GrammarCost } from "./grammar-screen.ts";
import { readShard, type GrammarPointsFile } from "./grammar-points-rows.ts";
import { spaceDigest } from "./space-size-rows.ts";

/** The form of the joined record. */
export const GRAMMAR_SCREEN_SCHEMA = "grammar-screen/1";

/** The stage of each point of the grammar. */
export const GRAMMAR_STAGE = "router";

/** The measures of each point in the joined record, by their names in a record. */
export const GRAMMAR_MEASURES: readonly string[] = ["route.crossings", "route.bends", "route.ink"];

/** The part of a record of the form `layout-record/1` that the join reads. */
export interface ShardRecord {
  readonly strategy: string;
  readonly input: string;
  readonly measures?: Readonly<Record<string, number | null>>;
  readonly hard?: Readonly<Record<string, number>>;
  readonly ms?: number;
  readonly outputHash?: string;
  readonly skipped?: string;
}

/** One point of the joined record. Its fields `id`, `stage` and `outputs` have the form `OutputHashes` of the gate `distinctness` of `strategy-space`. */
export interface JoinedPoint extends OutputHashes {
  readonly index: number;
  /** The count of the inputs that the point skipped. */
  readonly skipped: number;
  /** The sum of the breaks of the hard rules over the inputs. */
  readonly hard: number;
  /** The median of each measure of `GRAMMAR_MEASURES` over the inputs, and the median time `ms`. A measure with no value is absent. */
  readonly medians: Readonly<Record<string, number>>;
}

/** The joined record. */
export interface GrammarScreen {
  readonly schema: string;
  readonly space: string;
  readonly digest: string;
  readonly set: string;
  readonly n: number;
  readonly shards: number;
  readonly inputs: number;
  readonly records: number;
  /** The sum of the times of the shards, in seconds. */
  readonly seconds: number;
  /** The time of the slowest shard, in seconds. */
  readonly longest: number;
  /** `seconds` divided by `n`. */
  readonly secondsPerPoint: number;
  readonly cpus: readonly string[];
  readonly points: readonly JoinedPoint[];
}

/** This function gives the median of a list of finite numbers, or `undefined` for an empty list. */
const medianOf = (values: readonly number[]): number | undefined => (values.length === 0 ? undefined : median(values));

/**
 * This function joins the shards of a grammar screen into one record, in the order of the points.
 *
 * @param file - The file of the points that each shard read.
 * @param shards - The cost and the records of each shard, by the number of the shard.
 * @throws Error when a shard is missing or has another count of points. A point with a missing record also gives an error.
 */
export function joinShards(file: GrammarPointsFile, shards: ReadonlyMap<number, { readonly cost: GrammarCost; readonly records: readonly ShardRecord[] }>): GrammarScreen {
  const points: JoinedPoint[] = [];
  const costs: GrammarCost[] = [];
  let inputs: number | undefined;
  for (let k = 0; k < file.shards; k++) {
    const shard = shards.get(k);
    if (shard === undefined) throw new Error(`The shard ${k} of ${file.shards} has no files.`);
    const own = readShard(file, routeSpace, k);
    if (shard.cost.points !== own.length) throw new Error(`The shard ${k} screened ${shard.cost.points} points, and the file gives it ${own.length}.`);
    if (inputs !== undefined && shard.cost.inputs !== inputs) throw new Error(`The shard ${k} has ${shard.cost.inputs} inputs, and the shard 0 has ${inputs}.`);
    inputs = shard.cost.inputs;
    costs.push(shard.cost);
    const byPoint = new Map<string, ShardRecord[]>();
    for (const r of shard.records) byPoint.set(r.strategy, [...(byPoint.get(r.strategy) ?? []), r]);
    for (const p of own) {
      const rows = byPoint.get(p.id) ?? [];
      if (rows.length !== inputs) throw new Error(`The point ${p.index} has ${rows.length} records, and the shard has ${inputs} inputs.`);
      const ran = rows.filter((r) => r.skipped === undefined);
      const medians: Record<string, number> = {};
      for (const name of GRAMMAR_MEASURES) {
        const m = medianOf(ran.map((r) => r.measures?.[name]).filter((v): v is number => typeof v === "number" && Number.isFinite(v)));
        if (m !== undefined) medians[name] = m;
      }
      const ms = medianOf(ran.map((r) => r.ms).filter((v): v is number => typeof v === "number" && Number.isFinite(v)));
      if (ms !== undefined) medians["ms"] = ms;
      const outputs = Object.fromEntries(ran.filter((r) => r.outputHash !== undefined).map((r) => [r.input, r.outputHash!]).sort(([a], [b]) => (a! < b! ? -1 : 1)));
      const hard = ran.reduce((sum, r) => sum + Object.values(r.hard ?? {}).reduce((s, x) => s + x, 0), 0);
      points.push({ index: p.index, id: p.id, stage: GRAMMAR_STAGE, outputs, skipped: rows.length - ran.length, hard, medians });
    }
  }
  points.sort((a, b) => a.index - b.index);
  const seconds = costs.reduce((sum, c) => sum + c.seconds, 0);
  return {
    schema: GRAMMAR_SCREEN_SCHEMA,
    space: file.space,
    digest: spaceDigest(routeSpace),
    set: costs[0]?.set ?? "",
    n: file.n,
    shards: file.shards,
    inputs: inputs ?? 0,
    records: costs.reduce((sum, c) => sum + c.records, 0),
    seconds: Math.round(seconds * 10) / 10,
    longest: Math.max(0, ...costs.map((c) => c.seconds)),
    secondsPerPoint: file.n === 0 ? 0 : Math.round((seconds / file.n) * 1000) / 1000,
    cpus: [...new Set(costs.map((c) => c.cpu))].sort(),
    points,
  };
}

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (process.argv[1]?.endsWith("grammar-join.ts")) {
  const pointsPath = opt("--points");
  const dir = opt("--in");
  if (pointsPath === undefined || dir === undefined) throw new Error("Give the file of the points with --points and the folder of the shards with --in.");
  const file = JSON.parse(readFileSync(pointsPath, "utf8")) as GrammarPointsFile;
  const shards = new Map<number, { cost: GrammarCost; records: ShardRecord[] }>();
  for (let k = 0; k < file.shards; k++) {
    try {
      const cost = JSON.parse(readFileSync(join(dir, `shard-${k}.json`), "utf8")) as GrammarCost;
      const records = readFileSync(join(dir, `shard-${k}.jsonl`), "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as ShardRecord);
      shards.set(k, { cost, records });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const joined = joinShards(file, shards);
  writeFileSync(opt("--out") ?? "grammar-screen.json", `${JSON.stringify(joined)}\n`);
  console.log(
    `${joined.n} points on ${joined.inputs} inputs of ${joined.set}: ${joined.records} records, ${joined.seconds} s in ${joined.shards} shards (the longest ${joined.longest} s), ${joined.secondsPerPoint} s for each point.`,
  );
}
