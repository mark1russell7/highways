import { describe, expect, it } from "vitest";
import { configId, enumerateSpace } from "@mark1russell7/layout-contract";
import { routeSpace } from "../src/route-space.ts";
import { GRAMMAR_POINTS_SCHEMA, grammarPoints, pointsFile, readShard, shardOf } from "./grammar-points-rows.ts";

describe("grammarPoints", () => {
  const points = grammarPoints(routeSpace, 200, 1);

  it("gives n points with different ids, each the id of its config", () => {
    expect(points).toHaveLength(200);
    expect(new Set(points.map((p) => p.id)).size).toBe(200);
    expect(points.every((p, i) => p.index === i && configId(routeSpace, p.config) === p.id)).toBe(true);
  });

  it("gives the same points for the same seed, and other points for another seed", () => {
    expect(grammarPoints(routeSpace, 200, 1)).toEqual(points);
    expect(grammarPoints(routeSpace, 200, 2).map((p) => p.id)).not.toEqual(points.map((p) => p.id));
  });

  it("keeps the order of the walk draw when the draw has no repeated config", () => {
    const ids = enumerateSpace(routeSpace, { mode: "sample", n: 10, seed: 1, draw: "walk" }).map((c) => configId(routeSpace, c));
    expect(new Set(ids).size).toBe(10);
    expect(grammarPoints(routeSpace, 10, 1).map((p) => p.id)).toEqual(ids);
  });

  it("gives no point for 0, and refuses a count that is not a whole number", () => {
    expect(grammarPoints(routeSpace, 0, 1)).toEqual([]);
    expect(() => grammarPoints(routeSpace, 1.5, 1)).toThrow("1.5");
  });
});

describe("shards", () => {
  const file = pointsFile(routeSpace, { n: 50, seed: 3, shards: 8 });

  it("gives each point to one shard, and the shards differ in size by at most 1", () => {
    const shards = Array.from({ length: 8 }, (_, k) => readShard(file, routeSpace, k));
    expect(shards.flat().map((p) => p.index).sort((a, b) => a - b)).toEqual(file.points.map((p) => p.index));
    const sizes = shards.map((s) => s.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("reads a file after a round trip through JSON", () => {
    expect(readShard(JSON.parse(JSON.stringify(file)), routeSpace, 2)).toEqual(shardOf(file.points, 2, 8));
  });

  it("refuses a file of another form, a stale file, a changed config and a shard out of range", () => {
    expect(() => readShard({ ...file, schema: "other/1" }, routeSpace, 0)).toThrow(GRAMMAR_POINTS_SCHEMA);
    expect(() => readShard({ ...file, digest: "0" }, routeSpace, 0)).toThrow("stale");
    const [first, second] = file.points;
    expect(() => readShard({ ...file, points: [{ ...first!, config: second!.config }, ...file.points.slice(1)] }, routeSpace, 0)).toThrow("another id");
    expect(() => readShard(file, routeSpace, 8)).toThrow("from 0 to 7");
    expect(() => pointsFile(routeSpace, { n: 5, seed: 1, shards: 0 })).toThrow("shards 0");
  });
});
