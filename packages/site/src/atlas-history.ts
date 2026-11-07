/// <reference types="node" />
// The build derives each week of the atlas after the newest committed record from the git history with these functions (ATLAS-WEEKLY).
// Only `vite.config.ts` and the tests use them. They start git with a list of arguments and no shell.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { byText, weekFromFiles, weekText, type AtlasWeek, type SnapshotFile } from "./atlas-data.ts";
import { ATLAS_FILES, atlasWeeks } from "./atlas-files.ts";
import { ATLAS_WEEKS_FILE, ATLAS_WEEKS_FORMAT, endOfDay, LIVE_SITE, liveVerdict, weekDates, type AtlasWeeksFile, type LiveAnswer, type LiveVerdict, type WeekGap, type WeekSource } from "./atlas-weeks.ts";
import { isSnapshotFile } from "./results-data.ts";

/** The largest output of one start of git: 512 MiB. */
const MAX_BUFFER = 512 * 1024 * 1024;

/** This function starts git in `root` with a list of arguments, and gives its output. */
const git = (root: string, args: readonly string[], input?: string): Buffer => execFileSync("git", args, { cwd: root, input, maxBuffer: MAX_BUFFER, stdio: ["pipe", "pipe", "pipe"] });

/** This function gives the trimmed text output of git in `root`. */
const gitText = (root: string, args: readonly string[]): string => git(root, args).toString("utf8").trim();

/**
 * This function gives the commit that a week reads. It is the last commit of the first-parent history of `HEAD` at or before the end of the date in UTC.
 *
 * The option `--before` of `git rev-list` compares the committer date, not the author date. A rebase keeps the old author date, but it gives a new committer date.
 * The first-parent history is the sequence of the merges to `main`. So a commit of a branch does not count before its merge.
 * The text is empty when the history has no such commit.
 */
export const weekCommit = (root: string, date: string): string => gitText(root, ["rev-list", "--first-parent", "-1", `--before=${endOfDay(date)}`, "HEAD"]);

/**
 * This function gives the snapshot files of a commit: each blob of the folder of verdicts that `isSnapshotFile` accepts, in the order of the names.
 * It reads the tree with `git ls-tree` and the blobs with one `git cat-file --batch`.
 */
export function filesAt(root: string, commit: string): SnapshotFile[] {
  const tree = git(root, ["ls-tree", "-z", commit, "--", `${ATLAS_FILES.verdicts}/`]).toString("utf8");
  const blobs: { name: string; id: string }[] = [];
  for (const entry of tree.split("\0")) {
    const m = /^\d+ (\w+) ([0-9a-f]+)\t(.+)$/.exec(entry);
    if (m === null || m[1] !== "blob") continue;
    const name = posix.basename(m[3]!);
    if (isSnapshotFile(name)) blobs.push({ name, id: m[2]! });
  }
  blobs.sort((a, b) => byText(a.name, b.name));
  if (blobs.length === 0) return [];
  // Each answer of `git cat-file --batch` is a line `<id> <type> <size>`, the bytes of the object and a line end.
  const out = git(root, ["cat-file", "--batch"], `${blobs.map((b) => b.id).join("\n")}\n`);
  const files: SnapshotFile[] = [];
  let at = 0;
  for (const b of blobs) {
    const eol = out.indexOf(0x0a, at);
    const head = out.subarray(at, eol).toString("utf8").split(" ");
    if (head[0] !== b.id || head[1] !== "blob") throw new Error(`git cat-file gave "${head.join(" ")}" for the blob ${b.id} of ${b.name}.`);
    const size = Number(head[2]);
    files.push({ name: b.name, text: out.subarray(eol + 1, eol + 1 + size).toString("utf8") });
    at = eol + 1 + size + 1;
  }
  return files;
}

/** This function gives the weekly record of a date from the snapshot files of a commit, with the same function `weekFromFiles` as the script `atlas-week.ts`. */
export const weekAt = (root: string, commit: string, date: string): AtlasWeek => weekFromFiles(filesAt(root, commit), date);

/** This function gives the SHA-256 of a weekly record: the hash of its text, as `weekText` gives it. */
export const weekHash = (week: AtlasWeek): string => createHash("sha256").update(weekText(week)).digest("hex");

/** The weekly records of the page and the file `atlas-weeks.json`. */
export interface AtlasHistory {
  /** The committed records and the derived records, in the order of the dates. */
  readonly weeks: readonly AtlasWeek[];
  readonly file: AtlasWeeksFile;
}

/** This function gives the reason that the build has no commit for a week. */
function noCommitReason(root: string, date: string): string {
  let shallow = false;
  try {
    shallow = gitText(root, ["rev-parse", "--is-shallow-repository"]) === "true";
  } catch {
    shallow = false;
  }
  return shallow
    ? `The checkout is shallow, and it has no commit at or before ${endOfDay(date)}. A checkout of the full history derives this week.`
    : `The history has no commit at or before ${endOfDay(date)}.`;
}

/**
 * This function gives the committed records and the derived records of the atlas.
 * It derives each week from 7 days after the newest committed record, in steps of 7 days, to the build date.
 * A week with no commit, or with a failure of git, goes to `skipped` with its reason. So the build does not fail, and the page tells the gap.
 *
 * @param root - The root of the repository.
 * @param built - The date of the build, as `YYYY-MM-DD` in UTC.
 */
export function atlasHistory(root: string, built: string): AtlasHistory {
  const committed = atlasWeeks(root);
  const weeks: AtlasWeek[] = [...committed];
  const sources: WeekSource[] = committed.map((w) => ({ date: w.date, source: "committed", commit: "", final: true, sha256: weekHash(w) }));
  const skipped: WeekGap[] = [];
  const dates = weekDates(committed.at(-1)?.date ?? "", built);
  let head = "";
  let headTime = 0;
  try {
    head = gitText(root, ["rev-parse", "HEAD"]);
    headTime = Number(gitText(root, ["log", "-1", "--format=%ct", "HEAD"]));
  } catch (e) {
    const reason = `The build cannot read the git history: ${(e as Error).message.split("\n")[0]}`;
    return { weeks, file: { format: ATLAS_WEEKS_FORMAT, built, head, weeks: sources, skipped: dates.map((date) => ({ date, reason })) } };
  }
  // Two weeks with no commit between them read the same commit, so the build reads each commit one time.
  const byCommit = new Map<string, SnapshotFile[]>();
  for (const date of dates) {
    try {
      const commit = weekCommit(root, date);
      if (commit === "") {
        skipped.push({ date, reason: noCommitReason(root, date) });
        continue;
      }
      const files = byCommit.get(commit) ?? filesAt(root, commit);
      byCommit.set(commit, files);
      const week = weekFromFiles(files, date);
      weeks.push(week);
      // The committer date of HEAD is after the end of the week, so a later merge to main cannot add a commit to the week.
      const final = headTime > Date.parse(endOfDay(date)) / 1000;
      sources.push({ date, source: "derived", commit, final, sha256: weekHash(week) });
    } catch (e) {
      skipped.push({ date, reason: `The build cannot derive this week: ${(e as Error).message.split("\n")[0]}` });
    }
  }
  return { weeks, file: { format: ATLAS_WEEKS_FORMAT, built, head, weeks: sources, skipped } };
}

/** The longest time of one fetch of the live site: 30 seconds. */
const FETCH_MS = 30_000;

/** This function fetches one file of the live site. A query with the time skips the cache of the host. An error of the network gives an answer with the error. */
async function fetchLive(name: string): Promise<LiveAnswer> {
  try {
    const res = await fetch(`${LIVE_SITE}${name}?build=${Date.now()}`, { signal: AbortSignal.timeout(FETCH_MS), redirect: "follow" });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * This function compares the weeks of this build with the weeks of the live site.
 * It fetches the live `atlas-weeks.json`, and after a 404 also the live `atlas.html`. The decision is `liveVerdict`.
 */
export async function liveGate(file: AtlasWeeksFile): Promise<LiveVerdict> {
  const weeks = await fetchLive(ATLAS_WEEKS_FILE);
  const page = !("error" in weeks) && weeks.status === 404 ? await fetchLive("atlas.html") : undefined;
  return liveVerdict(file, weeks, page);
}
