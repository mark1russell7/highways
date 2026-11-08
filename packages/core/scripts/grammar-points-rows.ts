// The points of the grammar for a screen (D23-POINTS): a seeded sample of `routeSpace`, with one id for each point and a shard for each job.
// `enumerateSpace` of `layout-contract` draws the sample. This file adds the unique ids, the shards and the check of a file.
import { configId, enumerateSpace, type StrategyConfig, type StrategySpace } from "@mark1russell7/layout-contract";
import { spaceDigest } from "./space-size-rows.ts";

/** The form of the file. */
export const GRAMMAR_POINTS_SCHEMA = "grammar-points/1";

/** The largest count of draws before `grammarPoints` stops. */
const MAX_ROUNDS = 8;

/**
 * The note of each file. The constraints of `routeSpace` remove most draws of a uniform sample, so the sample uses the walk draw.
 * The walk gives each option of the largest stage an equal share. Thus a mean over the points is not a mean of the space.
 */
export const GRAMMAR_POINTS_NOTE =
  "The walk draw of enumerateSpace gives each option of the largest stage an equal share. A mean over these points is not a mean of the space.";

/** One point of the grammar. */
export interface GrammarPoint {
  /** The position of the point in the file, from 0. */
  readonly index: number;
  /** The id of the config, from `configId`. */
  readonly id: string;
  readonly config: StrategyConfig;
}

/** The file of the points. */
export interface GrammarPointsFile {
  readonly schema: string;
  readonly space: string;
  /** The digest of the space, from `spaceDigest`. A file of another space is stale. */
  readonly digest: string;
  readonly seed: number;
  readonly n: number;
  /** The count of the shards. The job `k` takes the points whose index divided by `shards` leaves `k`. */
  readonly shards: number;
  readonly note: string;
  readonly points: readonly GrammarPoint[];
}

/**
 * This function gives `n` points of a space with different ids, in the order of the draw.
 * When the draw gives fewer than `n` different ids, it draws again with a larger count. The points depend on `n` and on `seed`.
 *
 * @throws Error when the space gives fewer than `n` different ids after 8 draws.
 */
export function grammarPoints(space: StrategySpace, n: number, seed: number): GrammarPoint[] {
  if (!Number.isInteger(n) || n < 0) throw new Error(`The count ${n} is not a whole number of 0 or more.`);
  if (n === 0) return [];
  let count = n;
  let found = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const seen = new Set<string>();
    const points: GrammarPoint[] = [];
    for (const config of enumerateSpace(space, { mode: "sample", n: count, seed, draw: "walk" })) {
      const id = configId(space, config);
      if (seen.has(id)) continue;
      seen.add(id);
      points.push({ index: points.length, id, config });
      if (points.length === n) return points;
    }
    found = points.length;
    count = Math.ceil((count * n) / Math.max(1, found)) + 1;
  }
  throw new Error(`The space ${space.engine} gave ${found} different points of ${n} after ${MAX_ROUNDS} draws.`);
}

/** This function gives the points of the shard `shard` of `shards`. The shards share the points by index, so each shard gets a similar mix. */
export function shardOf(points: readonly GrammarPoint[], shard: number, shards: number): GrammarPoint[] {
  if (!Number.isInteger(shards) || shards < 1) throw new Error(`The count of shards ${shards} is not a whole number of 1 or more.`);
  if (!Number.isInteger(shard) || shard < 0 || shard >= shards) throw new Error(`The shard ${shard} is not from 0 to ${shards - 1}.`);
  return points.filter((p) => p.index % shards === shard);
}

/** This function gives the file of `n` points of a space, for a screen with `shards` jobs. */
export function pointsFile(space: StrategySpace, options: { readonly n: number; readonly seed: number; readonly shards: number }): GrammarPointsFile {
  const { n, seed, shards } = options;
  shardOf([], 0, shards);
  return { schema: GRAMMAR_POINTS_SCHEMA, space: space.engine, digest: spaceDigest(space), seed, n, shards, note: GRAMMAR_POINTS_NOTE, points: grammarPoints(space, n, seed) };
}

/**
 * This function gives the points of the shard `shard` of a file, after it checks the file against the space.
 *
 * It refuses a file of another form, a stale file, and a point with a wrong id.
 *
 * @throws Error when the file breaks one of these checks.
 */
export function readShard(value: unknown, space: StrategySpace, shard: number): GrammarPoint[] {
  const file = value as Partial<GrammarPointsFile> | null;
  if (typeof file !== "object" || file === null || file.schema !== GRAMMAR_POINTS_SCHEMA || !Array.isArray(file.points) || typeof file.shards !== "number") {
    throw new Error(`The file is not of the form ${GRAMMAR_POINTS_SCHEMA}.`);
  }
  if (file.digest !== spaceDigest(space)) throw new Error(`The file is stale: its digest is not that of the space ${space.engine}. Write it again.`);
  const points = shardOf(file.points, shard, file.shards);
  for (const p of points) {
    if (configId(space, p.config) !== p.id) throw new Error(`The point ${p.index} has the id ${p.id}, and its config has another id.`);
  }
  return points;
}
