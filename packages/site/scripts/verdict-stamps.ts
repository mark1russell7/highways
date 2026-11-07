// The stamps of a full read of the verdict snapshots (STAMP-ON-RELEASE).
// Start: `node packages/site/scripts/verdict-stamps.ts <folder>`. The folder holds the artifacts of one run of the workflow `Screen`.
// The script reads each committed snapshot against the file `verdict.json` of its set and step.
// It writes the stamp into each snapshot with the same rows, and it gives a table of each snapshot.
// A snapshot with a row that differs, or with no read, gives the exit code 1. The script does not stamp it.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSnapshot, stampSnapshots } from "../src/results-data.ts";
import { RESULT_FILES, snapshotFiles } from "../src/results-files.ts";

const dir = process.argv[2];
if (dir === undefined) {
  console.error("Start: node packages/site/scripts/verdict-stamps.ts <folder of the artifacts>");
  process.exit(2);
}
const root = fileURLToPath(new URL("../../../", import.meta.url));
const reads = (readdirSync(dir, { recursive: true }) as string[])
  .filter((f) => f.replaceAll("\\", "/").split("/").at(-1) === "verdict.json")
  .sort()
  .map((f) => parseSnapshot(readFileSync(join(dir, f), "utf8"), f));
const outcomes = stampSnapshots(snapshotFiles(root), reads);
console.log("| Snapshot | Result | Read |");
console.log("|---|---|---|");
for (const o of outcomes) {
  if (o.status === "stamped") writeFileSync(join(root, RESULT_FILES.verdicts, o.name), o.text);
  const read = o.status === "unread" ? "" : `run ${o.run} on core ${o.core}`;
  const result = o.status === "stamped" ? "the same rows, stamped" : o.status === "differ" ? `${o.diffs.length} rows differ, not stamped` : "no read";
  console.log(`| \`${o.name}\` | ${result} | ${read} |`);
}
const open = outcomes.filter((o) => o.status !== "stamped");
console.log("");
console.log(`${outcomes.length - open.length} of ${outcomes.length} snapshots have the stamp of this read.`);
for (const o of open) {
  if (o.status === "differ") for (const d of o.diffs) console.log(`- \`${o.name}\` ${d.key}: ${d.fields.join(", ")}`);
}
if (open.length > 0) {
  console.log(`These snapshots need a person: ${open.map((o) => o.name).join(", ")}. A row that differs needs a new snapshot, by the rule of the README of the verdicts.`);
  process.exit(1);
}
