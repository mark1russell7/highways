// The gates fail closed (FAIL-CLOSED): each gate gets an empty input and an input with one item missing, and each run must exit with an error that names the input.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = (name: string): string => fileURLToPath(new URL(`../${name}`, import.meta.url));
const run = (name: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [script(name), ...args], { encoding: "utf8" });
  return { status: r.status, text: `${r.stdout}\n${r.stderr}` };
};

const dirs: string[] = [];
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "gates-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("bench-join", () => {
  it("fails on an empty folder of parts", () => {
    const r = run("bench-join.ts", "--parts", temp(), "--expect", "a,b");
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("bench-join rows: the gate expected 2 inputs and got 0. Missing: a, b.");
  });

  it("fails when one part has no report", () => {
    const d = temp();
    for (const f of ["bench-a.json", "bench-b.json", "report-a.json"]) writeFileSync(join(d, f), "[]");
    const r = run("bench-join.ts", "--parts", d, "--expect", "a,b");
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("bench-join reports: the gate expected 2 inputs and got 1. Missing: b.");
  });

  it("fails with no --expect", () => {
    expect(run("bench-join.ts", "--parts", temp()).status).not.toBe(0);
  });
});

describe("exact --merge", () => {
  it("fails on an empty folder of shards", () => {
    const r = run("exact.ts", "--merge", temp(), "--shards", "2");
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("exact shards: the gate expected 2 inputs and got 0. Missing: 0, 1.");
  });

  it("fails when one shard of the plan has no file", () => {
    const d = temp();
    mkdirSync(join(d, "exact-shard-0"));
    writeFileSync(join(d, "exact-shard-0", "exact-0.jsonl"), "");
    const r = run("exact.ts", "--merge", d, "--shards", "2");
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("Missing: 1.");
  });

  it("fails when the shards hold no solve", () => {
    const d = temp();
    for (const i of [0, 1]) writeFileSync(join(d, `exact-${i}.jsonl`), "\n");
    const r = run("exact.ts", "--merge", d, "--shards", "2");
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("hold no solve");
  });

  it("fails with no --shards", () => {
    expect(run("exact.ts", "--merge", temp()).text).toContain("needs --shards");
  });
});

describe("screen-verdict", () => {
  const records = (pairs: readonly [string, string][]): string => pairs.map(([strategy, input]) => JSON.stringify({ step: "router", strategy, input, set: "t", seed: 0 })).join("\n") + "\n";

  it("fails on an empty file of records", () => {
    const f = join(temp(), "screen.jsonl");
    writeFileSync(f, "");
    const r = run("screen-verdict.ts", f);
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("there is no record");
  });

  it("fails when one strategy has no record on one input", () => {
    const f = join(temp(), "screen.jsonl");
    writeFileSync(f, records([["shared", "t/a/s0"], ["shared", "t/b/s0"], ["corners", "t/a/s0"]]));
    const r = run("screen-verdict.ts", f);
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("the strategy corners: the gate expected 2 inputs and got 1. Missing: t/b/s0.");
  });
});

describe("promotion", () => {
  it("fails on an empty file of records", () => {
    const f = join(temp(), "screen.jsonl");
    writeFileSync(f, "");
    const r = run("promotion.ts", "--candidate", "c", "--baseline", "b", "--corpus", f, "--out", join(temp(), "p.md"));
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("give no records");
  });

  it("fails when one named set is empty, and the other set has records", () => {
    const d = temp();
    const full = join(d, "corpus.jsonl");
    const empty = join(d, "fresh.jsonl");
    writeFileSync(full, JSON.stringify({ step: "router", strategy: "b", input: "t/a/s0", set: "t", seed: 0, measures: {}, hard: {} }) + "\n");
    writeFileSync(empty, "");
    const r = run("promotion.ts", "--candidate", "c", "--baseline", "b", "--corpus", full, "--fresh", empty, "--out", join(d, "p.md"));
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("The files of --fresh");
  });
});

describe("xplat", () => {
  it("fails on a folder with no input", () => {
    const d = temp();
    const r = run("xplat.ts", "--inputs", d, "--out", join(d, "out"));
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("hold no input with a graph");
  });

  it("fails on a folder whose only file has no graph", () => {
    const d = temp();
    writeFileSync(join(d, "notes.json"), "{}");
    const r = run("xplat.ts", "--inputs", d, "--out", join(d, "out"));
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("has no graph");
  });
});

describe("xplat-summary", () => {
  const cell = (root: string, os: string, node: string, keys: readonly string[]): void => {
    const d = join(root, `${os}-${node}`);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "meta.json"), JSON.stringify({ os, node, arch: "x64", v8: "0", highways: "0" }));
    writeFileSync(join(d, "routes.jsonl"), keys.map((k) => JSON.stringify({ record: k, router: "shared", hash: "h", again: "h", traced: null })).join("\n") + "\n");
  };

  it("fails on an empty folder of cells", () => {
    expect(run("xplat-summary.ts", "--cells", temp(), "--expect", "linux-node26").status).not.toBe(0);
  });

  it("fails when one cell of the matrix is missing", () => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a"]);
    const r = run("xplat-summary.ts", "--cells", d, "--expect", "linux-node26,win32-node26", "--out", join(d, "x.md"));
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("xplat cells: the gate expected 2 inputs and got 1. Missing: win32-node26.");
  });

  it("fails when one cell lacks a route of the reference cell", () => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a", "b"]);
    cell(d, "win32", "v26.0.0", ["a"]);
    const r = run("xplat-summary.ts", "--cells", d, "--expect", "linux-node26,win32-node26", "--out", join(d, "x.md"));
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("xplat routes of the cell win32-node26: the gate expected 2 inputs and got 1. Missing: b/shared.");
  });

  it("fails with no --expect", () => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a"]);
    expect(run("xplat-summary.ts", "--cells", d).status).toBe(2);
  });
});
