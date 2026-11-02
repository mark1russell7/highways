// The bisect of the sections routers (SECTIONS-SLOW step 1). The workflow `Sections bisect` (.github/workflows/sections-bisect.yml) starts it in 9 jobs.
// Times run in CI only, not on a local machine.
//
// - One job: `node scripts/sections-bisect.ts --shard <n> --trees <dir> --out <dir> [--routers <a,b>] [--rounds <n>]`.
//   It lists the candidates with git: the commits from `fa1dd82` to the head that change `packages/core/src`, on the first-parent line.
//   It makes a git worktree of the base and of each candidate of the job. It installs the packages of a candidate with dependencies.
//   It skips a candidate that does not load. Then `measureIsolated` times the arms in mode `fresh`, with the A/A arm.
//   It writes `<dir>/bisect-shard<n>.json` and prints the table of the job.
// - The join: `node scripts/sections-bisect.ts --join <dir> [--summary <file>] [--json <file>]`.
//   It reads each file `bisect-shard<n>.json` below `<dir>`. It writes the record, and exits with the code 1 when the record is not complete.
// - A check: `node scripts/sections-bisect.ts --check --tree <dir> --routers <a,b>`. It loads the core of a worktree and finds the routers.
// - A child of mode `fresh`: `node scripts/sections-bisect.ts --child --tree <dir> --board <file>`. `measureIsolated` appends `--input <router> --warmup <n>`.
// `scripts/sections-bisect-verdict.ts` has the plan and the verdict.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { envOf, measureIsolated, runChild, type Arm, type Input, type PairedReport } from "./gates/paired.ts";
import {
  BASE_ARM,
  BASE_REF,
  BISECT_FIXTURE,
  BISECT_ROUNDS,
  BISECT_ROUTERS,
  BISECT_SHARDS,
  FIX_COMMIT,
  SHARD_SCHEMA,
  bisectText,
  joinShards,
  parseLog,
  parseRounds,
  parseRouters,
  shardFile,
  shardOf,
  shardOfFile,
  shardText,
  type ShardRecord,
  type Skipped,
} from "./sections-bisect-verdict.ts";

/** The parts of a version of the core that the arms call. Each candidate has the list `ROUTERS`, and the base has the fixtures. */
interface Core {
  readonly ROUTERS?: readonly { readonly name: string; route(graph: unknown): unknown }[];
  readonly FIXTURES?: readonly { readonly name: string }[];
  readonly makeFixture?: (spec: unknown) => unknown;
}

const SCRIPT = fileURLToPath(import.meta.url);
const HERE = resolve(SCRIPT, "..");
const NODE = [process.execPath, ...process.execArgv];

const args = process.argv.slice(2);
const opt = (key: string): string | undefined => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : undefined;
};
const need = (key: string): string => {
  const v = opt(key);
  if (v === undefined) throw new Error(`The option ${key} is necessary.`);
  return v;
};

/** This function loads the core of a worktree. A specifier in a variable keeps the old types out of the typecheck. */
async function loadCore(tree: string): Promise<Core> {
  return (await import(pathToFileURL(join(tree, "packages/core/src/index.ts")).href)) as Core;
}

/** This function gives the route of a router of a core, or throws an error that names the router. */
function routerOf(core: Core, name: string, tree: string): (graph: unknown) => unknown {
  const router = core.ROUTERS?.find((r) => r.name === name);
  if (router === undefined) throw new RangeError(`The core of ${tree} has no router "${name}".`);
  return (graph) => router.route(graph);
}

/** This function runs git in the repository, and gives its stdout. A git command that fails throws an error. */
function git(cwd: string, ...argv: string[]): string {
  const out = spawnSync("git", argv, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (out.status !== 0) throw new Error(`The command git ${argv.join(" ")} failed: ${out.stderr}`);
  return out.stdout;
}

/** This function gives the last part of a text, for the reason of a skipped candidate. */
const tail = (text: string | null | undefined): string => (text ?? "").trim().split(/\r?\n/).slice(-3).join(" ").slice(-400);

/** This function gives `true` when the core of a worktree has dependencies, so it needs an install. */
function needsInstall(tree: string): boolean {
  const pkg = JSON.parse(readFileSync(join(tree, "packages/core/package.json"), "utf8")) as { dependencies?: Record<string, string> };
  return Object.keys(pkg.dependencies ?? {}).length > 0;
}

/** This function installs the packages of the core of a worktree with its own lock file. It gives the reason of a failure, else `undefined`. */
function install(tree: string): string | undefined {
  const tries = [
    ["install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts", "--prod", "--filter", "./packages/core"],
    ["install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"],
  ];
  let reason = "";
  for (const argv of tries) {
    const out = spawnSync("pnpm", argv, { cwd: tree, encoding: "utf8" });
    if (out.status === 0) return undefined;
    reason = `pnpm ${argv.join(" ")} failed: ${tail(out.stderr || out.stdout)}`;
    process.stderr.write(`${reason}\n`);
  }
  return reason;
}

/** This function loads the core of a worktree in a fresh process, and finds the routers. It gives the reason of a failure, else `undefined`. */
function check(tree: string, routers: readonly string[]): string | undefined {
  const out = spawnSync(NODE[0]!, [...NODE.slice(1), SCRIPT, "--check", "--tree", tree, "--routers", routers.join(",")], { encoding: "utf8" });
  return out.status === 0 ? undefined : `the core does not load: ${tail(out.stderr)}`;
}

/** This function writes the board of the run to a file, and gives the path: the fixture of the base. Each child reads it before its timed run. */
async function writeBoard(baseTree: string, dir: string): Promise<string> {
  const base = await loadCore(baseTree);
  const spec = base.FIXTURES?.find((f) => f.name === BISECT_FIXTURE);
  if (spec === undefined || base.makeFixture === undefined) throw new Error(`The base ${BASE_REF} has no fixture ${BISECT_FIXTURE}.`);
  const file = join(dir, "board.json");
  writeFileSync(file, JSON.stringify(base.makeFixture(spec)));
  return file;
}

/** This function times one job: the base, the candidates of the job and the A/A arm, in fresh processes. */
async function runShard(shard: number, treesDir: string, out: string, routers: readonly string[], rounds: number): Promise<ShardRecord> {
  const root = git(HERE, "rev-parse", "--show-toplevel").trim();
  // The fix of H3 has one parent, and that parent is the base.
  if (git(root, "rev-list", "--parents", "-n", "1", FIX_COMMIT).trim().split(/\s+/).length !== 2) throw new Error(`The commit ${FIX_COMMIT} does not have exactly one parent.`);
  const base = git(root, "rev-parse", `${FIX_COMMIT}~1`).trim();
  const head = git(root, "rev-parse", "HEAD").trim();
  const order = parseLog(git(root, "log", "--first-parent", "--reverse", "--format=%H%x09%s", `${base}..${head}`, "--", "packages/core/src"));
  if (!order[0]?.commit.startsWith(FIX_COMMIT)) throw new Error(`The first candidate is not ${FIX_COMMIT}.`);
  const commits = shardOf(order, shard, BISECT_SHARDS).map((c) => c.commit);
  console.error(`Sections bisect: ${order.length} candidates, ${commits.length} in the job ${shard} of ${BISECT_SHARDS}.`);
  mkdirSync(treesDir, { recursive: true });
  const treeOf = (commit: string): string => join(treesDir, commit.slice(0, 12));
  for (const commit of [base, ...commits]) if (!existsSync(treeOf(commit))) git(root, "worktree", "add", "--detach", treeOf(commit), commit);
  const baseFail = check(treeOf(base), routers);
  if (baseFail !== undefined) throw new Error(`The base ${BASE_REF}: ${baseFail}`);
  const skipped: Skipped[] = [];
  const ok: string[] = [];
  for (const commit of commits) {
    const reason = (needsInstall(treeOf(commit)) ? install(treeOf(commit)) : undefined) ?? check(treeOf(commit), routers);
    if (reason === undefined) ok.push(commit);
    else skipped.push({ commit, reason });
  }
  let report: PairedReport | null = null;
  if (ok.length > 0) {
    const board = await writeBoard(treeOf(base), out);
    const arm = (id: string, commit: string): Arm<never> => ({ id, command: [...NODE, SCRIPT, "--child", "--tree", treeOf(commit), "--board", board] });
    const inputs: Input<never>[] = routers.map((id) => ({ id, group: id }));
    report = await measureIsolated({ arms: [arm(BASE_ARM, base), ...ok.map((c) => arm(c, c))], inputs, repeats: rounds, warmup: 0, mode: "fresh" });
  }
  return { schema: SHARD_SCHEMA, shard, shards: BISECT_SHARDS, head, base, fixture: BISECT_FIXTURE, routers, rounds, order, commits, skipped, env: envOf("fresh"), report };
}

if (args.includes("--child")) {
  // A child of mode fresh: the load and the parse of the board are not timed. `runChild` times one route.
  const tree = need("--tree");
  const core = await loadCore(tree);
  const graph = JSON.parse(readFileSync(need("--board"), "utf8")) as unknown;
  runChild((input) => routerOf(core, input, tree), (route) => route(graph));
} else if (args.includes("--check")) {
  const tree = need("--tree");
  const core = await loadCore(tree);
  for (const name of parseRouters(need("--routers"))) routerOf(core, name, tree);
} else if (opt("--join") !== undefined) {
  const dir = need("--join");
  const records: ShardRecord[] = [];
  for (const file of readdirSync(dir, { recursive: true }) as string[]) if (shardOfFile(file) !== undefined) records.push(JSON.parse(readFileSync(join(dir, file), "utf8")) as ShardRecord);
  const joined = joinShards(records);
  const text = bisectText(joined).join("\n") + "\n";
  if (opt("--summary") !== undefined) writeFileSync(opt("--summary")!, text);
  if (opt("--json") !== undefined) writeFileSync(opt("--json")!, JSON.stringify(joined, null, 2) + "\n");
  console.log(text);
  if (!joined.complete) process.exitCode = 1;
} else {
  const shard = Number(need("--shard"));
  const routers = parseRouters(opt("--routers") ?? BISECT_ROUTERS.join(","));
  const rounds = parseRounds(opt("--rounds") ?? String(BISECT_ROUNDS));
  const out = resolve(need("--out"));
  mkdirSync(out, { recursive: true });
  const record = await runShard(shard, resolve(need("--trees")), out, routers, rounds);
  writeFileSync(join(out, shardFile(shard)), JSON.stringify(record) + "\n");
  console.log(shardText(record).join("\n"));
}
