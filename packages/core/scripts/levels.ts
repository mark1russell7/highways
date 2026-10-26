// The times of the zoom levels: `pnpm run levels [--fixture <name>] [--repeat <n>] [--src <dir>]...`.
// It routes a fixture with the router of the example boards of the site. It times the route, and the level links alone.
// Each `--src [<label>=]<dir>` is the `src` folder of a core, for example the core of an earlier commit. The sources run in turn.
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const fixture = opt("--fixture") ?? "mid-clustered";
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
const spec = cores[0]!.index.FIXTURES.find((f: { name: string }) => f.name === fixture);
if (!spec) {
  console.error(`There is no fixture "${fixture}".`);
  process.exit(2);
}

const median = (list: readonly number[]): number => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]!;
const route: number[][] = cores.map(() => []);
const links: number[][] = cores.map(() => []);
for (let r = 0; r < repeat; r++) {
  cores.forEach((core, c) => {
    const graph = core.index.makeFixture(spec);
    let t = performance.now();
    const result = core.index.sectionsRouter(options).route(graph);
    route[c]!.push(performance.now() - t);
    if (!core.levels) return;
    // The last level holds each node alone and copies the routes. The other levels have the level links.
    const groups = (result.levels ?? []).slice(0, -1);
    t = performance.now();
    for (const level of groups) {
      const pairs = level.links.map((l: { source: string; target: string; count: number }) => ({ source: l.source, target: l.target, count: l.count }));
      core.levels.levelLinks(level.items, pairs, options);
    }
    links[c]!.push(performance.now() - t);
  });
}
const graph = cores[0]!.index.makeFixture(spec);
console.log(`The router of the example boards on ${fixture} (${graph.nodes.length} nodes, ${graph.edges.length} edges), median of ${repeat} runs:\n`);
console.log("| source | route ms | level links ms |\n|---|---:|---:|");
cores.forEach((core, c) => {
  const l = links[c]!.length ? Math.round(median(links[c]!)).toString() : "-";
  console.log(`| ${core.label} | ${Math.round(median(route[c]!))} | ${l} |`);
});
