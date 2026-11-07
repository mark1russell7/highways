import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { weekLeaders, weekText } from "./atlas-data.ts";
import { ATLAS_FILES, atlasWeeks, weekPath } from "./atlas-files.ts";
import { atlasHistory, filesAt, weekAt, weekCommit, weekHash } from "./atlas-history.ts";
import type { Snapshot } from "./results-data.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const git = (cwd: string, args: readonly string[], env: Readonly<Record<string, string>> = {}): string =>
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { cwd, encoding: "utf8", env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] }).trim();

// The gate of the derivation: the build and the script `atlas-week.ts` give the same record.
describe("the newest committed record", () => {
  const newest = atlasWeeks(root).at(-1)!;
  const file = `${ATLAS_FILES.weeks}/${newest.date}.json`;
  const added = git(root, ["log", "--diff-filter=A", "-1", "--format=%H", "--", file]);

  // The script read the working tree of the branch of the pull request. The squash merge of that branch is the commit that added the file,
  // so its tree is the state that the script read. The parent of that commit is main before the merge. The parent gives the same
  // record only when the pull request changed no snapshot. For 2026-11-07 (#378) both match, because #378 changed only `verdicts/README.md`.
  // The gate uses the commit that added the file, because that commit is the state that the script read in each case.
  it("is the week that the build derives at the commit that added it", () => {
    expect(added, `The checkout has no commit that added ${file}. The test needs the full history (fetch-depth 0).`).toMatch(/^[0-9a-f]{40}$/);
    expect(weekText(weekAt(root, added, newest.date))).toBe(readFileSync(weekPath(root, newest.date), "utf8"));
  });

  it("gives the same SHA-256 for the committed record and for the derived record", () => {
    expect(weekHash(weekAt(root, added, newest.date))).toBe(weekHash(newest));
  });

  it("reads the same file set at HEAD as the folder on disk", () => {
    const names = filesAt(root, git(root, ["rev-parse", "HEAD"])).map((f) => f.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => n.endsWith(".json"))).toBe(true);
    expect(names).toEqual([...names].sort());
  });
});

/** This function gives a made-up snapshot of the set `toy` and the step `router`, where `leader` wins the family `f`. */
function snapshot(leader: string, run: number): Snapshot {
  return {
    set: "toy",
    step: "router",
    base: "alpha",
    level: 0.05,
    run,
    commit: "c0ffee",
    date: "2026-11-01",
    core: "0.1.0",
    rows: [
      {
        strategy: leader,
        guard: "R1",
        measure: "m.R1",
        label: "better",
        old: "no verdict",
        stratified: 1,
        pooled: 1,
        p: 0.01,
        families: [{ family: "f", n: 4, mean: 2, sign: 1 }],
        breadth: { against: 0, of: 1, ties: 0 },
      },
    ],
  };
}

// A made-up repository with dates that test the rules of the derivation:
// c1 (committer 11-07): the record of 2026-11-07 and the leader beta.
// c2 (committer 11-12) on a branch: the leader gamma. Its merge m1 (committer 11-16) puts it on the first-parent history.
// c3 (author 11-02, committer 11-25): the leader delta. Its old author date does not count.
describe("atlasHistory on a made-up history", () => {
  let dir = "";
  let shallow = "";
  const ids: Record<string, string> = {};
  const at = (when: string, author = when): Record<string, string> => ({ GIT_AUTHOR_DATE: author, GIT_COMMITTER_DATE: when });
  const put = (path: string, text: string): void => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const lead = (leader: string, run: number): void => put(`${ATLAS_FILES.verdicts}/toy-router.json`, `${JSON.stringify(snapshot(leader, run))}\n`);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "atlas-history-"));
    git(dir, ["init", "-q", "-b", "main"]);
    lead("beta", 1);
    put(`${ATLAS_FILES.verdicts}/README.md`, "Not a snapshot.\n");
    put(`${ATLAS_FILES.verdicts}/all/toy-router.json`, "A file of a folder is not a snapshot of the step.\n");
    put(`${ATLAS_FILES.weeks}/2026-11-07.json`, weekText(weekLeaders([snapshot("beta", 1)], "2026-11-07")));
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "c1"], at("2026-11-07T10:00:00Z"));
    ids["c1"] = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["checkout", "-q", "-b", "side"]);
    lead("gamma", 2);
    git(dir, ["commit", "-q", "-am", "c2"], at("2026-11-12T10:00:00Z"));
    ids["c2"] = git(dir, ["rev-parse", "HEAD"]);
    git(dir, ["checkout", "-q", "main"]);
    git(dir, ["merge", "-q", "--no-ff", "-m", "m1", "side"], at("2026-11-16T10:00:00Z"));
    ids["m1"] = git(dir, ["rev-parse", "HEAD"]);
    lead("delta", 3);
    git(dir, ["commit", "-q", "-am", "c3"], at("2026-11-25T10:00:00Z", "2026-11-02T10:00:00Z"));
    ids["c3"] = git(dir, ["rev-parse", "HEAD"]);
    shallow = mkdtempSync(join(tmpdir(), "atlas-shallow-"));
    git(shallow, ["clone", "-q", "--depth", "1", pathToFileURL(dir).href, "."]);
  });

  afterAll(() => {
    for (const d of [dir, shallow]) if (d !== "") rmSync(d, { recursive: true, force: true });
  });

  it("reads the first-parent history, so a commit of a branch counts only after its merge", () => {
    expect(weekCommit(dir, "2026-11-14")).toBe(ids["c1"]);
    expect(git(dir, ["rev-list", "-1", "--before=2026-11-14T23:59:59Z", "HEAD"])).toBe(ids["c2"]);
  });

  it("reads the committer date, not the author date", () => {
    expect(weekCommit(dir, "2026-11-21")).toBe(ids["m1"]);
    expect(weekCommit(dir, "2026-11-28")).toBe(ids["c3"]);
  });

  it("reads only the JSON files of the folder of verdicts", () => {
    expect(filesAt(dir, ids["c1"]!).map((f) => f.name)).toEqual(["toy-router.json"]);
  });

  it("derives each week after the newest committed record, with its source and its state", () => {
    const h = atlasHistory(dir, "2026-11-28");
    expect(h.weeks.map((w) => [w.date, w.regions[0]!.leader.strategy])).toEqual([
      ["2026-11-07", "beta"],
      ["2026-11-14", "beta"],
      ["2026-11-21", "gamma"],
      ["2026-11-28", "delta"],
    ]);
    expect(h.file.weeks.map((w) => [w.date, w.source, w.commit, w.final])).toEqual([
      ["2026-11-07", "committed", "", true],
      ["2026-11-14", "derived", ids["c1"], true],
      ["2026-11-21", "derived", ids["m1"], true],
      // HEAD is from 11-25, so a later merge on 11-28 can change this week.
      ["2026-11-28", "derived", ids["c3"], false],
    ]);
    expect(h.file).toMatchObject({ format: "atlas-weeks/1", built: "2026-11-28", head: ids["c3"], skipped: [] });
    for (let i = 0; i < h.weeks.length; i++) expect(h.file.weeks[i]!.sha256).toBe(weekHash(h.weeks[i]!));
  });

  it("derives no week before the next date", () => {
    expect(atlasHistory(dir, "2026-11-13").file.weeks.map((w) => w.source)).toEqual(["committed"]);
  });

  it("gives each week that a shallow checkout cannot derive, with the reason", () => {
    const h = atlasHistory(shallow, "2026-11-28");
    expect(h.file.weeks.map((w) => [w.date, w.source])).toEqual([
      ["2026-11-07", "committed"],
      ["2026-11-28", "derived"],
    ]);
    expect(h.file.skipped.map((g) => g.date)).toEqual(["2026-11-14", "2026-11-21"]);
    for (const g of h.file.skipped) expect(g.reason).toMatch(/shallow/);
  });
});
