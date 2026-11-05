/**
 * This script writes the record `ambiguity-read/1`. The module `ambiguity-read-rows.ts` makes it and tells what it holds.
 * Usage: `node packages/core/scripts/ambiguity-read.ts <out.json>`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ambiguityRecord, boardRows, readRows, SLICE } from "./ambiguity-read-rows.ts";

const out = process.argv[2];
if (!out) throw new Error("Usage: node packages/core/scripts/ambiguity-read.ts <out.json>");
const record = ambiguityRecord(
  readRows((line) => console.log(line)),
  boardRows(SLICE.board, SLICE.key),
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 1)}\n`);
