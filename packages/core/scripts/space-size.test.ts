import { existsSync, readFileSync } from "node:fs";
import { spaceSize } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { routeSpace } from "../src/route-space.ts";
import { SPACE_SIZE_LEVELS, SPACE_SIZE_REGENERATE, SPACE_SIZE_SCHEMA, spaceDigest, stageCounts, type SpaceSizeRecord } from "./space-size-rows.ts";

/** The committed record. The site reads its count as the measure `grammar-strategies` of `kpi.json`. */
const FILE = new URL("../../../docs/research/space-size/record.json", import.meta.url);
const STALE = `The record space-size/1 does not count the current routeSpace. Write it again with ${SPACE_SIZE_REGENERATE}.`;

describe("the record of the count of routeSpace (SPACE-SIZE)", () => {
  it("exists in the form space-size/1", () => {
    expect(existsSync(FILE), STALE).toBe(true);
    const record = JSON.parse(readFileSync(FILE, "utf8")) as SpaceSizeRecord;
    expect(record.schema).toBe(SPACE_SIZE_SCHEMA);
    expect(record.levels).toBe(SPACE_SIZE_LEVELS);
    expect(record.base).toMatch(/^\d+$/);
  });

  it("counts the current space, so a change of the space fails until the record is written again", () => {
    const record = JSON.parse(readFileSync(FILE, "utf8")) as SpaceSizeRecord;
    expect(record.stages, STALE).toEqual(stageCounts(routeSpace));
    expect(record.digest, STALE).toBe(spaceDigest(routeSpace));
  });

  // The count took 1 s in CI on 2026-11-08 (run 42494175371). The limit of the test is 60 times that.
  it("has the count of spaceSize", { timeout: 60_000 }, () => {
    const record = JSON.parse(readFileSync(FILE, "utf8")) as SpaceSizeRecord;
    const size = spaceSize(routeSpace, { levels: record.levels });
    expect(record.base, STALE).toBe(size.base.toString());
    expect(record.meta, STALE).toBe(size.meta === null ? null : size.meta.toString());
  });
});

describe("spaceDigest", () => {
  it("changes when one option of a stage changes", () => {
    const stage = routeSpace.stages[0]!;
    const changed = { ...routeSpace, stages: [{ ...stage, options: stage.options.slice(1) }, ...routeSpace.stages.slice(1)] };
    expect(spaceDigest(changed)).not.toBe(spaceDigest(routeSpace));
    expect(spaceDigest({ ...routeSpace })).toBe(spaceDigest(routeSpace));
  });
});
