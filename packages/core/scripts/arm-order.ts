/**
 * This script writes the record `arm-order/1`. The module `arm-order-rows.ts` makes it and tells what it holds.
 * Usage: `node packages/core/scripts/arm-order.ts <directory> <out.json>`. The directory holds one folder for each job, with its file `paired-job*.json`.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { orderRecord, type OrderJob, type SentinelReference } from "./arm-order-rows.ts";

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
const reference = JSON.parse(
  readFileSync(new URL("./data/arm-order/sentinel-reference.json", import.meta.url), "utf8"),
) as { readonly jobs: readonly SentinelReference[] };
const record = orderRecord(jobs, basename(resolve(directory)), reference.jobs);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 1)}\n`);
const { reads, verdict, reason, oneJobReference, noRead, limit } = record.sentinels;
for (const r of reads) console.log(`job ${r.job} ${r.cpu}: level ${r.level?.toFixed(4)}, shape ${r.shape?.toFixed(4)}, A/A ${r.aa.toFixed(4)}, ${r.holds === null ? "no read" : r.holds ? "holds" : "fails"}${r.note ? ` (${r.note})` : ""}`);
console.log(`Sentinels: ${verdict}. ${reason} Jobs on a reference of one job: ${oneJobReference}. Jobs with no read: ${noRead}. ${limit}`);
if (verdict === "fails") process.exitCode = 1;
