// The remeasure of one void speed claim (MEASURE-ISOLATE): the old version against the workspace, in one job, with `measureIsolated` and the A/A arm.
// The workflow `Remeasure` (.github/workflows/remeasure.yml) starts it in 5 jobs. Times run in CI only, not on a local machine.
//
// - One job: `node scripts/remeasure.ts --claim <h3|portfolio-speed|route-scale> --job <n> --out <dir> [--old-tree <dir>]`.
//   It writes the report `paired-time/1` of the job to `<dir>/paired-job<n>.json`, and prints its table.
//   With PORTFOLIO-SPEED, `--only <id,...>` times only these inputs. The case-order run (`scripts/case-order.ts`) times one case alone with it.
//   With PORTFOLIO-SPEED, `--paired-mode process` times each input after the other inputs in one process. Only the case-order run uses it.
// - The join: `node scripts/remeasure.ts --join <dir> --claim <claim> [--summary <file>] [--json <file>]`.
//   It reads each file `paired-job<n>.json` below `<dir>`, and it fails when a job of the 5 jobs has no report (FAIL-CLOSED).
// - A child of mode `fresh`: `node scripts/remeasure.ts --child <claim> --arm <old|workspace> --board <file> [--old-tree <dir>]`.
//   `measureIsolated` appends `--input <id> --warmup <n>`. The input is the name of a router.
// - A child of PORTFOLIO-SPEED: `node scripts/remeasure.ts --child portfolio-speed --arm <old|workspace> --boards <dir>`.
//   The input is `<setup|router>:<board>`. The child reads the file `<board>.json` of the folder.
//
// The old arms:
// - H3: no npm version is older than the claim. The old arm is the core of `fa1dd82~1` in the git worktree `--old-tree`.
// - PORTFOLIO-SPEED: the npm alias `highways-0-5-1`, the last version before #118.
// - ROUTE-SCALE: the npm alias `highways-0-8-0`, the last version before #132.
// The script calls each version through the small adapter `Core`. Each arm routes the same board: the board of the old version.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { measureIsolated, runChild, type Arm, type Input, type Mode, type PairedReport } from "./gates/paired.ts";
import { pairedTable, parseReports } from "./gates/time-gate.ts";
import {
  CLAIM_PLANS,
  H3_FIXTURE,
  H3_ROUTERS,
  NEW_ARM,
  OLD_ARM,
  PORTFOLIO_SPEED_NODES,
  PORTFOLIO_SPEED_SEEDS,
  ROUTE_SCALE_ROUTERS,
  joinJobs,
  joinText,
  jobOfFile,
  parseClaim,
  portfolioSpeedBand,
  reportFile,
  type Claim,
  type JobEntry,
} from "./remeasure-verdict.ts";

/** The route of a graph by one router. The adapter keeps the types of each version out of this script. */
interface Routable {
  route(graph: unknown): unknown;
}

/** The parts of a version of the core that the arms call. An old version does not have each part. */
interface Core {
  readonly asRouter?: (strategy: unknown) => Routable;
  readonly routerStrategies?: Readonly<Record<string, unknown>>;
  readonly routePortfolio?: (graph: unknown) => unknown;
  readonly portfolioFacts?: (graph: unknown) => (result: unknown) => unknown;
  readonly portfolioMember?: (name: string) => unknown;
  readonly PORTFOLIO_BASE_MEMBER?: string;
  readonly EXACT_CLASSES?: readonly string[];
  readonly exactBoard?: (cls: string, nodes: number, k: number) => unknown;
  /** The routers of `fa1dd82~1`. That core has no registry of strategies. */
  readonly ROUTERS?: readonly { readonly name: string; route(graph: unknown): unknown }[];
  readonly FIXTURES?: readonly { readonly name: string }[];
  readonly makeFixture?: (spec: unknown) => unknown;
}

const SCRIPT = fileURLToPath(import.meta.url);
const HERE = resolve(SCRIPT, "..");
/** The fixture of ROUTE-SCALE, as `scripts/scale.ts` reads it. */
const SCALE_FIXTURE = resolve(HERE, "data/scale/route-scale-fixture.json.gz");

/** This function gives a part of a version, or throws an error that names the part. */
function part<K extends keyof Core>(core: Core, key: K, version: string): NonNullable<Core[K]> {
  const value = core[key];
  if (value === undefined || value === null) throw new Error(`The version ${version} has no export ${String(key)}.`);
  return value as NonNullable<Core[K]>;
}

/** This function loads the version of an arm. The workspace is `../src/index.ts`. A specifier in a variable keeps the old types out of the typecheck. */
async function loadCore(claim: Claim, arm: string, oldTree: string | undefined): Promise<Core> {
  if (arm === NEW_ARM) return (await import("../src/index.ts")) as unknown as Core;
  if (arm !== OLD_ARM) throw new RangeError(`There is no arm "${arm}". The arms are ${OLD_ARM} and ${NEW_ARM}.`);
  let specifier: string;
  if (claim === "h3") {
    if (oldTree === undefined) throw new Error("The claim h3 needs --old-tree <dir>: a git worktree of fa1dd82~1.");
    specifier = pathToFileURL(join(oldTree, "packages/core/src/index.ts")).href;
  } else specifier = claim === "portfolio-speed" ? "highways-0-5-1" : "highways-0-8-0";
  return (await import(specifier)) as Core;
}

/** This function gives the route of a router name in a version. The name `portfolio` gives `routePortfolio` with its default options. */
function routerOf(core: Core, claim: Claim, name: string, version: string): (graph: unknown) => unknown {
  if (claim === "h3") {
    const router = part(core, "ROUTERS", version).find((r) => r.name === name);
    if (router === undefined) throw new RangeError(`The version ${version} has no router "${name}".`);
    return (graph) => router.route(graph);
  }
  if (name === "portfolio") {
    const route = part(core, "routePortfolio", version);
    return (graph) => route(graph);
  }
  const strategy = part(core, "routerStrategies", version)[name];
  if (strategy === undefined) throw new RangeError(`The version ${version} has no router "${name}".`);
  const router = part(core, "asRouter", version)(strategy);
  return (graph) => router.route(graph);
}

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

/** This function writes the board of a claim of mode `fresh` to a file, and gives the path. Each child reads it before its timed run. */
async function writeBoard(claim: Claim, dir: string, oldTree: string | undefined): Promise<string> {
  let graph: unknown;
  if (claim === "h3") {
    // The board of the claim is the fixture of the old version.
    const old = await loadCore(claim, OLD_ARM, oldTree);
    const spec = part(old, "FIXTURES", "fa1dd82~1").find((f) => f.name === H3_FIXTURE);
    if (spec === undefined) throw new Error(`The version fa1dd82~1 has no fixture ${H3_FIXTURE}.`);
    graph = part(old, "makeFixture", "fa1dd82~1")(spec);
  } else {
    graph = (JSON.parse(gunzipSync(readFileSync(SCALE_FIXTURE)).toString("utf8")) as { graph: unknown }).graph;
  }
  const file = join(dir, `board-${claim}.json`);
  writeFileSync(file, JSON.stringify(graph));
  return file;
}

/** This function times a claim of mode `fresh`: a fresh process for each arm, each router and each round. */
async function measureFresh(claim: Claim, dir: string, oldTree: string | undefined): Promise<PairedReport> {
  const plan = CLAIM_PLANS[claim];
  const board = await writeBoard(claim, dir, oldTree);
  const routers: readonly string[] = claim === "h3" ? H3_ROUTERS : ROUTE_SCALE_ROUTERS;
  const tree = oldTree === undefined ? [] : ["--old-tree", oldTree];
  const arm = (id: string): Arm<never> => ({ id, command: [process.execPath, ...process.execArgv, SCRIPT, "--child", claim, "--arm", id, "--board", board, ...tree] });
  const inputs: Input<never>[] = routers.map((id) => ({ id, group: id }));
  return measureIsolated({ arms: [arm(OLD_ARM), arm(NEW_ARM)], inputs, repeats: plan.rounds, warmup: plan.warmup, mode: "fresh" });
}

/** One input of PORTFOLIO-SPEED: the setup of the key or the router, on one exact board. */
interface SpeedInput {
  readonly kind: "setup" | "router";
  readonly board: string;
  readonly graph: unknown;
}

/** The kinds of the inputs of PORTFOLIO-SPEED. The id of an input is `<kind>:<board>`. */
const SPEED_KINDS = ["setup", "router"] as const;

/** This function gives the version name of an arm of PORTFOLIO-SPEED, for the errors. */
const speedVersion = (arm: string): string => (arm === OLD_ARM ? "0.5.1" : "the workspace");

/**
 * This function gives the timed run of one input of PORTFOLIO-SPEED in one version. The output of `shared` comes first, and it is not timed.
 * - `setup`: `portfolioFacts(graph)(base)`, the network of the stretch, the shortest distances and the facts of the output of `shared`.
 * - `router`: `routePortfolio(graph)` with the default options.
 */
function speedRun(core: Core, version: string): (kind: SpeedInput["kind"], graph: unknown) => () => unknown {
  // The base of the key is the output of the base member of the router, as the router gives it.
  const member = part(core, "portfolioMember", version)(part(core, "PORTFOLIO_BASE_MEMBER", version));
  if (member === undefined) throw new Error(`The version ${version} has no base member of the portfolio.`);
  const shared = part(core, "asRouter", version)(member);
  const facts = part(core, "portfolioFacts", version);
  const route = part(core, "routePortfolio", version);
  return (kind, graph) => {
    if (kind === "router") return () => route(graph);
    const base = shared.route(graph);
    return () => facts(graph)(base);
  };
}

/**
 * This function times PORTFOLIO-SPEED. Both versions route the exact boards of 0.5.1.
 * The list `only` keeps only these inputs, and their boards. Without it, the function times each input.
 *
 * - Mode `fresh` (the default, BENCH-FRESH-CASES): a fresh process for each arm, each input and each round, one at a time.
 *   This process writes each board to `<dir>/boards-portfolio-speed/`. Each child reads only its own board.
 * - Mode `process`: each input after the other inputs in one process. Only the case-order run uses it.
 *
 * The cost of mode `fresh`: 4 classes x 4 node counts x 3 seeds x 2 kinds give 96 inputs.
 * With 3 arms (the A/A arm too) and 10 rounds, that is 2880 children for each job. Each child starts Node.js, imports one version and reads one board.
 * The estimate is 0.4 to 1.2 s for each child on a CI runner, thus 19 to 58 min for each job. The job time limit is 330 min.
 */
async function measurePortfolioSpeed(only: readonly string[] | undefined, mode: Mode, dir: string): Promise<PairedReport> {
  const plan = CLAIM_PLANS["portfolio-speed"];
  const old = await loadCore("portfolio-speed", OLD_ARM, undefined);
  const exactBoard = part(old, "exactBoard", "0.5.1");
  const inputs: Input<SpeedInput>[] = [];
  const boards: { readonly board: string; readonly graph: unknown }[] = [];
  for (const cls of part(old, "EXACT_CLASSES", "0.5.1"))
    for (const nodes of PORTFOLIO_SPEED_NODES)
      for (const seed of PORTFOLIO_SPEED_SEEDS) {
        const board = `${cls}-${nodes}-s${seed}`;
        const kinds = SPEED_KINDS.filter((kind) => only?.includes(`${kind}:${board}`) ?? true);
        if (kinds.length === 0) continue;
        const graph = exactBoard(cls, nodes, seed);
        boards.push({ board, graph });
        for (const kind of kinds)
          inputs.push({ id: `${kind}:${board}`, group: `${kind} ${portfolioSpeedBand(nodes)}`, ...(mode === "process" ? { value: { kind, board, graph } } : {}) });
      }
  if (inputs.length === 0) throw new Error(`The option --only names no input of PORTFOLIO-SPEED: ${only?.join(",")}.`);
  if (mode === "fresh") {
    // Each child reads the board of the old version from a file, as the claims of mode fresh do.
    const folder = join(dir, "boards-portfolio-speed");
    mkdirSync(folder, { recursive: true });
    for (const b of boards) writeFileSync(join(folder, `${b.board}.json`), JSON.stringify(b.graph));
    const arm = (id: string): Arm<SpeedInput> => ({ id, command: [process.execPath, ...process.execArgv, SCRIPT, "--child", "portfolio-speed", "--arm", id, "--boards", folder] });
    return measureIsolated({ arms: [arm(OLD_ARM), arm(NEW_ARM)], inputs, repeats: plan.rounds, warmup: plan.warmup, mode: "fresh" });
  }
  const versions = { [OLD_ARM]: old, [NEW_ARM]: await loadCore("portfolio-speed", NEW_ARM, undefined) };
  const armOf = (id: typeof OLD_ARM | typeof NEW_ARM): Arm<SpeedInput> => {
    const runOf = speedRun(versions[id], speedVersion(id));
    // The output of `shared` of each board comes before the timed runs.
    const runs = new Map(inputs.map((i) => [i.id, runOf(i.value!.kind, i.value!.graph)]));
    return { id, run: (v) => runs.get(`${v.kind}:${v.board}`)!() };
  };
  return measureIsolated({ arms: [armOf(OLD_ARM), armOf(NEW_ARM)], inputs, repeats: plan.rounds, warmup: plan.warmup, mode: "process" });
}

/** This function is one child of PORTFOLIO-SPEED in mode `fresh`. The import, the board and the output of `shared` are not timed. */
async function speedChild(arm: string, boards: string): Promise<void> {
  const runOf = speedRun(await loadCore("portfolio-speed", arm, undefined), speedVersion(arm));
  runChild(
    (input) => {
      const at = input.indexOf(":");
      const kind = input.slice(0, at) as SpeedInput["kind"];
      if (at < 0 || !SPEED_KINDS.includes(kind)) throw new RangeError(`The input "${input}" is not <setup|router>:<board>.`);
      return runOf(kind, JSON.parse(readFileSync(join(boards, `${input.slice(at + 1)}.json`), "utf8")) as unknown);
    },
    (run) => run(),
  );
}

/** This function reads the reports of the jobs below a folder: each file `paired-job<n>.json`. */
function readJobs(dir: string): JobEntry[] {
  const out: JobEntry[] = [];
  for (const file of readdirSync(dir, { recursive: true }) as string[]) {
    const job = jobOfFile(file);
    if (job === undefined) continue;
    const reports = parseReports(readFileSync(join(dir, file), "utf8"));
    if (reports.length !== 1) throw new Error(`The file ${file} has ${reports.length} reports. A job writes 1 report.`);
    out.push({ job, report: reports[0]! });
  }
  return out;
}

if (opt("--child") === "portfolio-speed") {
  await speedChild(need("--arm"), need("--boards"));
} else if (opt("--child") !== undefined) {
  // A child of mode fresh: the load and the import are not timed. `runChild` times one route.
  const claim = parseClaim(opt("--child"));
  const arm = need("--arm");
  const core = await loadCore(claim, arm, opt("--old-tree"));
  const graph = JSON.parse(readFileSync(need("--board"), "utf8")) as unknown;
  const version = arm === OLD_ARM ? CLAIM_PLANS[claim].old : "the workspace";
  runChild((input) => routerOf(core, claim, input, version), (route) => route(graph));
} else if (opt("--join") !== undefined) {
  const claim = parseClaim(need("--claim"));
  const joined = joinJobs(CLAIM_PLANS[claim], readJobs(need("--join")));
  const text = joinText(joined).join("\n") + "\n";
  if (opt("--summary") !== undefined) writeFileSync(opt("--summary")!, text);
  if (opt("--json") !== undefined) writeFileSync(opt("--json")!, JSON.stringify(joined, null, 2) + "\n");
  console.log(text);
} else {
  const claim = parseClaim(need("--claim"));
  const job = Number(need("--job"));
  if (!Number.isInteger(job) || job < 1) throw new RangeError("The option --job takes a whole number of 1 or more.");
  const dir = need("--out");
  mkdirSync(dir, { recursive: true });
  const mode = (opt("--paired-mode") ?? "fresh") as Mode;
  if (mode !== "fresh" && mode !== "process") throw new RangeError(`There is no paired mode "${String(mode)}". The modes are fresh and process.`);
  if (mode === "process" && claim !== "portfolio-speed") throw new RangeError(`The claim ${claim} has only the mode fresh.`);
  const report = claim === "portfolio-speed" ? await measurePortfolioSpeed(opt("--only")?.split(","), mode, dir) : await measureFresh(claim, dir, opt("--old-tree"));
  writeFileSync(join(dir, reportFile(job)), JSON.stringify(report) + "\n");
  console.log([`# The remeasure of ${claim}, job ${job}`, "", ...pairedTable(report)].join("\n"));
}
