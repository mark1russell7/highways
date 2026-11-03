import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gitResolver, outputLines, requireFullHash, resolveCommits, type Resolver } from "./commits.ts";
import { InputError } from "./inputs.ts";

let dir = "";
let first = "";
let second = "";
let third = "";

/** This function runs git in the made-up repository, and gives its stdout. */
function git(...argv: string[]): string {
  const out = spawnSync("git", argv, { cwd: dir, encoding: "utf8" });
  if (out.status !== 0) throw new Error(`git ${argv.join(" ")}: ${out.stderr}`);
  return out.stdout.trim();
}

/** This function makes one commit that changes the file `a.txt`, and gives its full hash. */
function commit(text: string): string {
  writeFileSync(join(dir, "a.txt"), text);
  git("add", "a.txt");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "-m", text);
  return git("rev-parse", "HEAD");
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "commits-"));
  git("init", "-q");
  first = commit("first");
  second = commit("second");
  third = commit("third");
});

afterAll(() => {
  if (dir !== "") rmSync(dir, { recursive: true, force: true });
});

describe("the commits of a gate, with git", () => {
  it("resolves a full hash, a short hash and <hash>^1 to full hashes, and keeps the input text", () => {
    const r = resolveCommits({ head: third, parent: second.slice(0, 7) }, gitResolver(dir));
    expect(r).toEqual({ head: { input: third, sha: third }, parent: { input: second.slice(0, 7), sha: second } });
    const up = resolveCommits({ head: second, parent: `${second}^1` }, gitResolver(dir));
    expect(up.parent).toEqual({ input: `${second}^1`, sha: first });
  });

  it("gives the defaults: the head HEAD, and the first parent of the head", () => {
    expect(resolveCommits({}, gitResolver(dir))).toEqual({ head: { input: "HEAD", sha: third }, parent: { input: "HEAD^1", sha: second } });
    const short = second.slice(0, 7);
    expect(resolveCommits({ head: short, parent: "" }, gitResolver(dir))).toEqual({ head: { input: short, sha: second }, parent: { input: `${short}^1`, sha: first } });
  });

  it("fails on a name that does not resolve (FAIL-CLOSED)", () => {
    expect(() => resolveCommits({ head: "no-such-branch" }, gitResolver(dir))).toThrow(InputError);
    expect(() => resolveCommits({ head: "no-such-branch" }, gitResolver(dir))).toThrow('The head "no-such-branch" does not resolve to a commit (FAIL-CLOSED).');
    // The first commit has no parent, so its default parent does not resolve.
    expect(() => resolveCommits({ head: first }, gitResolver(dir))).toThrow(`The parent "${first}^1" does not resolve to a commit (FAIL-CLOSED).`);
    // The hash of a tree is not a commit.
    const tree = git("rev-parse", "HEAD^{tree}");
    expect(gitResolver(dir)(tree)).toBeNull();
    expect(() => resolveCommits({ head: tree }, gitResolver(dir))).toThrow(InputError);
  });

  it("fails on a parent that is the head, and on a name with other characters", () => {
    expect(() => resolveCommits({ head: third, parent: "HEAD" }, gitResolver(dir))).toThrow("are the same commit");
    expect(() => resolveCommits({ head: "--all" }, gitResolver(dir))).toThrow("is not a name of a commit");
    expect(() => resolveCommits({ parent: "HEAD; ls" }, gitResolver(dir))).toThrow("is not a name of a commit");
  });
});

describe("the commits of a gate, with a made-up resolver", () => {
  it("refuses a resolver that gives no full hash", () => {
    const short: Resolver = () => "abc1234";
    expect(() => resolveCommits({}, short)).toThrow('The head "HEAD" resolves to "abc1234", and that is not a full hash.');
  });

  it("writes the lines of $GITHUB_OUTPUT, and checks the full hash of an option", () => {
    const a = "a".repeat(40);
    const b = "b".repeat(40);
    const fixed: Resolver = (name) => (name === "HEAD" ? a : b);
    expect(outputLines(resolveCommits({}, fixed))).toEqual([`head=${a}`, "head-input=HEAD", `parent=${b}`, "parent-input=HEAD^1"]);
    expect(requireFullHash("--head", a)).toBe(a);
    expect(() => requireFullHash("--head", "HEAD~1")).toThrow('The option --head takes a full hash of 40 hex digits, not "HEAD~1".');
    expect(() => requireFullHash("--parent", undefined)).toThrow(InputError);
  });
});
