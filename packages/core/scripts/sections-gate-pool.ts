// The pool of A/A rounds of the sections time gate (GATE-LIMITS slices 2 and 3): `pnpm --filter @mark1russell7/highways gate:pool`.
// The script rebuilds `data/sections-gate/aa-pool.json` from the artifacts of the runs of the workflow `Sections gate`.
//
// - `node scripts/sections-gate-pool.ts [--from <dir>] [--main <ref>] [--out <file>] [--limit <n>]`
// - With no `--from`, the script lists the runs with one call of `gh run list`, and downloads the artifacts of each run into a new folder.
//   That folder gets `runs.json`, the list of the runs. `--from <dir>` reads such a folder again, and makes no call to GitHub.
// - A run goes into the pool only when its parent is a commit of `--main` (the default is `origin/main`) and its A/A spread is at or below the cap.
//   The A/A arm times the parent, so each run of a pull request to `main` times a commit of `main`.
//   `aaSpread` of `@mark1russell7/rigor-bench` gives that spread on the log scale, and `pooledBand` gives the band of the new pool.
// - The script writes the file and prints a table of the runs. Commit the file in a pull request. No workflow commits it to `main`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { aaSpread, pooledBand } from "@mark1russell7/rigor-bench";
import { InputError } from "./gates/inputs.ts";
import {
  NOISE_CAP,
  POOL_FILE,
  SPREAD_LEVEL,
  buildPool,
  poolEntry,
  poolOptions,
  ratioTimes,
  type PoolEntry,
  type PoolRecord,
  type PoolRun,
} from "./sections-gate-verdict.ts";

const CORE = resolve(fileURLToPath(import.meta.url), "..", "..");
const WORKFLOW = "Sections gate";

/** This function gives the A/A spread of a list of ratios with the home: p90 of |log r|. */
const logSpread = (ratios: readonly number[]): number => aaSpread(ratioTimes(ratios, "run"), SPREAD_LEVEL);

/** One run of the list of `gh run list`. */
interface ListedRun {
  readonly databaseId: number;
  readonly status: string;
  readonly createdAt: string;
}

/** This function starts a command with argv and no shell, and gives its output. A command that fails throws. */
function run(command: string, argv: readonly string[], cwd: string = CORE): string {
  const out = spawnSync(command, argv, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (out.status !== 0) throw new Error(`${command} ${argv.join(" ")}: ${(out.stderr || out.stdout || String(out.error)).trim()}`);
  return out.stdout;
}

/** This function tells if a commit is an ancestor of the ref of `main`. */
function onMain(sha: string, main: string): boolean {
  return spawnSync("git", ["merge-base", "--is-ancestor", sha, main], { cwd: CORE }).status === 0;
}

const { values } = parseArgs({
  options: { from: { type: "string" }, main: { type: "string", default: "origin/main" }, out: { type: "string" }, limit: { type: "string", default: "200" } },
});
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1) throw new InputError(`The limit is a whole number of 1 or more, not ${values.limit}.`);
const out = resolve(values.out ?? join(CORE, POOL_FILE));

let dir: string;
let runs: ListedRun[];
if (values.from !== undefined) {
  dir = resolve(values.from);
  runs = JSON.parse(readFileSync(join(dir, "runs.json"), "utf8")) as ListedRun[];
} else {
  dir = mkdtempSync(join(tmpdir(), "sections-gate-pool-"));
  runs = JSON.parse(run("gh", ["run", "list", "--workflow", WORKFLOW, "--limit", String(limit), "--json", "databaseId,status,createdAt"])) as ListedRun[];
  writeFileSync(join(dir, "runs.json"), JSON.stringify(runs, null, 2) + "\n");
  for (const r of runs.filter((x) => x.status === "completed")) {
    const to = join(dir, String(r.databaseId));
    mkdirSync(to, { recursive: true });
    // A run that skipped the job gate has no artifact. The download then fails, and the table tells it.
    spawnSync("gh", ["run", "download", String(r.databaseId), "--dir", to], { cwd: CORE, encoding: "utf8" });
  }
}

const entries: PoolEntry[] = [];
for (const r of runs) {
  const date = r.createdAt.slice(0, 10);
  const folder = join(dir, String(r.databaseId));
  const artifacts = existsSync(folder) ? readdirSync(folder).filter((name) => /^sections-gate-[0-9a-f]{40}(-retry)?$/.test(name)) : [];
  if (artifacts.length === 0) {
    entries.push({ kept: false, run: { run: r.databaseId, job: "gate", date }, reason: "the run has no artifact of the gate" });
    continue;
  }
  for (const name of artifacts.sort()) {
    const facts = { run: r.databaseId, job: name.endsWith("-retry") ? ("retry" as const) : ("gate" as const), date };
    const file = join(folder, name, "sections-gate.json");
    if (!existsSync(file)) {
      entries.push({ kept: false, run: facts, reason: "the artifact has no record" });
      continue;
    }
    const record = JSON.parse(readFileSync(file, "utf8")) as PoolRecord;
    if (!onMain(record.parent.sha, values.main)) entries.push({ kept: false, run: facts, reason: `the parent is not a commit of ${values.main}` });
    else entries.push(poolEntry(record, facts, logSpread));
  }
}

const kept: PoolRun[] = entries.flatMap((e) => (e.kept ? [e.run] : []));
const pool = buildPool(kept);
writeFileSync(out, JSON.stringify(pool, null, 2) + "\n");
const band = pooledBand(poolOptions(pool), SPREAD_LEVEL);
console.log("| run | job | date | CPU | A/A spread | pool |");
console.log("|---|---|---|---|---:|---|");
for (const e of entries) {
  if (e.kept) console.log(`| ${e.run.run} | ${e.run.job} | ${e.run.date} | ${e.run.cpu} | ${e.run.spread.toFixed(3)} | in |`);
  else console.log(`| ${e.run.run} | ${e.run.job} | ${e.run.date} | - | - | out: ${e.reason} |`);
}
console.log("");
console.log(`The pool has ${pool.runs.length} quiet runs (cap ${NOISE_CAP.toFixed(4)} on |log r|) and ${band.cases} A/A cases.`);
console.log(`The noise of the pooled band is ${band.noise.toFixed(4)} on |log r|, at least the floor log(1.05). The band "same" is ${band.low.toFixed(4)} to ${band.high.toFixed(4)}.`);
console.log(`The artifacts are in ${dir}. The pool is in ${out}.`);
