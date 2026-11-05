// The step of `Bench` that prepares a record for the branch `bench-data`. It writes the two files, or it stops with the reason.
// Start: `node packages/site/scripts/bench-land.ts <bench.json> <tree> <run> <sha> <time> <core> <max>`. The folder `tree` holds the branch.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BenchMeta } from "../src/bench-label.ts";
import { isLaterRecord, metaOfRun, recordFault } from "../src/bench-land.ts";

const [file, tree, run, sha, time, core, max] = process.argv.slice(2);
if (file === undefined || tree === undefined || run === undefined || sha === undefined || time === undefined || core === undefined || max === undefined) {
  throw new Error("Give the file, the tree, the run, the commit, the time, the core and the largest fixture.");
}

const text = readFileSync(file, "utf8");
const meta = metaOfRun({ run: Number(run), sha, time, core, max: Number(max) });
const fault = recordFault(JSON.parse(text), meta);
if (fault !== undefined) throw new Error(fault);

const metaFile = join(tree, "bench-meta.json");
const current = existsSync(metaFile) ? (JSON.parse(readFileSync(metaFile, "utf8")) as BenchMeta) : undefined;
// A run that starts again lands an older record than the branch holds. The job stops, so the page does not go back in time.
if (!isLaterRecord(meta, current)) throw new Error(`The branch holds run ${current?.run}, which is not older than run ${run}.`);

writeFileSync(join(tree, "bench.json"), text);
writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`Run ${run} lands on the core ${core}.`);
