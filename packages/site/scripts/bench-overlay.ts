// The first step of the Pages build: it replaces the committed snapshot with the newer record of the branch `bench-data`.
// The committed snapshot stays when the branch is absent or older, and the data gate of the pages then reads its age.
// Start from the root of the repository: `node packages/site/scripts/bench-overlay.ts`.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BenchMeta } from "../src/bench-label.ts";
import { BENCH_BRANCH, isLaterRecord, recordFault } from "../src/bench-land.ts";
import { RESULT_FILES } from "../src/results-files.ts";

/** This function gives the text of a file of the fetched branch. */
const branchFile = (name: string): string => execFileSync("git", ["show", `FETCH_HEAD:${name}`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

try {
  execFileSync("git", ["fetch", "--depth", "1", "origin", BENCH_BRANCH], { stdio: "pipe" });
} catch {
  console.log(`The branch ${BENCH_BRANCH} gives nothing, so the committed snapshot stays.`);
  process.exit(0);
}

const metaText = branchFile("bench-meta.json");
const rowsText = branchFile("bench.json");
const meta = JSON.parse(metaText) as BenchMeta;
const current = JSON.parse(readFileSync(join(RESULT_FILES.bench, "bench-meta.json"), "utf8")) as BenchMeta;
const fault = recordFault(JSON.parse(rowsText), meta);
if (fault !== undefined) throw new Error(`The branch ${BENCH_BRANCH} holds a bad record: ${fault}`);

if (isLaterRecord(meta, current)) {
  writeFileSync(join(RESULT_FILES.bench, "bench.json"), rowsText);
  writeFileSync(join(RESULT_FILES.bench, "bench-meta.json"), metaText);
  console.log(`The build reads run ${meta.run} of the branch ${BENCH_BRANCH}.`);
} else console.log(`The committed snapshot is not older than run ${meta.run}, so it stays.`);
