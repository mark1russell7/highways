/**
 * This script writes the record `arm-order/1`. The module `arm-order-rows.ts` makes it and tells what it holds.
 * Usage: `node packages/core/scripts/arm-order.ts <directory> <out.json>`. The directory holds one folder for each job, with its file `paired-job*.json`.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { orderRecord, type OrderJob } from "./arm-order-rows.ts";

const [directory, out] = process.argv.slice(2);
if (!directory || !out)
  throw new Error(
    "Usage: node packages/core/scripts/arm-order.ts <directory> <out.json>",
  );
const jobs: OrderJob[] = readdirSync(directory, {
  recursive: true,
  encoding: "utf8",
})
  .filter((name) => /^paired-job.*\.json$/.test(basename(name)))
  .sort()
  .map(
    (name) =>
      JSON.parse(readFileSync(join(directory, name), "utf8")) as OrderJob,
  );
const record = orderRecord(jobs, basename(resolve(directory)));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 1)}\n`);
