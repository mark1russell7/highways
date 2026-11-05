/**
 * This script writes the record `split-spacing/1`. The module `split-spacing-rows.ts` makes the rows and tells what they hold.
 * The first argument is the out file. The script keeps the rows `bisect` of the file, because only `split-spacing-bisect.ts` writes them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA, spacingRows } from "./split-spacing-rows.ts";

const OUT = process.argv[2] ?? "out/split-spacing.json";
const bisect = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as { bisect?: unknown }).bisect : undefined;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ schema: SCHEMA, rows: spacingRows(), bisect: bisect ?? [] }, null, 1)}\n`);
