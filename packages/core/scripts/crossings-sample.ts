/**
 * This script writes the record `crossings-sample/1`. The module `crossings-sample-rows.ts` makes the rows and tells what they hold.
 * The first argument is the out file. The record holds no time, so a local run gives the same record as a run in CI.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CELLS, sampleRow, SCHEMA, setRows } from "./crossings-sample-rows.ts";

const OUT = process.argv[2] ?? "out/crossings-sample.json";
const rows = CELLS.map((cell) => {
  const row = sampleRow(cell);
  console.log(row.board, row.router, row.segments, row.full, row.estimate, row.error, row.worstDraw);
  return row;
});
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ schema: SCHEMA, rows, sets: setRows() }, null, 1)}\n`);
