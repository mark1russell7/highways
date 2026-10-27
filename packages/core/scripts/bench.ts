// The command line of the benchmark: `pnpm bench [--max <nodes>] [--json <file>]`.
import { writeFileSync } from "node:fs";
import { CASES, nestedGridBoard, packedGridBoard } from "../src/cases.ts";
import { FIXTURES } from "../src/fixtures.ts";
import { benchCurveStrategies, benchHighways, formatCurves, formatHighways, type CurveBenchRow, type HighwayBenchRow } from "../src/bench/curves.ts";
import { measureLevelFaults } from "../src/bench/links.ts";
import { benchOne, formatFaults, formatLevels, formatTable, runBenchmark, type LevelRow } from "../src/bench/run.ts";
import { benchLevelRoom, benchRoom, formatLevelRoom, formatRoom, growthSettings, laneSettings, passSettings, sweepRoom } from "../src/bench/room.ts";
import { capSettings, formatSections, groupSettings, slackSettings, stretchSettings, sweepSections } from "../src/bench/sections.ts";
import { makeFixture } from "../src/fixtures.ts";
import { levelLinks, THROUGH_COST_SWEEP } from "../src/levels.ts";
import type { Graph, Node } from "../src/model.ts";
import { sectionsRouter } from "../src/routers/sections.ts";
import { sharedRouter } from "../src/routers/shared.ts";
import { trunksRouter } from "../src/routers/trunks.ts";
import { STRATEGIES } from "../src/strategies/builtins.ts";
import { listStrategies, routersOf } from "../src/strategies/model.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
// The registry gives each list, so a new strategy gets its rows with no edit here.
const ROUTERS = routersOf(STRATEGIES);
const max = Number(opt("--max") ?? 1000);
const rows = runBenchmark(
  ROUTERS,
  FIXTURES.filter((f) => f.nodes <= max),
  { repeat: Number(opt("--repeat") ?? 3) },
);
// The case boards are small, so each run races them. Each case shows one known defect.
for (const c of CASES) {
  const graph = c.make();
  for (const router of ROUTERS) if (graph.nodes.length <= (router.maxNodes ?? Infinity)) rows.push(benchOne(router, c.name, graph, Number(opt("--repeat") ?? 3)));
}
console.log(formatTable(rows));
console.log();
console.log(formatFaults(rows));
// The faults of each zoom level with groups, with the split of level through into unavoidable and avoidable links (ER3d).
console.log();
console.log(formatLevels(rows.filter((r) => r.levelFaults.length > 0)));
// The curve types change only the drawing of the routes, so the small fixtures are enough.
const curves: CurveBenchRow<string>[] = [];
for (const spec of FIXTURES.filter((f) => f.nodes <= 100)) {
  const graph = makeFixture(spec);
  for (const router of ROUTERS) curves.push(...benchCurveStrategies(router, spec.name, graph, listStrategies(STRATEGIES, "curve")));
}
console.log();
console.log(formatCurves(curves));
// The curves of the bundles (HWC): each lane curved alone with `rounded`, then the lanes of each bundle bent as one with `highway`.
// The routers with the rule "all" make the bundles that the defaults do not make on these boards.
const all = (): "all" => "all";
const bundlers = [
  ...ROUTERS.filter((r) => r.name === "trunks" || r.name === "shared"),
  trunksRouter({ name: "trunks-all", rule: all }),
  sharedRouter({ name: "shared-all", rule: all }),
];
const highways: HighwayBenchRow[] = [];
for (const name of ["case-dense-groups", "case-hub-chain", "case-many-groups"]) {
  const graph = CASES.find((c) => c.name === name)!.make();
  for (const router of bundlers) highways.push(...benchHighways(router, name, graph));
}
console.log();
console.log(formatHighways(highways));
// The room of the links: a packed board of touching boxes, before and after `makeRoom` at gutter 8 and spacing 4.
console.log();
console.log(formatRoom(benchRoom("packed-grid", packedGridBoard(), { gutter: 8, spacing: 4 }, listStrategies(STRATEGIES, "room"))));
// The sweeps of the knobs of the room: maxGrowth (ROOM-A), the lane order and the spacing (ROOM-C), the gutter and the passes (ROOM-D).
for (const settings of [growthSettings(), laneSettings(), passSettings()]) {
  console.log();
  console.log(formatRoom(sweepRoom("packed-grid", packedGridBoard(), settings)));
}
// The room of each zoom level (ROOM2): each level with groups of two packed boards, before and after `levelRoom` at gutter 8 and spacing 4.
console.log();
console.log(formatLevelRoom([...benchLevelRoom("packed-grid", packedGridBoard(), { gutter: 8, spacing: 4 }), ...benchLevelRoom("nested-grid", nestedGridBoard(), { gutter: 8, spacing: 4 })]));
// The sweeps of the options of the levels (CUSTOM). The first row of each table is the fair baseline: the router `sections` with the defaults.
const board = (name: string) => CASES.find((c) => c.name === name)!.make();
const groupKey = (n: Node): string => n.id.slice(0, n.id.lastIndexOf("-"));
for (const [fixture, settings] of [
  ["case-hub-chain", stretchSettings()],
  ["case-hub-chain", slackSettings()],
  ["case-dense-groups", capSettings()],
  ["case-many-groups", capSettings()],
  ["case-many-groups", groupSettings(listStrategies(STRATEGIES, "group"), { keys: { key: groupKey } })],
] as const) {
  console.log();
  console.log(formatSections(sweepSections(fixture, board(fixture), settings)));
}
// The sweep of the cost of a level link through a far box (ER3d). It gives the faults of each level, and the time of the level links alone.
// The faults come from the router `sections` with its defaults. The times come from the router of the example boards, as `pnpm run levels` times them.
const SITE = { margin: 20, stretch: 3, cap: 6 };
const throughBoards: [string, Graph][] = [
  ...FIXTURES.filter((f) => f.name === "mid-clustered" && f.nodes <= max).map((f): [string, Graph] => [f.name, makeFixture(f)]),
  ...CASES.map((c): [string, Graph] => [c.name, c.make()]),
];
const throughRows: LevelRow[] = [];
const throughTimes: string[] = [];
for (const [fixture, graph] of throughBoards) {
  const site = (sectionsRouter({ name: "site", ...SITE }).route(graph).levels ?? []).slice(0, -1);
  for (const throughCost of THROUGH_COST_SWEEP) {
    const setting = `throughCost ${throughCost}`;
    throughRows.push({ router: setting, fixture, levelFaults: measureLevelFaults(sectionsRouter({ name: setting, throughCost }).route(graph)) });
    const times: number[] = [];
    for (let r = 0; r < Number(opt("--repeat") ?? 3); r++) {
      const t0 = performance.now();
      for (const level of site) levelLinks(level.items, level.links.map(({ source, target, count }) => ({ source, target, count })), { ...SITE, throughCost });
      times.push(performance.now() - t0);
    }
    times.sort((x, y) => x - y);
    throughTimes.push(`| ${fixture} | ${setting} | ${times[Math.floor(times.length / 2)]!.toFixed(1)} |`);
  }
}
console.log();
console.log(formatLevels(throughRows));
console.log();
console.log(["| fixture | setting | level links ms (example boards) |", "|---|---|---:|", ...throughTimes].join("\n"));
const json = opt("--json");
if (json) writeFileSync(json, JSON.stringify(rows, null, 2) + "\n");
if (rows.some((r) => !r.deterministic)) process.exitCode = 1;
