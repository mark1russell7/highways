// The times of the zoom levels: `pnpm run levels [--fixture <name,...>] [--repeat <n>] [--src <dir>]... [--paired <file>]`.
// It routes each fixture with the router of the example boards of the site. It times the route, and the level links alone.
// Each `--src [<label>=]<dir>` is the `src` folder of a core, for example the core of an earlier commit. The first source is the base.
// `measureIsolated` times the sources in turn on each fixture in this process, with the A/A arm of the base and 1 warm-up run (MEASURE-ISOLATE).
// `--repeat` gives the timed rounds. `--paired` writes the two reports `paired-time/1`, the route and the level links, as one JSON list.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { measureIsolated, type PairedReport } from "./gates/paired.ts";
import { pairedTable } from "./gates/time-gate.ts";

interface Core {
  readonly label: string;
  readonly index: any;
  readonly levels: any;
}

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

const cores: Core[] = [];
for (const arg of srcs) {
  const eq = arg.indexOf("=");
  const label = eq > 0 ? arg.slice(0, eq) : arg;
  const src = eq > 0 ? arg.slice(eq + 1) : arg;
  const index = await import(pathToFileURL(resolve(src, "index.ts")).href);
  // A core before 0.1.2 has no `levels.ts`. Then the table gives only the time of the route.
  const levels = await import(pathToFileURL(resolve(src, "levels.ts")).href).catch(() => undefined);
  cores.push({ label, index, levels });
}
const specs = fixtures.map((name) => {
  const spec = cores[0]!.index.FIXTURES.find((f: { name: string }) => f.name === name);
  if (!spec) {
    console.error(`There is no fixture "${name}".`);
    process.exit(2);
  }
  return spec as { name: string };
});
if (new Set(cores.map((c) => c.label)).size !== cores.length) throw new Error("The labels of the sources are not unique.");

// The arms of the route: each core routes the graph of its own fixture. Each core makes its graph one time, before the times.
const graphs = new Map(cores.map((core) => [core.label, new Map(specs.map((spec) => [spec.name, core.index.makeFixture(spec)]))]));
const inputs = specs.map((spec) => ({ id: spec.name, value: spec.name }));
const route = measureIsolated({
  arms: cores.map((core) => ({ id: core.label, run: (name: string) => core.index.sectionsRouter(options).route(graphs.get(core.label)!.get(name)) })),
  inputs,
  repeats: repeat,
  warmup: 1,
  mode: "process",
});
// The arms of the level links: each core with `levels.ts` makes the links of the levels of its own route. A core before 0.1.2 has no such arm.
// The last level holds each node alone and copies the routes. The other levels have the level links.
const withLevels = cores.filter((core) => core.levels);
const groups = new Map(
  withLevels.map((core) => [core.label, new Map(specs.map((spec) => [spec.name, (core.index.sectionsRouter(options).route(graphs.get(core.label)!.get(spec.name)).levels ?? []).slice(0, -1)]))]),
);
const linksOf = (core: Core, name: string): void => {
  for (const level of groups.get(core.label)!.get(name)!) {
    const pairs = level.links.map((l: { source: string; target: string; count: number }) => ({ source: l.source, target: l.target, count: l.count }));
    core.levels.levelLinks(level.items, pairs, options);
  }
};
const links: PairedReport | undefined =
  withLevels.length > 0 ? measureIsolated({ arms: withLevels.map((core) => ({ id: core.label, run: (name: string) => linksOf(core, name) })), inputs, repeats: repeat, warmup: 1, mode: "process" }) : undefined;

const medianOf = (report: PairedReport | undefined, arm: string): string => {
  const ms = report?.inputs.map((i) => i.median[arm]).filter((x): x is number => x !== undefined) ?? [];
  return ms.length === 0 ? "-" : Math.round([...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)]!).toString();
};
const sizes = specs.map((spec) => {
  const graph = graphs.get(cores[0]!.label)!.get(spec.name);
  return `${spec.name} (${graph.nodes.length} nodes, ${graph.edges.length} edges)`;
});
console.log(`The router of the example boards on ${sizes.join(", ")}, ${repeat} timed rounds. Each cell is the median over the fixtures of the median of the rounds:\n`);
console.log("| source | route ms | level links ms |\n|---|---:|---:|");
for (const core of cores) console.log(`| ${core.label} | ${medianOf(route, core.label)} | ${medianOf(links, core.label)} |`);
if (fixtures.length === 1) console.log("\nWith one fixture, the noise floor is one ratio. Give more fixtures to get a band.");
if (cores.length > 1) console.log(`\n### The route\n\n${pairedTable(route).join("\n")}`);
if (links && withLevels.length > 1) console.log(`\n### The level links\n\n${pairedTable(links).join("\n")}`);
const pairedOut = opt("--paired");
if (pairedOut) writeFileSync(pairedOut, JSON.stringify(links ? [route, links] : [route]) + "\n");
