// The weekly record of the leaders of the atlas (SOLVED-ATLAS).
// The build derives each week after the newest committed record from the history (ATLAS-WEEKLY). So the weekly sequence needs no start of this script.
// A new committed record moves the start of the derived weeks, and the gate of the build against the live page then fails for each derived week that it removes.
// Start from the root: `node packages/site/scripts/atlas-week.ts [--date YYYY-MM-DD]`. The default date is today in UTC.
// The script writes `docs/research/atlas/<date>.json` from the committed verdict snapshots. It does not write over a record that exists.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { weekFromFiles, weekText } from "../src/atlas-data.ts";
import { verdictFiles, weekPath } from "../src/atlas-files.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const args = process.argv.slice(2);
const at = args.indexOf("--date");
const date = at < 0 ? new Date().toISOString().slice(0, 10) : args[at + 1];
if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
  console.error("Start: node packages/site/scripts/atlas-week.ts [--date YYYY-MM-DD]");
  process.exit(2);
}
const path = weekPath(root, date);
if (existsSync(path)) {
  console.error(`The record ${path} exists. The script does not write over it. Remove it first to write it again.`);
  process.exit(1);
}
// The build derives each later week from the history with the same function `weekFromFiles` (ATLAS-WEEKLY).
const week = weekFromFiles(verdictFiles(root), date);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, weekText(week));
const leads = week.regions.filter((r) => r.leader.strategy !== r.base).length;
console.log(`The record ${path}: ${week.regions.length} regions, ${leads} with a leader that is not the base.`);
