/// <reference types="node" />
// The build and the tests read the committed sweep records with these functions. They read the repository on disk, and they do not use the network.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SWEEP_DIR, sweepFacts, type ExplorerPage } from "./explorer-data.ts";

/** One sweep record of the folder, with the date of its last commit. */
export interface SweepFile {
  readonly file: string;
  /** The parsed JSON of the file. */
  readonly record: unknown;
  /** The date of the last commit of the file, in the form `YYYY-MM-DD`. A file with no commit has no date. */
  readonly date?: string;
}

/** This function gives the date of the last commit of a file, or `undefined` outside a git checkout and for a file with no commit. */
function commitDate(root: string, path: string): string | undefined {
  try {
    const date = execFileSync("git", ["log", "-1", "--format=%cs", "--", path], { cwd: root, encoding: "utf8" }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  } catch {
    return undefined;
  }
}

/** This function reads each JSON file of the folder of the sweep records, in the order of the names. A missing folder gives no file. */
export function sweepFiles(root: string): SweepFile[] {
  const dir = join(root, SWEEP_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const record = JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown;
      const date = commitDate(root, `${SWEEP_DIR}/${file}`);
      return date === undefined ? { file, record } : { file, record, date };
    });
}

/**
 * This function gives the data of the explorer page: the newest record of the folder.
 * The order is the date of the last commit of a file, and then its name.
 * A file with no commit is the newest, so a local build shows a new record before its commit.
 * A folder with no record stops the build, because the page then has nothing to show.
 */
export function explorerPage(root: string): ExplorerPage {
  const files = sweepFiles(root);
  const key = (f: SweepFile): string => `${f.date ?? "9999-99-99"} ${f.file}`;
  const newest = [...files].sort((a, b) => key(a).localeCompare(key(b))).at(-1);
  if (newest === undefined) throw new Error(`The folder ${SWEEP_DIR} has no sweep record, so the explorer page has nothing to show.`);
  return {
    record: newest.record,
    facts: sweepFacts(newest.file, newest.record, newest.date),
    others: files.filter((f) => f !== newest).map((f) => f.file),
  };
}
