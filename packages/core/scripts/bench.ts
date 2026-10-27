// The command line of the benchmark: `pnpm bench [--min <nodes>] [--max <nodes>] [--repeat <n>] [--routers <a,b>] [--skip-routers <a,b>]
// [--cell-limit <ms>] [--rows-only] [--seeds <n>] [--seeds-max-nodes <nodes>] [--stability-max <nodes>] [--suite-steps <a,b>]
// [--json <file>] [--side-tables <file>] [--report <file>]`.
// The workflow `Bench` starts one part of the benchmark in each job, with `--min`, `--max`, `--routers` and `--rows-only`.
// The script `bench-join.ts` joins the parts.
import { writeFileSync } from "node:fs";
import { CASES, nestedGridBoard, packedGridBoard } from "../src/cases.ts";
import { FIXTURES } from "../src/fixtures.ts";
import { benchCurveStrategies, benchHighways, formatCurves, formatHighways, type CurveBenchRow, type HighwayBenchRow } from "../src/bench/curves.ts";
import { measureLevelFaults } from "../src/bench/links.ts";
import { benchOne, formatFaults, formatLevels, formatTable, type LevelRow } from "../src/bench/run.ts";
import { benchLevelRoom, benchRoom, formatLevelRoom, formatRoom, growthSettings, laneSettings, passSettings, sweepRoom } from "../src/bench/room.ts";
import { capSettings, formatSections, groupSettings, slackSettings, stretchSettings, sweepSections } from "../src/bench/sections.ts";
import { makeFixture } from "../src/fixtures.ts";
import { levelLinks, THROUGH_COST_SWEEP } from "../src/levels.ts";
import type { Graph, Node } from "../src/model.ts";
import { sectionsRouter } from "../src/routers/sections.ts";
import { sharedRouter } from "../src/routers/shared.ts";
import { byCollection, trunksRouter } from "../src/routers/trunks.ts";
import { STRATEGIES } from "../src/strategies/builtins.ts";
import { listStrategies, routersOf, STEPS, type Step } from "../src/strategies/model.ts";
import { formatFronts, formatMeasureTime, formatRules, formatSummaries, runSuite } from "../src/bench/suite.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const list = (name: string): string[] | undefined => opt(name)?.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
const number = (name: string, fallback: number): number => {
  const text = opt(name);
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} needs a number of 0 or more, not "${text}"`);
  return value;
};
// The registry gives each list, so a new strategy gets its rows with no edit here.
const only = list("--routers");
const skip = list("--skip-routers") ?? [];
for (const name of [...(only ?? []), ...skip]) if (!routersOf(STRATEGIES).some((r) => r.name === name)) throw new Error(`There is no router "${name}"`);
const ROUTERS = routersOf(STRATEGIES).filter((r) => (only ? only.includes(r.name) : true) && !skip.includes(r.name));
const min = number("--min", 0);
const max = number("--max", 1000);
const repeat = number("--repeat", 3);
const cellLimit = number("--cell-limit", Infinity);
// A part with `--rows-only` gives only the rows of its fixtures: no case boards and no side tables.
const rowsOnly = args.includes("--rows-only");
// The steps of the measure suite. A part of the workflow `Bench` runs some steps only, so each step runs in one part.
const suiteSteps = (list("--suite-steps") ?? [...STEPS]) as Step[];
for (const step of suiteSteps) if (!STEPS.includes(step)) throw new Error(`There is no step "${step}"`);
// The measure suite (MEAS1) runs each fixture family over the seeds. Its first seed gives the rows of today.
// A family with more nodes than `--seeds-max-nodes` gets one seed only.
const suite = runSuite({
  fixtures: FIXTURES.filter((f) => f.nodes >= min),
  max,
  seeds: number("--seeds", 5),
  seedsMaxNodes: number("--seeds-max-nodes", 1000),
  repeat,
  stabilityMax: number("--stability-max", 1000),
  routers: ROUTERS.map((r) => r.name),
  steps: suiteSteps,
  cellLimit,
  log: (line) => process.stderr.write(line + "\n"),
});
const rows = suite.bench;
// The case boards are small, so each run races them. Each case shows one known defect.
if (!rowsOnly)
  for (const c of CASES) {
    const graph = c.make();
    for (const router of ROUTERS) if (graph.nodes.length <= (router.maxNodes ?? Infinity)) rows.push(benchOne(router, c.name, graph, repeat, cellLimit));
  }
console.log(formatTable(rows));
console.log();
console.log(formatFaults(rows));
// The faults of each zoom level with groups, with the split of level through into unavoidable and avoidable links (ER3d).
console.log();
console.log(formatLevels(rows.filter((r) => r.levelFaults.length > 0)));
const json = opt("--json");
if (json) writeFileSync(json, JSON.stringify(rows, null, 2) + "\n");
if (rows.some((r) => !r.deterministic)) process.exitCode = 1;
// The side tables come after the tables of the rows. `--side-tables` also writes them to a file, for the join of the parts.
const side: string[] = [];
const show = (table: string): void => {
  console.log();
  console.log(table);
  side.push(table);
};
// A part with `--rows-only` has no side tables.
if (!rowsOnly) sideTables();
const sideFile = opt("--side-tables");
if (sideFile && side.length > 0) writeFileSync(sideFile, side.join("\n\n") + "\n");
// The measure suite: the spread over the seeds, the Pareto front of each step, the counts of the proposed hard rules and the time of the measures.
// The script `bench-join.ts` prints the same tables for the joined report.
const report = suite.report;
for (const step of ["router", "curve", "room", "group"] as const) {
  console.log();
  console.log(formatSummaries(report.summaries, step));
}
console.log();
console.log(formatFronts(report.fronts));
console.log();
console.log(formatRules(report.rules));
for (const step of ["router", "group"] as const) {
  console.log();
  console.log(formatMeasureTime(report.rows, step));
}
const out = opt("--report");
if (out) writeFileSync(out, JSON.stringify(report) + "\n");

/** This function prints the side tables: the curves, the highways, the room, the sweeps of the levels and the cost of a link through a box. */
function sideTables(): void {
  // The curve types change only the drawing of the routes, so the small fixtures are enough.
  const curves: CurveBenchRow<string>[] = [];
  for (const spec of FIXTURES.filter((f) => f.nodes <= 100)) {
    const graph = makeFixture(spec);
    for (const router of ROUTERS) curves.push(...benchCurveStrategies(router, spec.name, graph, listStrategies(STRATEGIES, "curve")));
  }
  show(formatCurves(curves));
  // The curves of the bundles (HWC): each lane curved alone with `rounded`, then the lanes of each bundle bent as one with `highway`.
  // The routers with the rule "all" make the bundles that the defaults do not make on these boards.
  const all = (): "all" => "all";
  const bundlers = [
    ...ROUTERS.filter((r) => r.name === "trunks" || r.name === "shared"),
    trunksRouter({ name: "trunks-all", rule: all }),
    sharedRouter({ name: "shared-all", rule: all }),
    // The lane order of each run alone (HWC-B): the old default, for the comparison.
    trunksRouter({ name: "trunks-all (run order)", rule: all, laneOrder: "run" }),
    sharedRouter({ name: "shared (run order)", rule: byCollection, laneOrder: "run" }),
    sharedRouter({ name: "shared-all (run order)", rule: all, laneOrder: "run" }),
    // The lanes leave the trunk at the split point (HWC-C): the old default, for the comparison.
    trunksRouter({ name: "trunks (leave at split)", rule: byCollection, leave: "split" }),
    trunksRouter({ name: "trunks-all (leave at split)", rule: all, leave: "split" }),
  ];
  const highways: HighwayBenchRow[] = [];
  for (const name of ["case-dense-groups", "case-hub-chain", "case-many-groups"]) {
    const graph = CASES.find((c) => c.name === name)!.make();
    for (const router of bundlers) highways.push(...benchHighways(router, name, graph));
  }
  show(formatHighways(highways));
  // The room of the links: a packed board of touching boxes, before and after `makeRoom` at gutter 8 and spacing 4.
  show(formatRoom(benchRoom("packed-grid", packedGridBoard(), { gutter: 8, spacing: 4 }, listStrategies(STRATEGIES, "room"))));
  // The sweeps of the knobs of the room: maxGrowth (ROOM-A), the lane order and the spacing (ROOM-C), the gutter and the passes (ROOM-D).
  for (const settings of [growthSettings(), laneSettings(), passSettings()]) {
    show(formatRoom(sweepRoom("packed-grid", packedGridBoard(), settings)));
  }
  // The room of each zoom level (ROOM2): each level with groups of two packed boards, before and after `levelRoom` at gutter 8 and spacing 4.
  show(formatLevelRoom([...benchLevelRoom("packed-grid", packedGridBoard(), { gutter: 8, spacing: 4 }), ...benchLevelRoom("nested-grid", nestedGridBoard(), { gutter: 8, spacing: 4 })]));
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
    show(formatSections(sweepSections(fixture, board(fixture), settings)));
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
      for (let r = 0; r < repeat; r++) {
        const t0 = performance.now();
        for (const level of site) levelLinks(level.items, level.links.map(({ source, target, count }) => ({ source, target, count })), { ...SITE, throughCost });
        times.push(performance.now() - t0);
      }
      times.sort((x, y) => x - y);
      throughTimes.push(`| ${fixture} | ${setting} | ${times[Math.floor(times.length / 2)]!.toFixed(1)} |`);
    }
  }
  show(formatLevels(throughRows));
  show(["| fixture | setting | level links ms (example boards) |", "|---|---|---:|", ...throughTimes].join("\n"));
}
