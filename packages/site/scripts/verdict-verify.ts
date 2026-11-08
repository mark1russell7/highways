// The read of a committed verdict snapshot on a later core (RESULTS-READ).
// Start: `node packages/site/scripts/verdict-verify.ts <snapshot.json> <verdict.json of a Screen run> [--stamp]`.
// The script compares the rows that the page shows. With the same rows and `--stamp`, it writes the field `verified` into the snapshot, and the rows do not change.
// A read that differs gives the exit code 1 and each row that differs. Then the snapshot needs a pull request with the new rows.
import { readFileSync, writeFileSync } from "node:fs";
import { compareReads, parseSnapshot, stampText } from "../src/results-data.ts";

const [snapshotPath, readPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (snapshotPath === undefined || readPath === undefined) {
  console.error("Start: node packages/site/scripts/verdict-verify.ts <snapshot.json> <verdict.json> [--stamp]");
  process.exit(2);
}
const text = readFileSync(snapshotPath, "utf8");
const snapshot = parseSnapshot(text, snapshotPath);
const read = parseSnapshot(readFileSync(readPath, "utf8"), readPath);
const diffs = compareReads(snapshot, read);
const where = `${snapshot.set} ${snapshot.step}: run ${snapshot.run} on core ${snapshot.core}, read ${read.run} on core ${read.core}`;
if (diffs.length > 0) {
  console.log(`${where}: ${diffs.length} of ${snapshot.rows.length} rows differ.`);
  for (const d of diffs) console.log(`- ${d.key}: ${d.fields.join(", ")}`);
  process.exit(1);
}
console.log(`${where}: the same ${snapshot.rows.length} rows.`);
if (process.argv.includes("--stamp")) {
  writeFileSync(snapshotPath, stampText(text, snapshot, read));
  console.log(`The snapshot ${snapshotPath} has the stamp of run ${read.run}.`);
}
