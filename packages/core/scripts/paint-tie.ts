/**
 * This script writes the record `paint-tie/1`. The module `paint-tie-rows.ts` makes it and tells what it holds.
 * Usage: `node packages/core/scripts/paint-tie.ts <out.json>`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { HIGHWAYS_FAMILIES } from "../src/families/index.ts";
import { kindRows, laneOrderRows, paintRecord, SEEDS, SLICE } from "./paint-tie-rows.ts";

const out = process.argv[2];
if (!out) throw new Error("Usage: node packages/core/scripts/paint-tie.ts <out.json>");
const rows = kindRows(undefined, SEEDS, (line) => console.log(line));
const record = paintRecord(rows, kindRows(SLICE.families, SLICE.seeds), laneOrderRows(), HIGHWAYS_FAMILIES.length * SEEDS);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 1)}\n`);
