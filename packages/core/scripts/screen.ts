// The command line of the screen: `pnpm screen [--step router] [--strategy <name,...>] [--module <file,...>] [--export <name,...>]
// [--options <file.json>] [--families <a,b>] [--members <from-to>] [--no-baseline] [--predictions <file.jsonl>] [--inputs <dir>] [--commit <sha>]
// [--wrap <stable,repair>] [--shuffles <n>] [--edits <n>] [--moves] [--activation <families>] [--paired <file> --paired-base <name> [--paired-arms <name,...>] [--paired-repeats <n>]]
// [--out screen.jsonl] [--summary screen.md]`.
// `--paired` times the arms of a comparison in this process with `measureIsolated` (MEASURE-ISOLATE), after the screen, and writes the report `paired-time/1` to the file.
// The base is `--paired-base`. The other arms are `--paired-arms`, else the strategies of the call. Each arm routes each input where no arm skipped it.
// The mode is `process`, with the A/A arm and 1 warm-up run. `--paired-repeats` gives the timed rounds, and the default is 3. Only a step that gives routes has paired times.
// `--moves` counts the own move of each highway strategy of the step `highway`. A module can also export `moves`, a `MoveCounter` by the names of the records.
// `--activation` adds the activation report (ACTIVATION) to the summary. The inputs of these families are the decision inputs. The value `all` takes each family.
// `--edits` runs each highway strategy over this number of seeded edits, with its plan before each edit (BUILD-W2A).
// `--wrap` adds the router `<name>+<w>` for each router and each wrapper. `--shuffles` measures the order fragility (W3) over this number of random orders.
// `--strategy` names strategies of the registry. `--module` loads a prototype file and screens each export that is a strategy of the step,
// or only the exports of `--export`. An export can also be a list of strategies. The registry does not change. Without `--strategy` and `--module`, the screen runs the built-in strategies.
// `--set exact-v1` screens the small boards with a known optimum (MEAS2). With that set, the screen reads the optima of `src/bench/exact/optima-exact-v1.json`,
// or of `--optima <file>`, and gives the gap closed of each strategy. `--optima none` gives no optima.
// `--members 10-23` screens the members 10 to 23 of each family of the set, in place of its members (PROMO-CANALS). These fresh seeds are in no screen set.
// The set of these inputs has the id `<set>-m<from>`, and its member `k` is the member `from + k` of the family.
// The workflow `Screen` starts it in CI. Locally, start it only on one or two small families, for example `--families tiny-uniform`.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  activationReport,
  formatActivation,
  formatScreen,
  highwayMoves,
  type MoveCounter,
  parseLines,
  recordLines,
  screen,
  SCREEN_SETS,
  SCREEN_STEPS,
  SCREEN_WRAPS,
  type ExactOptimaFile,
  type LayoutInput,
  type LayoutPrediction,
  type ScreenFamily,
  type ScreenSet,
  type ScreenStep,
  type ScreenWrap,
} from "../src/bench/screen/index.ts";
import { isRoutedStep, stepRouterStrategy, type RoutedStep } from "../src/bench/compare.ts";
import { HIGHWAY_BASE_ROUTERS, inputGraph, screenInputs } from "../src/bench/screen/index.ts";
import type { Graph, Router } from "../src/model.ts";
import { highwayStrategies, STRATEGIES } from "../src/strategies/builtins.ts";
import { asRouter, getStrategy, type Strategy } from "../src/strategies/model.ts";
import { requireGrid } from "./gates/inputs.ts";
import { envOf, measureIsolated } from "./gates/paired.ts";
import { pairedTable } from "./gates/time-gate.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const list = (name: string): string[] | undefined =>
  opt(name)
    ?.split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

const step = (opt("--step") ?? "router") as ScreenStep;
if (!SCREEN_STEPS.includes(step)) throw new Error(`The screen has no step "${step}". The steps are ${SCREEN_STEPS.join(", ")}.`);

const isStrategy = (x: unknown): x is Strategy<ScreenStep> =>
  typeof x === "object" && x !== null && (x as { step?: unknown }).step === step && typeof (x as { name?: unknown }).name === "string" && typeof (x as { run?: unknown }).run === "function";

const strategies: (Strategy<ScreenStep> | string)[] = [...(list("--strategy") ?? [])];
const only = list("--export");
const counters: MoveCounter[] = [];
for (const file of list("--module") ?? []) {
  const mod = (await import(pathToFileURL(resolve(file)).href)) as Record<string, unknown>;
  // An export can be a strategy or a list of strategies.
  const found = Object.entries(mod)
    .filter(([name]) => only?.includes(name) ?? true)
    .flatMap(([, value]) => (Array.isArray(value) ? (value as unknown[]) : [value]))
    .filter(isStrategy);
  if (found.length === 0) throw new Error(`The file "${file}" exports no strategy of the step "${step}".`);
  for (const value of found) if (!strategies.includes(value)) strategies.push(value);
  if (typeof mod["moves"] === "function") counters.push(mod["moves"] as MoveCounter);
}
if (args.includes("--moves") && step === "highway") {
  const own = strategies.filter((s): s is Strategy<"highway", object> => typeof s !== "string" && s.step === "highway");
  const builtins = Object.entries(highwayStrategies) as [string, Strategy<"highway", object>][];
  counters.push(highwayMoves(Object.fromEntries([...builtins, ...own.map((s) => [s.name, s] as const)])));
}
const moves: MoveCounter | undefined = counters.length === 0 ? undefined : (name, graph) => counters.map((c) => c(name, graph)).find((m) => m !== undefined);

const optionsFile = opt("--options");
const options = optionsFile ? (JSON.parse(readFileSync(optionsFile, "utf8")) as Record<string, object>) : undefined;
const predictionsFile = opt("--predictions");
const predictions = predictionsFile ? parseLines<LayoutPrediction>(readFileSync(predictionsFile, "utf8")) : undefined;

// `--inputs` reads the input files of a folder, at any depth, in the order of their paths. Without it, the screen makes the files of `screen-v1`.
const inputsDir = opt("--inputs");
const files = (dir: string): string[] =>
  readdirSync(dir)
    .sort()
    .flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith(".json") && n !== "index.json" ? [join(dir, n)] : []));
const inputs = inputsDir ? files(inputsDir).map((f) => JSON.parse(readFileSync(f, "utf8")) as LayoutInput) : undefined;

const setId = opt("--set") ?? "screen-v1";
const named = SCREEN_SETS[setId];
if (!named) throw new Error(`There is no screen set "${setId}". The sets are ${Object.keys(SCREEN_SETS).join(", ")}.`);
const members = opt("--members");
const set: ScreenSet = (() => {
  if (members === undefined) return named;
  const m = /^(\d+)-(\d+)$/.exec(members);
  const from = m ? Number(m[1]) : NaN;
  const to = m ? Number(m[2]) : NaN;
  if (!m || to < from) throw new Error(`The value of --members is not "<from>-<to>" with from <= to.`);
  const count = to - from + 1;
  const families = named.families.map((f): ScreenFamily => ({ ...f, seeds: count, make: (k) => f.make(from + k), generator: (k) => f.generator(from + k) }));
  const declared = named.claims?.declared;
  return {
    ...named,
    id: `${named.id}-m${from}`,
    families,
    heldOut: [],
    ...(declared ? { claims: { ...named.claims, declared: { ...declared, minCount: count, counts: Object.fromEntries(families.map((f) => [f.name, count])) } } } : {}),
  };
})();
// The optima of the set: the file of `--optima`, or the file `optima-<set>.json` of `src/bench/exact` when it exists.
const optimaPath = opt("--optima") ?? join(dirname(fileURLToPath(import.meta.url)), `../src/bench/exact/optima-${set.id}.json`);
const optima = optimaPath !== "none" && existsSync(optimaPath) ? (JSON.parse(readFileSync(optimaPath, "utf8")) as ExactOptimaFile).optima : undefined;

const commit = (() => {
  const given = opt("--commit") ?? process.env["GITHUB_SHA"];
  if (given) return given.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
})();

const wrap = list("--wrap") ?? [];
for (const w of wrap) if (!SCREEN_WRAPS.includes(w as ScreenWrap)) throw new Error(`The screen has no wrapper "${w}". The wrappers are ${SCREEN_WRAPS.join(", ")}.`);
const shuffles = Number(opt("--shuffles") ?? "0");
if (!Number.isInteger(shuffles) || shuffles < 0) throw new Error(`The value of --shuffles is not a whole number of 0 or more.`);

const edits = Number(opt("--edits") ?? "0");
if (!Number.isInteger(edits) || edits < 0) throw new Error(`The value of --edits is not a whole number of 0 or more.`);

const start = performance.now();
const report = screen(step, strategies, {
  set,
  ...(optima ? { optima } : {}),
  ...(inputs ? { inputs } : {}),
  ...(list("--families") ? { families: list("--families")! } : {}),
  baseline: !args.includes("--no-baseline"),
  ...(options ? { options } : {}),
  ...(predictions ? { predictions } : {}),
  ...(commit ? { commit } : {}),
  ...(wrap.length > 0 ? { wrap: wrap as ScreenWrap[] } : {}),
  ...(shuffles > 0 ? { shuffles } : {}),
  ...(edits > 0 ? { edits } : {}),
  ...(moves ? { moves } : {}),
  log: (line) => process.stderr.write(line + "\n"),
  // The screen times each run in this process (MEASURE-ISOLATE). The summary names the computer and the mode.
  env: envOf("process"),
});
const seconds = (performance.now() - start) / 1000;
const out = opt("--out") ?? "screen.jsonl";
writeFileSync(out, recordLines(report.records));
// FAIL-CLOSED: the screen writes its records first, so a failed check still leaves them to read.
requireGrid(`screen ${setId}`, report.records);
const activation = list("--activation");
const candidates = new Set(report.summary.strategies.filter((s) => s.candidate).map((s) => s.strategy));
const decision = activation?.includes("all") ? {} : { families: activation ?? [] };
const activationText = activation ? "\n" + formatActivation(activationReport(report.records, decision), candidates.size > 0 ? candidates : undefined) : "";
// A record that is not skipped and has no output hash has no output, or a number in its output that is not finite.
const unhashed = report.records.filter((r) => r.skipped === undefined && r.outputHash === undefined).map((r) => `${r.strategy} on ${r.input}`);
const unhashedText = unhashed.length > 0 ? `\n${unhashed.length} records have no output hash: ${unhashed.slice(0, 20).join(", ")}.\n` : "";

// The paired time (MEASURE-ISOLATE): the arms of the comparison run in turn on each input in this process, with the A/A arm.
const pairedOut = opt("--paired");
let pairedText = "";
if (pairedOut !== undefined) {
  if (step !== "router" && !isRoutedStep(step)) throw new Error(`The step "${step}" gives no routes, so it has no paired time.`);
  const base = opt("--paired-base");
  if (base === undefined) throw new Error("The option --paired needs --paired-base <name>.");
  const repeats = Number(opt("--paired-repeats") ?? "3");
  const others = list("--paired-arms") ?? report.summary.strategies.filter((s) => s.candidate).map((s) => s.strategy);
  const names = [base, ...others.filter((n, i) => n !== base && others.indexOf(n) === i)];
  if (names.length < 2) throw new Error("The paired time needs an arm other than the base: give --paired-arms or a strategy of the call.");
  const mine = (name: string): Strategy<ScreenStep> | undefined => strategies.find((s): s is Strategy<ScreenStep> => typeof s !== "string" && s.name === name);
  // Each arm is the router of the screen: a router, a base router of the step `highway`, or the router of a strategy of a step of `RoutedStep`.
  const routerOf = (name: string): Router => {
    const own = options?.[name];
    const found = mine(name);
    if (step === "router") return asRouter((found ?? getStrategy(STRATEGIES, "router", name)) as Strategy<"router", object>, own);
    if (step === "highway" && found === undefined && HIGHWAY_BASE_ROUTERS.includes(name)) return asRouter(getStrategy(STRATEGIES, "router", name) as Strategy<"router", object>, own);
    return asRouter(stepRouterStrategy((found ?? getStrategy(STRATEGIES, step as RoutedStep, name)) as Strategy<RoutedStep>) as Strategy<"router", object>, own);
  };
  const skipped = new Set(report.records.filter((r) => r.skipped !== undefined).map((r) => `${r.strategy}|${r.input}`));
  const screened = new Set(report.records.map((r) => r.input));
  const families = list("--families");
  const pairedInputs = (inputs ?? screenInputs(set))
    .filter((i) => (families?.includes(i.family) ?? true) && screened.has(i.id) && names.every((n) => !skipped.has(`${n}|${i.id}`)))
    .map((i) => ({ id: i.id, group: i.family, value: inputGraph(i) }));
  if (pairedInputs.length === 0) throw new Error("The paired time has no input where each arm runs.");
  const arms = names.map((id) => {
    const router = routerOf(id);
    return { id, run: (graph: Graph) => router.route(graph) };
  });
  const paired = measureIsolated({ arms, inputs: pairedInputs, repeats, warmup: 1, mode: "process" });
  writeFileSync(pairedOut, JSON.stringify(paired) + "\n");
  pairedText = `\n## The paired time\n\n${pairedTable(paired).join("\n")}\n`;
}
const text = formatScreen(report.summary) + activationText + unhashedText + pairedText + `\n${report.records.length} records in ${seconds.toFixed(1)} s.\n`;
writeFileSync(opt("--summary") ?? "screen.md", text);
console.log(text);
