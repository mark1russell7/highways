// The flip tests of the gate checks (GATE-FLIP): an injected fault of a stated size turns a check red, and a copy with no fault stays green in the same job.
// `node packages/core/scripts/gates/flip.ts --check <heap|work|sections|xplat> --out <dir> [--rounds <n>] [--trees <dir>] [--cells <dir>]` writes `<dir>/gate-flip-<check>.json` and `.md`.
// The exit code is 0 only when each arm gives its stated exit code and its stated reason. So a crash is not a red, and a run that cannot decide is not a green.
//
// - `heap` runs the gate of `scripts/heap.ts` on `corners` at its real budget: clean, with a fault of `HEAP_FAULT_MB`, and with a budget of `null`.
// - `work` runs the compare of `same-stops.ts` on real stops: the same file twice, and a copy with one stop changed.
// - `sections` runs `sections-bisect.ts --gate` on two commits on top of the checkout: an empty commit, and a commit that spins `SECTIONS_FAULT_SHARE` of the route time.
// - `xplat` runs `xplat-summary.ts` on copies of the real rows of the reference cell in `--cells`.
//   The arms are a clean copy, a route, an exact result and a repeat that differ, and rows removed from one cell and from each cell.
//   This arm needs no installed package, so the job `summary` of `xplat.yml` can start it.
// - `--inject <route|short> --cells <dir>` changes one real cell in place, for the dispatch that reads the gate of that workflow.
//
// The commits of `sections` are made with the plumbing of git, so the checkout does not change. An arm that cannot decide takes the second attempt, as the job `retry` does.
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { recordVerdict, type GateRecord } from "../sections-gate-verdict.ts";
import { envOf, type RecordEnv } from "./paired.ts";

/** The schema of the record. */
export const SCHEMA = "gate-flip/1";
/** The router of the flip of the heap gate. */
export const HEAP_ROUTER = "corners";
/** The fault of the heap gate, in MB. The budget of `corners` is 221 MB, and its peak is 147 MB. */
export const HEAP_FAULT_MB = 150;
/** The fault of the sections gate: the spin as a share of the route time. The margin of the gate against the parent is log(1.05). */
export const SECTIONS_FAULT_SHARE = 0.2;
/** The file that the fault of the sections gate changes. */
export const SECTIONS_FILE = "packages/core/src/routers/sections.ts";

/** The cells of the matrix of `xplat.yml`. The first cell is the reference cell. */
export const XPLAT_CELLS = ["linux-node26", "linux-node24", "win32-node24", "win32-node26"] as const;
/** The cell that a fault changes. It is not the reference cell. */
export const XPLAT_FAULT_CELL = "linux-node24";

/** What an arm gave. */
export interface ArmRead {
  readonly id: string;
  /** The stated fault, or `null` for a clean copy. */
  readonly fault: string | null;
  readonly exit: number | null;
  /** The text of the arm that holds the reason. */
  readonly text: string;
  /** The ratio of the head against the parent, for a time check. */
  readonly ratio?: number | null;
}

/** What an arm must give. */
export interface ArmWant {
  readonly exit: number;
  /** A part of the text of the arm. */
  readonly reason: string;
}

/** One arm of the record. */
export interface FlipArm extends ArmRead {
  readonly want: ArmWant;
  readonly ok: boolean;
}

/** The record of one check. */
export interface FlipRecord {
  readonly schema: typeof SCHEMA;
  readonly check: string;
  readonly arms: readonly FlipArm[];
  /** This value is `true` when each arm gives its stated exit code and reason, and the arms hold a clean copy and a fault. */
  readonly passed: boolean;
  readonly env: RecordEnv;
}

/** This function compares what an arm gave with what it must give. An exit code alone does not pass, so a crash is not a red. */
export function judge(read: ArmRead, want: ArmWant): FlipArm {
  return { ...read, want, ok: read.exit === want.exit && read.text.includes(want.reason) };
}

/** This function decides a flip. It needs a clean arm that exits with 0 and a fault arm that does not. */
export function flipPassed(arms: readonly FlipArm[]): boolean {
  return arms.every((a) => a.ok) && arms.some((a) => a.fault === null && a.exit === 0) && arms.some((a) => a.fault !== null && a.exit !== 0);
}

/** This function gives the source of the fault of the sections gate. The router spins for the share of its route time, after the route. */
export function withSpin(source: string, share: number): string {
  const anchor = "export function sectionsRouter(options: SectionsOptions): Router {";
  if (source.split(anchor).length !== 2) throw new Error(`The file does not hold one "${anchor}".`);
  return `${source.replace(anchor, "function flipPlainRouter(options: SectionsOptions): Router {")}
export function sectionsRouter(options: SectionsOptions): Router {
  const router = flipPlainRouter(options);
  return {
    ...router,
    route(input: Graph): Result {
      const start = performance.now();
      const result = router.route(input);
      const until = start + (performance.now() - start) * ${1 + share};
      while (performance.now() < until);
      return result;
    },
  };
}
`;
}

/** This function changes one stop of a file of stops. */
export function changeOneStop(text: string): string {
  const [first, ...rest] = text.split("\n");
  const stop = JSON.parse(first!) as { evaluations: number };
  return [JSON.stringify({ ...stop, evaluations: stop.evaluations + 1 }), ...rest].join("\n");
}

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/** This function starts a script with this node and gives its exit code and its output. */
function runNode(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): { exit: number | null; text: string } {
  const out = spawnSync(process.execPath, argv, { encoding: "utf8", env, maxBuffer: 2 ** 28 });
  if (out.error !== undefined) throw out.error;
  return { exit: out.status, text: `${out.stdout}${out.stderr}` };
}

/** This function gives the flip of the heap gate. */
function heapFlip(dir: string): FlipArm[] {
  const budgets = JSON.parse(readFileSync(here("../data/heap/budgets.json"), "utf8")) as { routers: Readonly<Record<string, unknown>> };
  const gate = (id: string, measure: unknown, env?: NodeJS.ProcessEnv): { exit: number | null; text: string } => {
    const file = join(dir, `budgets-${id}.json`);
    writeFileSync(file, JSON.stringify({ ...budgets, routers: { [HEAP_ROUTER]: measure } }));
    return runNode([here("../heap.ts"), "--budgets", file, "--out", join(dir, `heap-${id}.jsonl`)], env);
  };
  const real = budgets.routers[HEAP_ROUTER];
  const fault = { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(here("./flip-memory.ts")).href}`, FLIP_ALLOCATE_MB: String(HEAP_FAULT_MB) };
  return [
    judge({ id: "clean", fault: null, ...gate("clean", real) }, { exit: 0, reason: ", pass." }),
    judge({ id: "memory", fault: `${HEAP_FAULT_MB} MB held in the process`, ...gate("memory", real, fault) }, { exit: 1, reason: "fail: the peak RSS is above the budget" }),
    judge({ id: "no-budget", fault: "the budget of the router is null", ...gate("no-budget", null) }, { exit: 1, reason: "fail: no read" }),
  ];
}

/** This function gives the flip of gate (b) of `Search work`. */
function workFlip(dir: string): FlipArm[] {
  const stops = join(dir, "stops.jsonl");
  const copy = join(dir, "stops-copy.jsonl");
  const changed = join(dir, "stops-changed.jsonl");
  const written = runNode([here("../search-work.ts"), "--stops", stops, "--sizes", "60", "--budgets", "1,10"]);
  if (written.exit !== 0) throw new Error(`The stops were not written: ${written.text}`);
  copyFileSync(stops, copy);
  writeFileSync(changed, changeOneStop(readFileSync(stops, "utf8")));
  const same = (other: string): { exit: number | null; text: string } => runNode([here("./same-stops.ts"), stops, other]);
  return [
    judge({ id: "clean", fault: null, ...same(copy) }, { exit: 0, reason: "byte-equal" }),
    judge({ id: "one-stop", fault: "one stop has 1 more evaluation", ...same(changed) }, { exit: 1, reason: "the files differ" }),
  ];
}

/** This function gives the folder of each cell under `root`, by its id. A cell is a folder with a `meta.json` file. */
function cellFolders(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (dir: string): void => {
    if (existsSync(join(dir, "meta.json"))) {
      const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as { os: string; node: string };
      out.set(`${meta.os}-node${meta.node.replace(/^v/, "").split(".")[0]}`, dir);
    }
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) visit(path);
    }
  };
  visit(root);
  return out;
}

/** This function gives the rows of a `routes.jsonl` text with a changed route on the first row: all of its hashes differ, so its repeats agree. */
export function changeOneRoute(rows: readonly string[]): string[] {
  const [first, ...rest] = rows;
  const row = JSON.parse(first!) as { hash: string; again: string; traced: string | null };
  const other = `${row.hash}-flip`;
  return [JSON.stringify({ ...row, hash: other, again: other, traced: row.traced === null ? null : other }), ...rest];
}

/** This function gives the rows with one field of the first row changed. */
function changeField(rows: readonly string[], field: "exact" | "again"): string[] {
  const [first, ...rest] = rows;
  const row = JSON.parse(first!) as Readonly<Record<string, unknown>>;
  return [JSON.stringify({ ...row, [field]: `${String(row[field])}-flip` }), ...rest];
}

/** This function gives the lines of a file of rows. */
const rowsOf = (file: string): string[] => readFileSync(file, "utf8").split("\n").filter((l) => l.length > 0);

/** This function changes one real cell in place, so the gate of the workflow reads the fault. */
export function injectFault(cells: string, fault: string): string {
  const dir = cellFolders(cells).get(XPLAT_FAULT_CELL);
  if (dir === undefined) throw new Error(`There is no cell ${XPLAT_FAULT_CELL} under ${cells}.`);
  const file = join(dir, "routes.jsonl");
  const rows = rowsOf(file);
  if (fault !== "route" && fault !== "short") throw new Error(`The fault is route or short, not "${fault}".`);
  writeFileSync(file, (fault === "route" ? changeOneRoute(rows) : rows.slice(1)).join("\n") + "\n");
  return `The fault ${fault} is on the cell ${XPLAT_FAULT_CELL}.`;
}

/** This function gives the flip of the verdict of `Xplat OK`. It reads only the real rows of the reference cell, so a fault on another cell does not change it. */
function xplatFlip(dir: string, cellsDir: string): FlipArm[] {
  const folders = cellFolders(cellsDir);
  const refDir = folders.get(XPLAT_CELLS[0]);
  if (refDir === undefined) throw new Error(`There is no cell ${XPLAT_CELLS[0]} under ${cellsDir}.`);
  const real = rowsOf(join(refDir, "routes.jsonl"));
  const metaOf = (id: string): string => {
    const [os, node] = id.split("-node");
    return JSON.stringify({ os, node: `v${node}.0.0`, arch: "x64", v8: "0", highways: "0" });
  };
  const arm = (id: string, rowsOfCell: (cell: string) => readonly string[], stated = real.length): { exit: number | null; text: string } => {
    const root = join(dir, `xplat-${id}`);
    for (const cell of XPLAT_CELLS) {
      mkdirSync(join(root, cell), { recursive: true });
      writeFileSync(join(root, cell, "meta.json"), metaOf(cell));
      writeFileSync(join(root, cell, "routes.jsonl"), rowsOfCell(cell).join("\n") + "\n");
    }
    return runNode([here("../xplat-summary.ts"), "--cells", root, "--expect", XPLAT_CELLS.join(","), "--rows", String(stated), "--out", join(root, "xplat.md")]);
  };
  const onFault = (changed: readonly string[]) => (cell: string): readonly string[] => (cell === XPLAT_FAULT_CELL ? changed : real);
  return [
    judge({ id: "clean", fault: null, ...arm("clean", () => real) }, { exit: 0, reason: "cells agree" }),
    judge({ id: "route", fault: "one route of one cell differs", ...arm("route", onFault(changeOneRoute(real))) }, { exit: 1, reason: "the route hash differs" }),
    judge({ id: "exact", fault: "one exact result of one cell differs under an equal hash", ...arm("exact", onFault(changeField(real, "exact"))) }, { exit: 1, reason: "the exact result differs" }),
    judge({ id: "repeats", fault: "one repeat of one cell differs", ...arm("repeats", onFault(changeField(real, "again"))) }, { exit: 1, reason: "the repeats differ" }),
    judge({ id: "short-cell", fault: "one cell lacks a row", ...arm("short-cell", onFault(real.slice(1))) }, { exit: 2, reason: "rows of the stated" }),
    judge({ id: "short-all", fault: "each cell lacks the same row", ...arm("short-all", () => real.slice(1)) }, { exit: 2, reason: "rows of the stated" }),
  ];
}

/** This function starts git in the root and gives its output. */
function git(root: string, argv: readonly string[], options: { input?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const out = spawnSync("git", argv, { cwd: root, encoding: "utf8", input: options.input, env: { ...process.env, ...options.env } });
  if (out.status !== 0) throw new Error(`git ${argv.join(" ")}: ${out.stderr}`);
  return out.stdout.trim();
}

/** This function makes a commit on top of the parent with the plumbing of git. A changed file is optional. */
function commitOn(root: string, parent: string, message: string, changed?: { path: string; text: string }): string {
  const who = { GIT_AUTHOR_NAME: "gate flip", GIT_AUTHOR_EMAIL: "gate-flip@example.invalid", GIT_COMMITTER_NAME: "gate flip", GIT_COMMITTER_EMAIL: "gate-flip@example.invalid" };
  let tree = git(root, ["rev-parse", `${parent}^{tree}`]);
  if (changed !== undefined) {
    const index = { GIT_INDEX_FILE: join(mkdtempSync(join(tmpdir(), "gate-flip-")), "index") };
    const blob = git(root, ["hash-object", "-w", "--stdin"], { input: changed.text });
    git(root, ["read-tree", parent], { env: index });
    git(root, ["update-index", "--add", "--cacheinfo", `100644,${blob},${changed.path}`], { env: index });
    tree = git(root, ["write-tree"], { env: index });
  }
  return git(root, ["commit-tree", tree, "-p", parent, "-m", message], { env: who });
}

/** This function gives the flip of the sections gate. Each arm takes up to two runs of the gate. */
function sectionsFlip(dir: string, trees: string, rounds: string): FlipArm[] {
  const root = git(here("."), ["rev-parse", "--show-toplevel"]);
  const parent = git(root, ["rev-parse", "HEAD"]);
  const gateOf = (id: string, head: string, fault: string | null): ArmRead => {
    let read: ArmRead = { id, fault, exit: null, text: "The gate did not run." };
    for (const attempt of ["1", "2"]) {
      const out = join(dir, `${id}-${attempt}`);
      const run = spawnSync(process.execPath, [here("../sections-bisect.ts"), "--gate", "--attempt", attempt, "--head", head, "--head-input", `flip ${id}`, "--parent", parent, "--parent-input", "the checkout", "--trees", trees, "--out", out, "--rounds", rounds], { stdio: ["ignore", "inherit", "inherit"] });
      const verdict = recordVerdict(JSON.parse(readFileSync(join(out, "sections-gate.json"), "utf8")) as GateRecord);
      read = { id, fault, exit: run.status, text: `${verdict.outcome}, in the words of the home ${verdict.words}: ${verdict.reason}`, ratio: verdict.parent?.ratio ?? null };
      if (verdict.outcome !== "cannot decide") break;
    }
    return read;
  };
  const clean = commitOn(root, parent, "flip: no change");
  const spin = commitOn(root, parent, "flip: a slower route", { path: SECTIONS_FILE, text: withSpin(readFileSync(join(root, SECTIONS_FILE), "utf8"), SECTIONS_FAULT_SHARE) });
  return [
    judge(gateOf("clean", clean, null), { exit: 0, reason: "pass" }),
    judge(gateOf("slower", spin, `a spin of ${SECTIONS_FAULT_SHARE * 100} % of the route time`), { exit: 1, reason: "the home slower" }),
  ];
}

/** This function writes the table of a record. */
export function flipTable(record: FlipRecord): string {
  const rows = record.arms.map((a) => `| ${a.id} | ${a.fault ?? "none"} | ${a.exit} | ${a.want.exit} | ${a.want.reason} | ${a.ratio === undefined || a.ratio === null ? "" : a.ratio.toFixed(3)} | ${a.ok ? "yes" : "no"} |`);
  return [`## The flip of \`${record.check}\`: ${record.passed ? "passed" : "failed"}`, "", "| Arm | Fault | Exit | Exit wanted | Reason wanted | Ratio | As stated |", "| --- | --- | --- | --- | --- | --- | --- |", ...rows, ""].join("\n");
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const { values } = parseArgs({ options: { check: { type: "string" }, out: { type: "string", default: "out/gate-flip" }, rounds: { type: "string", default: "10" }, trees: { type: "string" }, cells: { type: "string", default: "cells" }, inject: { type: "string" } } });
  if (values.inject !== undefined) {
    console.log(injectFault(resolve(values.cells), values.inject));
    process.exit(0);
  }
  const out = resolve(values.out);
  mkdirSync(out, { recursive: true });
  const dir = mkdtempSync(join(tmpdir(), "gate-flip-"));
  const flips: Readonly<Record<string, () => FlipArm[]>> = {
    heap: () => heapFlip(dir),
    work: () => workFlip(dir),
    sections: () => sectionsFlip(join(out, "sections"), resolve(values.trees ?? join(dir, "trees")), values.rounds),
    xplat: () => xplatFlip(dir, resolve(values.cells)),
  };
  const flip = flips[values.check ?? ""];
  if (flip === undefined) throw new Error(`The check is heap, work, sections or xplat, not "${values.check}".`);
  const arms = flip();
  const record: FlipRecord = { schema: SCHEMA, check: values.check!, arms, passed: flipPassed(arms), env: envOf("fresh") };
  writeFileSync(join(out, `gate-flip-${record.check}.json`), JSON.stringify(record, null, 1) + "\n");
  const table = flipTable(record);
  writeFileSync(join(out, `gate-flip-${record.check}.md`), table);
  console.log(table);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary !== undefined) appendFileSync(summary, table + "\n");
  rmSync(dir, { recursive: true, force: true });
  if (!record.passed) process.exitCode = 1;
}
