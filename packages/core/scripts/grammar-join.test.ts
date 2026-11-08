import { describe, expect, it } from "vitest";
import { routeSpace } from "../src/route-space.ts";
import { distinctness } from "@mark1russell7/strategy-space";
import { GRAMMAR_SCREEN_SCHEMA, GRAMMAR_STAGE, joinShards, type ShardRecord } from "./grammar-join.ts";
import { pointsFile, shardOf } from "./grammar-points-rows.ts";
import { GRAMMAR_COST_SCHEMA, pointStrategy, type GrammarCost } from "./grammar-screen.ts";

const file = pointsFile(routeSpace, { n: 4, seed: 1, shards: 2 });
const INPUTS = ["in/a", "in/b", "in/c"];
const cost = (shard: number, points: number, seconds: number, inputs = INPUTS.length): GrammarCost => ({
  schema: GRAMMAR_COST_SCHEMA,
  set: "made-up",
  shard,
  points,
  inputs,
  records: points * inputs,
  skipped: 0,
  seconds,
  cpu: `cpu-${shard}`,
  node: "v26",
});
// The record of a point on an input: the crossings are the position of the input, so the median over 3 inputs is 1.
const record = (id: string, input: string, i: number): ShardRecord => ({ strategy: id, input, measures: { "route.crossings": i, "route.bends": 2, "route.ink": 10 * i }, hard: { overlap: i === 2 ? 1 : 0 }, ms: 5, outputHash: `${id}-${input}` });
const shard = (k: number, seconds: number) => {
  const own = shardOf(file.points, k, file.shards);
  return { cost: cost(k, own.length, seconds), records: own.flatMap((p) => INPUTS.map((input, i) => record(p.id, input, i))) };
};

describe("the join of the grammar screen", () => {
  it("joins each shard in the order of the points, with the cost and the medians", () => {
    const joined = joinShards(file, new Map([[0, shard(0, 10)], [1, shard(1, 30)]]));
    expect(joined.schema).toBe(GRAMMAR_SCREEN_SCHEMA);
    expect(joined.points.map((p) => p.index)).toEqual([0, 1, 2, 3]);
    expect(joined).toMatchObject({ n: 4, shards: 2, inputs: 3, records: 12, seconds: 40, longest: 30, secondsPerPoint: 10, cpus: ["cpu-0", "cpu-1"] });
    const [first] = joined.points;
    expect(first).toMatchObject({ skipped: 0, hard: 1, medians: { "route.crossings": 1, "route.bends": 2, "route.ink": 10, ms: 5 } });
    expect(Object.keys(first!.outputs)).toEqual(INPUTS);
  });

  it("refuses a missing shard, a shard with another count of points, and a point with a missing record", () => {
    expect(() => joinShards(file, new Map([[0, shard(0, 1)]]))).toThrow(/shard 1/);
    const short = shard(1, 1);
    expect(() => joinShards(file, new Map([[0, shard(0, 1)], [1, { ...short, cost: { ...short.cost, points: 1 } }]]))).toThrow(/screened 1 points/);
    expect(() => joinShards(file, new Map([[0, shard(0, 1)], [1, { ...short, records: short.records.slice(1) }]]))).toThrow(/2 records/);
  });

  it("counts a skipped input, and leaves it out of the medians and the outputs", () => {
    const s0 = shard(0, 1);
    const records = s0.records.map((r, i) => (i === 0 ? { strategy: r.strategy, input: r.input, skipped: "too large" } : r));
    const joined = joinShards(file, new Map([[0, { ...s0, records }], [1, shard(1, 1)]]));
    const p = joined.points.find((x) => x.id === records[0]!.strategy)!;
    expect(p.skipped).toBe(1);
    expect(Object.keys(p.outputs)).toEqual(["in/b", "in/c"]);
    expect(p.medians["route.crossings"]).toBe(1.5);
  });

  it("gives each point a router strategy with the id of the point as its name", () => {
    const [point] = file.points;
    const s = pointStrategy(point!);
    expect(s).toMatchObject({ step: "router", name: point!.id, defaults: {} });
  });

  it("gives points that the gate distinctness of strategy-space reads", () => {
    const joined = joinShards(file, new Map([[0, shard(0, 1)], [1, shard(1, 1)]]));
    const [operator, ...variants] = joined.points;
    const rows = distinctness([operator!], [...variants, { ...operator!, id: "copy" }], { inputs: INPUTS });
    expect(joined.points.every((p) => p.stage === GRAMMAR_STAGE)).toBe(true);
    expect(rows.find((r) => r.id === "copy")).toMatchObject({ verdict: "same", sameAs: [operator!.id] });
    expect(rows.filter((r) => r.id !== "copy").every((r) => r.verdict === "distinct")).toBe(true);
  });
});
