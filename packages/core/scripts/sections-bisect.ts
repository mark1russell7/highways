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
// - The plan of the confirm mode: `node scripts/sections-bisect.ts --plan <pairs> [--rounds <n>]`. It prints the pairs as the JSON of a matrix.
// - One job of the confirm mode: `node scripts/sections-bisect.ts --confirm --pair <n> --commit <ref> --parent <ref> --trees <dir> --out <dir> [--routers <a,b>] [--rounds <n>]`.
//   It makes a git worktree of the base, the commit and the parent. `confirmPair` times the commit, the parent and the A/A arm of the parent on the board of the base.
//   It writes `<dir>/confirm-pair<n>.json` and prints the table of the pair.
// - The join of the confirm mode: `node scripts/sections-bisect.ts --confirm-join <dir> --pairs <pairs> [--summary <file>] [--json <file>]`.
// - The sections time gate (GATE-LIMITS): `node scripts/sections-bisect.ts --gate --parent <ref> --trees <dir> --out <dir> [--rounds <n>] [--attempt <1|2>]`.
//   It makes a git worktree of the base, the parent, the checkout and the fixed base of `data/sections-gate/fixed-base.json`.
//   `confirmPair` times the parent, the checkout, the fixed base and the A/A arm of the parent on `sections-tree`, on the board of the base.
//   `timeVerdict` of `@mark1russell7/rigor-bench` decides the check against the parent, with the pool `data/sections-gate/aa-pool.json`. The record keeps its verdict.
//   It writes `<dir>/sections-gate.json` and `<dir>/sections-gate.md`. The exit code is 0 for a pass and 1 for a fail.
//   The exit code is 3 when the first run (`--attempt 1`) cannot decide. A second run that cannot decide exits with the code 1.
// `scripts/sections-bisect-verdict.ts` has the plan and the verdict. `scripts/sections-confirm-verdict.ts` has them for the confirm mode.
// `scripts/sections-gate-verdict.ts` has the checks of the gate.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { envOf, measureIsolated, runChild, type Arm, type Input, type PairedReport } from "./gates/paired.ts";
import { COMMIT_ARM, confirmPair } from "./gates/pair-confirm.ts";
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
import {
  CONFIRM_ROUNDS,
  HEAD_REF,
  PAIR_SCHEMA,
  confirmFile,
  confirmText,
  joinConfirm,
  pairOfFile,
  parsePairs,
  type PairRecord,
  type Side,
} from "./sections-confirm-verdict.ts";
import {
  BASE_FILE,
  FIXED_ARM,
  GATE_ROUNDS,
  GATE_ROUTER,
  GATE_SCHEMA,
  POOL_FILE,
  gateExit,
  gateOptions,
  gateText,
  homeRecord,
  parseFixedBase,
  parsePool,
  type GateRecord,
  type HomeVerdict,
} from "./sections-gate-verdict.ts";

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

/** This function gives the root of the repository, the full hash of the base and the full hash of the checkout. */
function refsOfRun(): { root: string; base: string; head: string } {
  const root = git(HERE, "rev-parse", "--show-toplevel").trim();
  // The fix of H3 has one parent, and that parent is the base.
  if (git(root, "rev-list", "--parents", "-n", "1", FIX_COMMIT).trim().split(/\s+/).length !== 2) throw new Error(`The commit ${FIX_COMMIT} does not have exactly one parent.`);
  return { root, base: git(root, "rev-parse", `${FIX_COMMIT}~1`).trim(), head: git(root, "rev-parse", "HEAD").trim() };
}

/** This function times one job: the base, the candidates of the job and the A/A arm, in fresh processes. */
async function runShard(shard: number, treesDir: string, out: string, routers: readonly string[], rounds: number): Promise<ShardRecord> {
  const { root, base, head } = refsOfRun();
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

/** This function gives one side of a comparison: the ref, its full hash and its subject. The ref `HEAD` is the checkout. */
function sideOf(root: string, head: string, ref: string): Side {
  const sha = ref === HEAD_REF ? head : git(root, "rev-parse", "--verify", `${ref}^{commit}`).trim();
  return { ref, sha, subject: git(root, "log", "-1", "--format=%s", sha).trim() };
}

/** This function makes a git worktree of each commit that has none, and gives the folder of a commit. */
function worktrees(root: string, treesDir: string, shas: Iterable<string>): (sha: string) => string {
  mkdirSync(treesDir, { recursive: true });
  const treeOf = (sha: string): string => join(treesDir, sha.slice(0, 12));
  for (const sha of new Set(shas)) if (!existsSync(treeOf(sha))) git(root, "worktree", "add", "--detach", treeOf(sha), sha);
  return treeOf;
}

/** This function installs and checks the core of each side, one time for each commit. It gives the reason of the first failure, else `null`. */
function prepare(sides: readonly Side[], treeOf: (sha: string) => string, routers: readonly string[]): string | null {
  for (const s of sides.filter((x, i) => sides.findIndex((y) => y.sha === x.sha) === i)) {
    const reason = (needsInstall(treeOf(s.sha)) ? install(treeOf(s.sha)) : undefined) ?? check(treeOf(s.sha), routers);
    if (reason !== undefined) return `${s.ref}: ${reason}`;
  }
  return null;
}

/** This function times one pair of the confirm mode: the commit, the parent and the A/A arm of the parent, in fresh processes, on the board of the base. */
async function runPair(pair: number, commitRef: string, parentRef: string, treesDir: string, out: string, routers: readonly string[], rounds: number): Promise<PairRecord> {
  const { root, base, head } = refsOfRun();
  const commit = sideOf(root, head, commitRef);
  const parent = sideOf(root, head, parentRef);
  if (commit.sha === parent.sha) throw new Error(`The pair ${pair}: ${commitRef} and ${parentRef} are the same commit ${commit.sha}.`);
  console.error(`Sections confirm: the pair ${pair}, ${commit.sha.slice(0, 7)} against ${parent.sha.slice(0, 7)}.`);
  const treeOf = worktrees(root, treesDir, [base, parent.sha, commit.sha]);
  const skipped = prepare([parent, commit], treeOf, routers);
  let report: PairedReport | null = null;
  if (skipped === null) {
    // Each arm routes the same board: the fixture of the base, as in the bisect.
    const board = await writeBoard(treeOf(base), out);
    const child = (sha: string): string[] => [...NODE, SCRIPT, "--child", "--tree", treeOf(sha), "--board", board];
    report = await confirmPair({ parent: child(parent.sha), commit: child(commit.sha), inputs: routers, rounds });
  }
  return { schema: PAIR_SCHEMA, pair, head, base, fixture: BISECT_FIXTURE, routers, rounds, commit, parent, skipped, env: envOf("fresh"), report };
}

/**
 * This function runs the sections time gate: the parent, the checkout, the fixed base and the A/A arm of the parent, in fresh processes, on the board of the base.
 * The fixed base comes from the file `BASE_FILE` of the checkout, and the pool of the home verdict comes from the file `POOL_FILE`.
 */
async function runGate(parentRef: string, treesDir: string, out: string, rounds: number, attempt: 1 | 2): Promise<GateRecord> {
  const { root, base, head } = refsOfRun();
  const fixedBase = parseFixedBase(readFileSync(join(HERE, "..", BASE_FILE), "utf8"));
  const pool = parsePool(readFileSync(join(HERE, "..", POOL_FILE), "utf8"));
  const headSide = sideOf(root, head, HEAD_REF);
  const parent = sideOf(root, head, parentRef);
  const fixed = sideOf(root, head, fixedBase.commit);
  const board = sideOf(root, head, base);
  if (headSide.sha === parent.sha) throw new Error(`The gate: the parent ${parentRef} is the checkout ${head}.`);
  console.error(`Sections gate: ${head.slice(0, 7)} against the parent ${parent.sha.slice(0, 7)} and the fixed base ${fixed.sha.slice(0, 7)}.`);
  const routers = [GATE_ROUTER];
  const treeOf = worktrees(root, treesDir, [base, parent.sha, head, fixed.sha]);
  const skipped = prepare([parent, headSide, fixed], treeOf, routers);
  let report: PairedReport | null = null;
  if (skipped === null) {
    // Each arm routes the same board: the fixture of the base of the bisect. So the fixed base and the head route the same input.
    const file = await writeBoard(treeOf(base), out);
    const child = (sha: string): string[] => [...NODE, SCRIPT, "--child", "--tree", treeOf(sha), "--board", file];
    report = await confirmPair({ parent: child(parent.sha), commit: child(head), others: [{ id: FIXED_ARM, command: child(fixed.sha) }], inputs: routers, rounds });
  }
  let home: HomeVerdict | null = null;
  if (report !== null) {
    // Only this job needs the installed packages of the home, so the other modes of this script start with no install.
    const { homeVerdict } = await import("./gates/home-verdict.ts");
    // The home decides the check against the parent: the noise cap, the pooled band and the margin are its options.
    home = homeRecord(homeVerdict(report, GATE_ROUTER, COMMIT_ARM, gateOptions(pool)));
  }
  return { schema: GATE_SCHEMA, attempt, board, fixture: BISECT_FIXTURE, router: GATE_ROUTER, rounds, head: headSide, parent, fixed, fixedBase, skipped, env: envOf("fresh"), report, home };
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
} else if (opt("--plan") !== undefined) {
  // The plan job checks the rounds too, so a bad input fails before the matrix starts.
  if (opt("--rounds") !== undefined) parseRounds(opt("--rounds"));
  console.log(JSON.stringify(parsePairs(opt("--plan"))));
} else if (args.includes("--gate")) {
  const rounds = parseRounds(opt("--rounds") ?? String(GATE_ROUNDS));
  const out = resolve(need("--out"));
  mkdirSync(out, { recursive: true });
  const attempt = opt("--attempt") ?? "1";
  if (attempt !== "1" && attempt !== "2") throw new Error(`The attempt of the gate is 1 or 2, not ${attempt}.`);
  const record = await runGate(need("--parent"), resolve(need("--trees")), out, rounds, attempt === "1" ? 1 : 2);
  writeFileSync(join(out, "sections-gate.json"), JSON.stringify(record, null, 2) + "\n");
  const text = gateText(record).join("\n") + "\n";
  writeFileSync(join(out, "sections-gate.md"), text);
  console.log(text);
  process.exitCode = gateExit(record);
} else if (args.includes("--confirm")) {
  const pair = Number(need("--pair"));
  const [own] = parsePairs(`${need("--commit")}:${opt("--parent") ?? ""}`);
  const routers = parseRouters(opt("--routers") ?? BISECT_ROUTERS.join(","));
  const rounds = parseRounds(opt("--rounds") ?? String(CONFIRM_ROUNDS));
  const out = resolve(need("--out"));
  mkdirSync(out, { recursive: true });
  const record = await runPair(pair, own!.commit, own!.parent, resolve(need("--trees")), out, routers, rounds);
  writeFileSync(join(out, confirmFile(pair)), JSON.stringify(record) + "\n");
  const plan = [{ pair, commit: record.commit.ref, parent: record.parent.ref }];
  console.log(confirmText(joinConfirm([record], plan)).join("\n"));
} else if (opt("--confirm-join") !== undefined) {
  const dir = need("--confirm-join");
  const plan = parsePairs(opt("--pairs"));
  const records: PairRecord[] = [];
  for (const file of readdirSync(dir, { recursive: true }) as string[]) if (pairOfFile(file) !== undefined) records.push(JSON.parse(readFileSync(join(dir, file), "utf8")) as PairRecord);
  const joined = joinConfirm(records, plan);
  const text = confirmText(joined).join("\n") + "\n";
  if (opt("--summary") !== undefined) writeFileSync(opt("--summary")!, text);
  if (opt("--json") !== undefined) writeFileSync(opt("--json")!, JSON.stringify(joined, null, 2) + "\n");
  console.log(text);
  if (!joined.complete) process.exitCode = 1;
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
