import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CELLS, DRAWS, REGENERATE, SAMPLE_LIMIT, sampleRow, SCHEMA, setRows, type SampleRow, type SetRow } from "./crossings-sample-rows.ts";

/** The record on disk. */
const record = JSON.parse(readFileSync(new URL("./data/crossings-sample/record.json", import.meta.url), "utf8")) as {
  schema: string;
  rows: SampleRow[];
  sets: SetRow[];
};
const STALE = `The record crossings-sample/1 is stale. Write it again with: ${REGENERATE}`;

describe("the record crossings-sample/1", () => {
  it("holds each cell, above the limit of the full count", () => {
    expect(record.schema).toBe(SCHEMA);
    expect(record.rows.map((r) => `${r.board}/${r.router}`)).toEqual(CELLS.map((c) => `${c.board}/${c.router}`));
    for (const r of record.rows) {
      expect(r.segments, `${r.board}/${r.router}`).toBeGreaterThan(SAMPLE_LIMIT);
      expect(r.draws.length).toBe(DRAWS.length);
    }
  });

  it("equals a fresh read of the smallest cell", () => {
    expect(sampleRow(CELLS[0]!), STALE).toEqual(record.rows[0]);
  }, 120_000);

  it("equals a fresh read of the sets", () => {
    expect(setRows(), STALE).toEqual(record.sets);
  }, 120_000);
});
