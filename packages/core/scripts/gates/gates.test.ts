// The gates fail closed (FAIL-CLOSED): each gate gets an empty input and an input with one item missing, and each run must exit with an error that names the input.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const cell = (root: string, os: string, node: string, keys: readonly string[], fault: Readonly<Record<string, string>> = {}): void => {
    const d = join(root, `${os}-${node}`);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "meta.json"), JSON.stringify({ os, node, arch: "x64", v8: `v8-of-${node}`, highways: "0" }));
    writeFileSync(join(d, "routes.jsonl"), keys.map((k) => JSON.stringify({ record: k, router: "shared", hash: "h", again: "h", traced: null, exact: "e", joint: {}, ...fault })).join("\n") + "\n");
  };

  it("fails on an empty folder of cells", () => {
    expect(run("xplat-summary.ts", "--cells", temp(), "--expect", "linux-node26", "--rows", "1").status).not.toBe(0);
  });

  it("fails when one cell of the matrix is missing", () => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a"]);
    const r = run("xplat-summary.ts", "--cells", d, "--expect", "linux-node26,win32-node26", "--rows", "1", "--out", join(d, "x.md"));
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("xplat cells: the gate expected 2 inputs and got 1. Missing: win32-node26.");
  });

  it("fails when one cell lacks a route of the reference cell", () => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a", "b"]);
    cell(d, "win32", "v26.0.0", ["a", "c"]);
    const r = run("xplat-summary.ts", "--cells", d, "--expect", "linux-node26,win32-node26", "--rows", "2", "--out", join(d, "x.md"));
    expect(r.status).not.toBe(0);
    expect(r.text).toContain("xplat routes of the cell win32-node26: the gate expected 2 inputs and got 2. Missing: b/shared. Not in the plan: c/shared.");
  });

  it("fails with no --expect", () => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a"]);
    expect(run("xplat-summary.ts", "--cells", d).status).toBe(2);
  });

  it("fails with no --rows, or with a count that is not a whole number over 0", () => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a"]);
    for (const rows of [[], ["--rows", "0"], ["--rows", "many"]]) {
      const r = run("xplat-summary.ts", "--cells", d, "--expect", "linux-node26", ...rows);
      expect(r.status).toBe(2);
      expect(r.text).toContain("--rows <n> states the rows");
    }
  });

  it("does not need --rows for the targets of the near pass", () => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a"]);
    expect(run("xplat-summary.ts", "--cells", d, "--expect", "linux-node26", "--targets", join(d, "t.json")).status).toBe(0);
  });

  it("fails with its own text on one cell that is short", () => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a", "b"]);
    cell(d, "win32", "v26.0.0", ["a"]);
    const r = run("xplat-summary.ts", "--cells", d, "--expect", "linux-node26,win32-node26", "--rows", "2", "--out", join(d, "x.md"));
    expect(r.status).toBe(2);
    expect(r.text).toContain("win32-node26 holds 1 rows of the stated 2.");
  });

  it("fails on cells that are short alike, and they agree on the rows that they hold", () => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a"]);
    cell(d, "win32", "v26.0.0", ["a"]);
    const expectCells = ["--expect", "linux-node26,win32-node26"];
    expect(run("xplat-summary.ts", "--cells", d, ...expectCells, "--rows", "1", "--out", join(d, "x.md")).status).toBe(0);
    const r = run("xplat-summary.ts", "--cells", d, ...expectCells, "--rows", "2", "--out", join(d, "y.md"));
    expect(r.status).toBe(2);
    expect(r.text).toContain("linux-node26 holds 1 rows of the stated 2.");
    expect(r.text).toContain("win32-node26 holds 1 rows of the stated 2.");
  });

  it("states the V8 version of each cell in the record and in the table", () => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a"]);
    cell(d, "win32", "v24.0.0", ["a"]);
    const out = join(d, "x.md");
    const json = join(d, "x.json");
    expect(run("xplat-summary.ts", "--cells", d, "--expect", "linux-node26,win32-node24", "--rows", "1", "--out", out, "--json", json).status).toBe(0);
    expect(readFileSync(out, "utf8")).toContain("| linux-node26 | linux x64 | v26.0.0 | v8-of-v26.0.0 | 0 |");
    expect(readFileSync(out, "utf8")).toContain("| win32-node24 | win32 x64 | v24.0.0 | v8-of-v24.0.0 | 0 |");
    const record = JSON.parse(readFileSync(json, "utf8")) as { cells: { id: string; meta: { v8: string } }[] };
    expect(record.cells.map((c) => [c.id, c.meta.v8])).toEqual([["linux-node26", "v8-of-v26.0.0"], ["win32-node24", "v8-of-v24.0.0"]]);
  });

  /** This function gives the run of the summary over a linux cell with no fault and a win32 cell with `fault` on each route. */
  const flip = (fault: Readonly<Record<string, string>>) => {
    const d = temp();
    cell(d, "linux", "v26.0.0", ["a", "b"]);
    cell(d, "win32", "v26.0.0", ["a", "b"], fault);
    const out = join(d, "x.md");
    return { ...run("xplat-summary.ts", "--cells", d, "--expect", "linux-node26,win32-node26", "--rows", "2", "--out", out), wrote: existsSync(out) };
  };

  it("passes the copy with no fault, and fails on a route hash that differs between cells", () => {
    const clean = flip({});
    expect(clean.status, clean.text).toBe(0);
    expect(clean.wrote).toBe(true);
    const red = flip({ hash: "other", again: "other" });
    expect(red.status).toBe(1);
    expect(red.text).toContain("a/shared on win32-node26: the route hash differs from linux-node26.");
  });

  it("fails on an exact result that differs under an equal hash, and on repeats that differ in one cell", () => {
    expect(flip({ exact: "other" }).text).toContain("a/shared on win32-node26: the exact result differs from linux-node26.");
    expect(flip({ exact: "other" }).status).toBe(1);
    expect(flip({ again: "other" }).text).toContain("a/shared on win32-node26: the repeats differ.");
    expect(flip({ again: "other" }).status).toBe(1);
  });

  it("writes the record of a red run", () => {
    expect(flip({ hash: "other", again: "other" }).wrote).toBe(true);
  });

  /** This function writes the 4 cells of the matrix of `xplat.yml`, with one traced hash on each row. */
  const matrix = (d: string): void => {
    for (const os of ["linux", "win32"]) for (const node of ["v24.0.0", "v26.0.0"]) cell(d, os, node, ["a", "b"], { traced: "h" });
  };
  const allCells = "linux-node24,linux-node26,win32-node24,win32-node26";

  it("holds the flip of the verdict in a process, with no package and each arm as stated", () => {
    const d = temp();
    matrix(d);
    const out = join(temp(), "flip");
    const r = run("gates/flip.ts", "--check", "xplat", "--cells", d, "--out", out);
    expect(r.status, r.text).toBe(0);
    const record = JSON.parse(readFileSync(join(out, "gate-flip-xplat.json"), "utf8")) as { passed: boolean; arms: { id: string; exit: number; ok: boolean }[] };
    expect(record.passed).toBe(true);
    expect(record.arms.map((a) => [a.id, a.exit, a.ok])).toEqual([["clean", 0, true], ["route", 1, true], ["exact", 1, true], ["repeats", 1, true], ["short-cell", 2, true], ["short-all", 2, true]]);
  });

  it("turns the verdict red on a fault of the dispatch, and a copy with no fault stays green", () => {
    const verdict = (fault?: string) => {
      const d = temp();
      matrix(d);
      if (fault !== undefined) expect(run("gates/flip.ts", "--inject", fault, "--cells", d).status).toBe(0);
      return run("xplat-summary.ts", "--cells", d, "--expect", allCells, "--rows", "2", "--out", join(d, "x.md"));
    };
    const clean = verdict();
    expect(clean.status, clean.text).toBe(0);
    expect(clean.text).toContain("2 rows on 4 cells agree.");
    const route = verdict("route");
    expect(route.status).toBe(1);
    expect(route.text).toContain("a/shared on linux-node24: the route hash differs from linux-node26.");
    const short = verdict("short");
    expect(short.status).toBe(2);
    expect(short.text).toContain("linux-node24 holds 1 rows of the stated 2.");
  });

  it("refuses a fault that it does not know, and it does not change the cell", () => {
    const d = temp();
    matrix(d);
    expect(run("gates/flip.ts", "--inject", "other", "--cells", d).status).not.toBe(0);
    expect(run("xplat-summary.ts", "--cells", d, "--expect", allCells, "--rows", "2", "--out", join(d, "x.md")).status).toBe(0);
  });
});

describe("the pin of the cells of Xplat", () => {
  const repo = (path: string): string => readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), "utf8");
  const workflow = repo(".github/workflows/xplat.yml");

  it("gives Renovate a full version of each major, in each matrix", () => {
    const manager = (JSON.parse(repo("renovate.json")) as { customManagers: { matchStrings: string[] }[] }).customManagers[0]!;
    const found = [...workflow.matchAll(new RegExp(manager.matchStrings[0]!, "g"))].map((m) => [m.groups!["currentValue"]!, m.groups!["depName"]!]);
    expect(found.map(([, name]) => name)).toEqual(["node-24", "node-26", "node-24", "node-26"]);
    for (const [version, name] of found) expect(version!.split(".")[0]).toBe(name!.replace("node-", ""));
    expect(found[0]).toEqual(found[2]);
    expect(found[1]).toEqual(found[3]);
    expect(workflow).not.toContain("node: [24, 26]");
  });

  it("writes the check of the ruleset only from a run that reads the whole check", () => {
    expect(workflow).toContain("name: ${{ ((inputs.all || 'true') == 'true' && (inputs.run || '40688908137') == '40688908137' && (inputs.fault || 'none') == 'none') && 'Xplat OK' || 'Xplat partial' }}");
    expect(workflow).not.toContain("name: Xplat OK");
    expect(workflow).toContain('default: "40688908137"');
    expect(workflow).toContain("RUN: ${{ inputs.run || '40688908137' }}");
  });

  it("states the rows of each run, and a failed download ends the run with its own text", () => {
    expect(workflow).toContain("ROWS: ${{ (inputs.all || 'true') == 'true' && '75' || '10' }}");
    expect(workflow).toContain("::error::The job could not download the artifact xplat-graphs");
    expect(workflow).not.toContain("Only the 3 inputs of the repository go to the matrix");
  });
});
