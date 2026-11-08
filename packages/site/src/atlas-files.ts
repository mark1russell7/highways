/// <reference types="node" />
// The build and the script `atlas-week.ts` read the committed files of the atlas with these functions.
// They read the repository on disk. They do not use the network.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWeek, type AtlasWeek, type SnapshotFile } from "./atlas-data.ts";
import { isSnapshotFile, parseSnapshot, type Snapshot } from "./results-data.ts";

/** The folders and the files of the atlas, relative to the root of the repository. */
export const ATLAS_FILES = {
  /** The verdict snapshots `<set>-<step>.json`. */
  verdicts: "docs/research/verdicts",
  /** The weekly records `<date>.json`. */
  weeks: "docs/research/atlas",
  /** The text of the page. */
  text: "packages/site/content/atlas.md",
} as const;

/** The name of a weekly record: its date and `.json`. */
const WEEK_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

/** This function gives the snapshot files of the repository on disk: each JSON file of the folder of verdicts, in the order of the names. */
export function verdictFiles(root: string): SnapshotFile[] {
  const dir = join(root, ATLAS_FILES.verdicts);
  return readdirSync(dir)
    .filter(isSnapshotFile)
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
}

/** This function gives the verdict snapshots of the repository on disk, in the order of the names of the files. */
export const verdictSnapshots = (root: string): Snapshot[] => verdictFiles(root).map((f) => parseSnapshot(f.text, f.name));

/** This function gives the path of the weekly record of a date. */
export const weekPath = (root: string, date: string): string => join(root, ATLAS_FILES.weeks, `${date}.json`);

/** This function gives each weekly record of the repository, in the order of the dates. A folder with no record gives an empty list. */
export function atlasWeeks(root: string): AtlasWeek[] {
  const dir = join(root, ATLAS_FILES.weeks);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => WEEK_FILE.test(f))
    .sort()
    .map((f) => {
      const week = parseWeek(readFileSync(join(dir, f), "utf8"), f);
      if (`${week.date}.json` !== f) throw new Error(`The record ${f} has the date ${week.date}.`);
      return week;
    });
}
