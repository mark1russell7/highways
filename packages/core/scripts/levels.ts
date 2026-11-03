// The times of the zoom levels: `pnpm run levels [--fixture <name,...>] [--repeat <n>] [--src <dir>]... [--paired <file>] [--paired-mode <fresh|process>]`.
// It routes each fixture with the router of the example boards of the site. It times the route, and the level links alone.
// Each `--src [<label>=]<dir>` is the `src` folder of a core, for example the core of an earlier commit. The first source is the base.
// `measureIsolated` times the sources on each fixture, with the A/A arm of the base and 1 warm-up run (MEASURE-ISOLATE).
// `--repeat` gives the timed rounds. The verdict of a source on a fixture uses the band of the A/A rounds of that fixture (GATE-LIMITS), so one fixture has a band too.
// `--paired` writes the two reports `paired-time/1`, the route and the level links, as one JSON list.
//
// The mode is `fresh` by default (BENCH-FRESH-CASES): a fresh process for each source, each fixture, each round and each report, one at a time.
// - A child of the route makes the graph of its fixture, routes it 1 time untimed, and times 1 route.
// - A child of the level links routes its fixture untimed, makes the links 1 time untimed, and times the links 1 time.
// - A child: `node scripts/levels.ts <the options> --levels-child <route|links> --arm <label> --input <fixture> --warmup <n>`. It imports only its own source.
// `--paired-mode process` times each fixture after the other fixtures in this process. Only the case-order run (`scripts/case-order.ts`) uses it.
//
// The cost of mode `fresh`: fixtures x (sources + 1) x rounds children for each report.
// The workflow `Profile` with 1 commit in `compare` starts 1 x 3 x 5 x 2 = 30 children on `large-clustered`.
// A child of the route routes the board 2 times, as one round of mode process does. A child of the links routes it 1 time more.
// So the run routes the board 45 times, not 32 times, and starts 30 processes of 0.3 to 1 s. This fits in the 30 minutes of the job.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { measureIsolated, runChild, type Arm, type Mode, type PairedReport } from "./gates/paired.ts";
import { roundsTable } from "./gates/time-gate.ts";

interface Core {
  readonly label: string;
  readonly index: any;
  readonly levels: any;
}

const SCRIPT = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const srcs = args.flatMap((a, i) => (a === "--src" && args[i + 1] ? [args[i + 1]!] : []));
if (srcs.length === 0) srcs.push(fileURLToPath(new URL("../src", import.meta.url)));
const repeat = Number(opt("--repeat") ?? 3);
const fixtures = (opt("--fixture") ?? "mid-clustered").split(",").map((x) => x.trim()).filter((x) => x.length > 0);
// The options of the router of the example boards.
const options = { name: "site", margin: 20, stretch: 3, cap: 6 };

/** This function gives the label and the folder of each `--src`. */
const sources = srcs.map((arg) => {
  const eq = arg.indexOf("=");
  return { label: eq > 0 ? arg.slice(0, eq) : arg, src: eq > 0 ? arg.slice(eq + 1) : arg };
});
if (new Set(sources.map((s) => s.label)).size !== sources.length) throw new Error("The labels of the sources are not unique.");

/** This function imports the core of a source. A core before 0.1.2 has no `levels.ts`. Then the table gives only the time of the route. */
async function loadCore(source: { readonly label: string; readonly src: string }): Promise<Core> {
  const index = await import(pathToFileURL(resolve(source.src, "index.ts")).href);
  const levels = await import(pathToFileURL(resolve(source.src, "levels.ts")).href).catch(() => undefined);
  return { label: source.label, index, levels };
}

/** This function gives the spec of a fixture of a core, or stops the script with the code 2. */
function specOf(core: Core, name: string): { name: string } {
  const spec = core.index.FIXTURES.find((f: { name: string }) => f.name === name);
  if (!spec) {
    console.error(`There is no fixture "${name}".`);
    process.exit(2);
  }
  return spec as { name: string };
}

/** This function routes a graph with the router of the example boards. The router is made inside the timed run, as in each mode. */
const routeOf = (core: Core, graph: unknown): any => core.index.sectionsRouter(options).route(graph);

/** This function gives the levels of a route that have level links. The last level holds each node alone and copies the routes. */
const linkLevels = (core: Core, graph: unknown): any[] => (routeOf(core, graph).levels ?? []).slice(0, -1);

/** This function makes the links of the levels of one route. */
function linksOf(core: Core, levels: readonly any[]): void {
  for (const level of levels) {
    const pairs = level.links.map((l: { source: string; target: string; count: number }) => ({ source: l.source, target: l.target, count: l.count }));
    core.levels.levelLinks(level.items, pairs, options);
  }
}

/** This function is one child of mode `fresh`. The import, the graph and the route of a child of the links are not timed. */
async function levelsChild(report: string, label: string): Promise<void> {
  const source = sources.find((s) => s.label === label);
  if (source === undefined) throw new Error(`There is no source "${label}".`);
  const core = await loadCore(source);
  if (report === "route") runChild((name) => core.index.makeFixture(specOf(core, name)), (graph) => routeOf(core, graph));
  else if (report === "links") {
    if (!core.levels) throw new Error(`The source "${label}" has no levels.ts.`);
    runChild((name) => linkLevels(core, core.index.makeFixture(specOf(core, name))), (levels) => linksOf(core, levels));
  } else throw new RangeError(`There is no report "${report}". The reports are route and links.`);
}

/** This function times the route and the level links of each source, and prints the table. */
async function runLevels(): Promise<void> {
  const mode = (opt("--paired-mode") ?? "fresh") as Mode;
  if (mode !== "fresh" && mode !== "process") throw new Error(`There is no paired mode "${String(mode)}". The modes are fresh and process.`);
  const cores: Core[] = [];
  for (const source of sources) cores.push(await loadCore(source));
  const specs = fixtures.map((name) => specOf(cores[0]!, name));
  const inputs = specs.map((spec) => ({ id: spec.name, value: spec.name }));
  // The level links need `levels.ts`. A core before 0.1.2 has no such arm.
  const withLevels = cores.filter((core) => core.levels);
  // The graph of each fixture of the base gives the sizes of the table.
  const baseGraphs = new Map(specs.map((spec) => [spec.name, cores[0]!.index.makeFixture(spec)]));

  let route: PairedReport;
  let links: PairedReport | undefined;
  if (mode === "fresh") {
    // Each child gets the options of this run and its own source. The A/A arm copies the command of the base.
    const arm = (report: string, core: Core): Arm<string> => ({ id: core.label, command: [process.execPath, ...process.execArgv, SCRIPT, ...args, "--levels-child", report, "--arm", core.label] });
    route = await measureIsolated({ arms: cores.map((core) => arm("route", core)), inputs, repeats: repeat, warmup: 1, mode: "fresh" });
    links = withLevels.length > 0 ? await measureIsolated({ arms: withLevels.map((core) => arm("links", core)), inputs, repeats: repeat, warmup: 1, mode: "fresh" }) : undefined;
  } else {
    // Each core routes the graph of its own fixture. Each core makes its graph one time, before the times.
    const graphs = new Map(cores.map((core) => [core.label, new Map(specs.map((spec) => [spec.name, core.index.makeFixture(spec)]))]));
    route = measureIsolated({ arms: cores.map((core) => ({ id: core.label, run: (name: string) => routeOf(core, graphs.get(core.label)!.get(name)) })), inputs, repeats: repeat, warmup: 1, mode: "process" });
    // Each core with `levels.ts` makes the links of the levels of its own route.
    const groups = new Map(withLevels.map((core) => [core.label, new Map(specs.map((spec) => [spec.name, linkLevels(core, graphs.get(core.label)!.get(spec.name))]))]));
    links =
      withLevels.length > 0
        ? measureIsolated({ arms: withLevels.map((core) => ({ id: core.label, run: (name: string) => linksOf(core, groups.get(core.label)!.get(name)!) })), inputs, repeats: repeat, warmup: 1, mode: "process" })
        : undefined;
  }

  // This median takes the upper middle value of an even list. The `median` of `@mark1russell7/rigor-statistics` takes the midpoint.
  const medianOf = (report: PairedReport | undefined, arm: string): string => {
    const ms = report?.inputs.map((i) => i.median[arm]).filter((x): x is number => x !== undefined) ?? [];
    return ms.length === 0 ? "-" : Math.round([...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)]!).toString();
  };
  const sizes = specs.map((spec) => {
    const graph = baseGraphs.get(spec.name);
    return `${spec.name} (${graph.nodes.length} nodes, ${graph.edges.length} edges)`;
  });
  console.log(`The router of the example boards on ${sizes.join(", ")}, ${repeat} timed rounds. Each cell is the median over the fixtures of the median of the rounds:\n`);
  console.log("| source | route ms | level links ms |\n|---|---:|---:|");
  for (const core of cores) console.log(`| ${core.label} | ${medianOf(route, core.label)} | ${medianOf(links, core.label)} |`);
  // The band of a verdict comes from the A/A ratios of the rounds of each fixture. A band from the median ratios of the fixtures is one ratio with one fixture.
  if (cores.length > 1) console.log(`\n### The route\n\n${roundsTable(route).join("\n")}`);
  if (links && withLevels.length > 1) console.log(`\n### The level links\n\n${roundsTable(links).join("\n")}`);
  const pairedOut = opt("--paired");
  if (pairedOut) writeFileSync(pairedOut, JSON.stringify(links ? [route, links] : [route]) + "\n");
}

const child = opt("--levels-child");
if (child !== undefined) await levelsChild(child, opt("--arm") ?? "");
else await runLevels();
