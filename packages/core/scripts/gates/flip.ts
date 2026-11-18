// The flip tests of the gate checks (GATE-FLIP): an injected fault of a stated size turns a check red, and a copy with no fault stays green in the same job.
// `node packages/core/scripts/gates/flip.ts --check <heap|work|sections|parent|verdict|xplat> --out <dir> [--rounds <n>] [--trees <dir>] [--cells <dir>]` writes `<dir>/gate-flip-<check>.json` and `.md`.
// The exit code is 0 only when each arm gives its stated exit code and its stated reason. So a crash is not a red, and a run that cannot decide is not a green.
// An arm that ends on a run that cannot decide is a no read of the flip: the exit code is 3, so the job shows red. A no read is not a pass, and it shows no fault of the gate.
//
// - `heap` runs the gate of `scripts/heap.ts` on `corners` at its real budget: clean, with a fault of `HEAP_FAULT_MB`, and with a budget of `null`.
// - `work` runs the compare of `same-stops.ts` on real stops: the same file twice, and a copy with one stop changed.
// - `sections` runs `sections-bisect.ts --gate` on two commits on top of the checkout: an empty commit, and a commit that spins `SECTIONS_FAULT_SHARE` of the route time.
// - `parent` replays a quiet run of the sections gate from CI (`parent-flip.ts`): as recorded, and with each head time times the margin of the check against the parent.
//   The replay has no runner noise, so this flip holds the check against the parent on each run of the job `quick`.
// - `verdict` runs `screen-verdict.ts --check` on records that it makes: the same snapshot, a moved label, a row with no records, and records with one missing.
// - `xplat` runs `xplat-summary.ts` on copies of the real rows of the reference cell in `--cells`.
//   The arms are a clean copy, a route, an exact result and a repeat that differ, and rows removed from one cell and from each cell.
//   This arm needs no installed package, so the job `summary` of `xplat.yml` can start it.
// - `--inject <route|short> --cells <dir>` changes one real cell in place, for the dispatch that reads the gate of that workflow.
//
// The commits of `sections` are made with the plumbing of git, so the checkout does not change.
// An arm that cannot decide takes the second attempt with 2 times the rounds, as the job `retry` does. Each later run takes `--attempt 2` again (`sectionsAttempts`).
// The clean arm starts with 2 times the rounds on a CPU model with a noisy share above 1/2 in the noise table (`startChoice` of `sections-noise.ts`).
// `sections-noise.ts` imports `@mark1russell7/rigor-statistics`, so only the arm `sections` loads it, with a dynamic import. The arm `parent` loads `parent-flip.ts` in the same way. A test holds that the static imports of this file load no package.
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { FIXED_BEYOND_TEXT, PARENT_SLOWER_TEXT, recordVerdict, type GateRecord } from "../sections-gate-verdict.ts";
import type { FlipOutcome, StartChoice } from "../sections-noise.ts";
import { envOf, type RecordEnv } from "./paired.ts";

/** The schema of the record. */
export const SCHEMA = "gate-flip/2";
/** The router of the flip of the heap gate. */
export const HEAP_ROUTER = "corners";
/** The fault of the heap gate, in MB. The budget of `corners` is 221 MB, and its peak is 147 MB. */
export const HEAP_FAULT_MB = 150;
/**
 * The fault of the sections gate: the spin as a share of the route time. The check against the fixed base must decide `beyond` on a noisy run too.
 * A replay of 14 gate runs of CI (2026-11-17 and 18) gives the floor of that check with no fault. The lowest floor is 0.754, and the spread (p90 - p10) is 0.106.
 * So the share is 1.10 / (0.754 - 0.106) - 1 = 0.70, to a tenth above. With this share, each of the 14 runs gives `beyond` at its first run.
 */
export const SECTIONS_FAULT_SHARE = 0.7;
/**
 * The most runs of 2 times the rounds for the clean arm of the flip of the sections gate. The clean arm passes only on a quiet run.
 * In the same replay, 1 of 3 runs of 20 rounds on the noisiest CPU model was noisy (Wilson 95 %: 0.06 to 0.79). That model had 4 of 10 jobs.
 * So the share of flips with no read is approximately 0.4 * (1/3)^3 = 0.015, and 0.2 at the top of the interval. `flipNoReads` holds that share.
 */
export const CLEAN_LATE_RUNS = 3;
/** The arms of the flip of the sections gate. */
export type SectionsArm = "clean" | "slower";
/** The exit code of a flip with no read: an arm ended on a run that cannot decide. */
export const EXIT_NO_READ = 3;
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
  /** The count of the runs of the gate that the arm took, for a time check. */
  readonly runs?: number;
  /** This value is `true` when the last run of the arm cannot decide. Such an arm is a no read, and it is not as stated. */
  readonly noRead?: boolean;
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
  readonly outcome: FlipOutcome;
  /** The rounds of the first run of the clean arm and the reason, for the flip of the sections gate. */
  readonly start?: StartChoice;
  readonly env: RecordEnv;
}

/**
 * This function compares what an arm gave with what it must give. An exit code alone does not pass, so a crash is not a red.
 * An arm with no read is not as stated, whatever its exit code and text.
 */
export function judge(read: ArmRead, want: ArmWant): FlipArm {
  return { ...read, want, ok: read.noRead !== true && read.exit === want.exit && read.text.includes(want.reason) };
}

/** This function decides a flip. It needs a clean arm that exits with 0 and a fault arm that does not. */
export function flipPassed(arms: readonly FlipArm[]): boolean {
  return arms.every((a) => a.ok) && arms.some((a) => a.fault === null && a.exit === 0) && arms.some((a) => a.fault !== null && a.exit !== 0);
}

/**
 * This function gives the outcome of a flip. An arm that is not as stated and has a read is a fail, and a fail comes first.
 * Else an arm with no read makes a no read. Else the outcome is that of `flipPassed`.
 */
export function flipOutcome(arms: readonly FlipArm[]): FlipOutcome {
  if (arms.some((a) => !a.ok && a.noRead !== true)) return "fail";
  if (arms.some((a) => a.noRead === true)) return "no read";
  return flipPassed(arms) ? "pass" : "fail";
}

/** The wanted read of each arm of the flip of the sections gate. The text of a run starts with its outcome. */
export const SECTIONS_WANT = {
  clean: { exit: 0, reason: "pass, in the words of the home" },
  slower: { exit: 1, reason: FIXED_BEYOND_TEXT },
} as const satisfies Readonly<Record<SectionsArm, ArmWant>>;

/** The wanted read of each arm of the flip of the check against the parent. The slower arm passes the check against the fixed base, so only the check against the parent fails it. */
export const PARENT_WANT = {
  clean: { exit: 0, reason: "pass, in the words of the home" },
  slower: { exit: 1, reason: PARENT_SLOWER_TEXT },
} as const satisfies Readonly<Record<SectionsArm, ArmWant>>;

/**
 * This function gives the value of `--attempt` for each run of an arm of the flip of the sections gate, in order. An arm stops at its first run that decides.
 * The slower arm decides on a noisy run too, because the check against the fixed base has no noise cap. So it keeps the 2 runs of the gate.
 * The clean arm starts with `--attempt` equal to `start`, and then takes up to `CLEAN_LATE_RUNS` runs of 2 times the rounds.
 */
export function sectionsAttempts(arm: SectionsArm, start: "1" | "2"): readonly ("1" | "2")[] {
  if (arm === "slower") return ["1", "2"];
  const late = Array.from({ length: CLEAN_LATE_RUNS }, () => "2" as const);
  return start === "1" ? ["1", ...late] : late;
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

/** The families of the records of the flip of the verdict step. With 6 families, the sign test can pass at the level 0.05. */
export const VERDICT_FAMILIES: readonly string[] = ["a", "b", "c", "d", "e", "f"];

/** This function gives the records of the flip of the verdict step: `shared` and `corners` on the step `router`, with 3 seeds in each family. */
export function verdictRecords(): string {
  const lines: string[] = [];
  for (const [i, family] of VERDICT_FAMILIES.entries()) {
    for (let seed = 0; seed < 3; seed++) {
      for (const strategy of ["shared", "corners"]) {
        const fewer = strategy === "corners" ? 10 : 0;
        const measures = { "route.crossings": 20 + i + seed - fewer, "route.turn.mean": 1 + 0.1 * seed, "route.detour.q95": 1.2, "route.plug-spacing.min": 4, "route.bundle.ink-saved": 0.1 };
        const record = { schema: "layout-record/1", stage: "route", step: "router", strategy, options: {}, corpus: "flip", input: `flip/${family}/s${seed}`, inputHash: "0", set: "flip", seed, nodes: 10, edges: 12, measures, hard: {}, deterministic: true, ms: 1 };
        lines.push(JSON.stringify(record));
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

/** This function gives the flip of the verdict step of `Screen`: the compare of `screen-verdict.ts --check`. */
function verdictFlip(dir: string): FlipArm[] {
  const script = here("../screen-verdict.ts");
  const records = join(dir, "screen.jsonl");
  const short = join(dir, "screen-short.jsonl");
  const snapshot = join(dir, "verdict.json");
  writeFileSync(records, verdictRecords());
  writeFileSync(short, verdictRecords().split("\n").slice(1).join("\n"));
  const written = runNode([script, records, "--json", snapshot]);
  if (written.exit !== 0) throw new Error(`The snapshot was not written: ${written.text}`);
  const stored = JSON.parse(readFileSync(snapshot, "utf8")) as { readonly rows: readonly { readonly strategy: string; readonly label: string }[] };
  const first = stored.rows[0];
  if (first === undefined) throw new Error("The snapshot of the flip has no rows.");
  const copy = (name: string, rows: readonly unknown[]): string => {
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify({ ...stored, rows }));
    return file;
  };
  const moved = copy("verdict-label.json", [{ ...first, label: first.label === "better" ? "worse" : "better" }, ...stored.rows.slice(1)]);
  const extra = copy("verdict-row.json", [...stored.rows, { ...first, strategy: "flip-no-records" }]);
  const check = (file: string, against: string): { exit: number | null; text: string } => runNode([script, file, "--check", against]);
  return [
    judge({ id: "clean", fault: null, ...check(records, snapshot) }, { exit: 0, reason: "The labels hold" }),
    judge({ id: "label", fault: "one label of the snapshot moved", ...check(records, moved) }, { exit: 1, reason: "the label moved" }),
    judge({ id: "row", fault: "the snapshot has a row of a strategy with no records", ...check(records, extra) }, { exit: 1, reason: "the row is missing" }),
    judge({ id: "record", fault: "one record of the screen is missing", ...check(short, snapshot) }, { exit: 1, reason: "the gate expected" }),
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

/** This function gives the rows of a `routes.jsonl` text with a changed route on the first row. All of its hashes differ, so its repeats agree. */
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

/**
 * This function gives the flip of the sections gate. Each arm takes the runs of `sectionsAttempts`, and it stops at its first run that decides.
 * The noise table of the checkout and the CPU model of this computer choose the first rounds of the clean arm.
 */
async function sectionsFlip(dir: string, trees: string, rounds: string): Promise<{ arms: FlipArm[]; start: StartChoice }> {
  const { NOISE_FILE, parseNoise, startChoice } = await import("../sections-noise.ts");
  const root = git(here("."), ["rev-parse", "--show-toplevel"]);
  const parent = git(root, ["rev-parse", "HEAD"]);
  const start = startChoice(parseNoise(readFileSync(here(`../../${NOISE_FILE}`), "utf8")), envOf("fresh").cpu, Number(rounds));
  console.log(start.reason);
  const gateOf = (id: SectionsArm, head: string, fault: string | null): ArmRead => {
    let read: ArmRead = { id, fault, exit: null, text: "The gate did not run." };
    const attempts = sectionsAttempts(id, start.attempt);
    for (const [k, attempt] of attempts.entries()) {
      const runs = k + 1;
      const out = join(dir, `${id}-${runs}`);
      const gate = spawnSync(process.execPath, [here("../sections-bisect.ts"), "--gate", "--attempt", attempt, "--head", head, "--head-input", `flip ${id}`, "--parent", parent, "--parent-input", "the checkout", "--trees", trees, "--out", out, "--rounds", rounds], { stdio: ["ignore", "inherit", "inherit"] });
      const verdict = recordVerdict(JSON.parse(readFileSync(join(out, "sections-gate.json"), "utf8")) as GateRecord);
      const noRead = verdict.outcome === "cannot decide";
      read = { id, fault, exit: gate.status, text: `${verdict.outcome}, in the words of the home ${verdict.words}: ${verdict.reason}`, ratio: verdict.parent?.ratio ?? null, runs, noRead };
      if (!noRead) break;
    }
    return read;
  };
  const clean = commitOn(root, parent, "flip: no change");
  const spin = commitOn(root, parent, "flip: a slower route", { path: SECTIONS_FILE, text: withSpin(readFileSync(join(root, SECTIONS_FILE), "utf8"), SECTIONS_FAULT_SHARE) });
  const arms = [
    judge(gateOf("clean", clean, null), SECTIONS_WANT.clean),
    judge(gateOf("slower", spin, `a spin of ${Math.round(SECTIONS_FAULT_SHARE * 100)} % of the route time`), SECTIONS_WANT.slower),
  ];
  return { arms, start };
}

/** This function gives the flip of the check against the parent of the sections gate, from the fixture of `parent-flip.ts`. */
async function parentFlip(): Promise<FlipArm[]> {
  const { PARENT_RUN_FILE, parentFlip: replay, parseParentRun } = await import("./parent-flip.ts");
  const { clean, slower } = replay(parseParentRun(readFileSync(here(`../../${PARENT_RUN_FILE}`), "utf8")));
  return [judge(clean, PARENT_WANT.clean), judge(slower, PARENT_WANT.slower)];
}

/** This function writes the table of a record. */
export function flipTable(record: FlipRecord): string {
  const rows = record.arms.map((a) => {
    const ratio = a.ratio === undefined || a.ratio === null ? "" : a.ratio.toFixed(3);
    const stated = a.noRead === true ? "no read" : a.ok ? "yes" : "no";
    return `| ${a.id} | ${a.fault ?? "none"} | ${a.exit} | ${a.want.exit} | ${a.want.reason} | ${a.runs ?? ""} | ${ratio} | ${stated} |`;
  });
  const words = { pass: "passed", fail: "failed", "no read": "no read" } as const;
  const note = record.outcome === "no read" ? ["An arm ended on a run that cannot decide, so the runner was too noisy. The job shows red (exit 3). A no read is not a pass, and it shows no fault of the gate.", ""] : [];
  if (record.start !== undefined) note.push(record.start.reason, "");
  return [`## The flip of \`${record.check}\`: ${words[record.outcome]}`, "", ...note, "| Arm | Fault | Exit | Exit wanted | Reason wanted | Runs | Ratio | As stated |", "| --- | --- | --- | --- | --- | --- | --- | --- |", ...rows, ""].join("\n");
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
  const flips: Readonly<Record<string, () => { arms: FlipArm[]; start?: StartChoice } | Promise<{ arms: FlipArm[]; start?: StartChoice }>>> = {
    heap: () => ({ arms: heapFlip(dir) }),
    work: () => ({ arms: workFlip(dir) }),
    sections: () => sectionsFlip(join(out, "sections"), resolve(values.trees ?? join(dir, "trees")), values.rounds),
    parent: async () => ({ arms: await parentFlip() }),
    verdict: () => ({ arms: verdictFlip(dir) }),
    xplat: () => ({ arms: xplatFlip(dir, resolve(values.cells)) }),
  };
  const flip = flips[values.check ?? ""];
  if (flip === undefined) throw new Error(`The check is heap, work, sections, parent, verdict or xplat, not "${values.check}".`);
  const { arms, start } = await flip();
  const record: FlipRecord = { schema: SCHEMA, check: values.check!, arms, passed: flipPassed(arms), outcome: flipOutcome(arms), ...(start === undefined ? {} : { start }), env: envOf("fresh") };
  writeFileSync(join(out, `gate-flip-${record.check}.json`), JSON.stringify(record, null, 1) + "\n");
  const table = flipTable(record);
  writeFileSync(join(out, `gate-flip-${record.check}.md`), table);
  console.log(table);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  // An empty name is no file, as in `writeGateLine` of `@mark1russell7/rigor-bench`.
  if (summary !== undefined && summary !== "") appendFileSync(summary, table + "\n");
  rmSync(dir, { recursive: true, force: true });
  if (record.outcome !== "pass") process.exitCode = record.outcome === "no read" ? EXIT_NO_READ : 1;
}
