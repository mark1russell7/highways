/**
 * This script writes the record `through-check/3`. It compares the field `through` of each route with the independent check of `src/bench/measures/through-check.ts` (THROUGH-CHECK).
 * The module `through-check-rows.ts` makes the rows and tells what they hold. The gate `through-check.test.ts` fails when this record is stale.
 *
 * The first argument is the out file. The variable `SEEDS` sets the seeds, and its default is 3.
 * The variable `ROUTERS` is a list of names of routers that mark `through`, with commas, and the variable `FAMILIES` is a list of family names. Each default is all.
 * The routers of `OUTSIDE` are in each record: the variable `ROUTERS` does not remove them.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { throughRecord } from "./through-check-rows.ts";

const OUT = process.argv[2] ?? "out/through-check.json";
const only = (name: string): readonly string[] | undefined => process.env[name]?.split(",");

const record = throughRecord(Number(process.env["SEEDS"] ?? 3), { routers: only("ROUTERS"), families: only("FAMILIES"), log: (line) => console.log(line) });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);
