/**
 * This script writes the record `control-wins/1`. The module `control-wins-rows.ts` makes it and tells what it holds.
 * Usage: `node packages/core/scripts/control-wins.ts <out.json>`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readBoards, SLICE, winsRecord } from "./control-wins-rows.ts";

const out = process.argv[2];
if (!out) throw new Error("Usage: node packages/core/scripts/control-wins.ts <out.json>");
const record = winsRecord(
  readBoards(undefined, undefined, (line) => console.log(line)),
  readBoards(SLICE.families, SLICE.seeds),
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 1)}\n`);
