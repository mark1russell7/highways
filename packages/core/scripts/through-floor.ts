/**
 * This script writes the record `through-floor/1`. The module `through-floor-rows.ts` makes it and tells what it holds.
 * Usage: `node packages/core/scripts/through-floor.ts <out.json>`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { floorRecord } from "./through-floor-rows.ts";

const out = process.argv[2];
if (!out) throw new Error("Usage: node packages/core/scripts/through-floor.ts <out.json>");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(floorRecord(), null, 1)}\n`);
