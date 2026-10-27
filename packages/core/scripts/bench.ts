// The command line of the benchmark: `pnpm bench [--max <nodes>] [--json <file>]`.
import { writeFileSync } from "node:fs";
import { CASES, packedGridBoard } from "../src/cases.ts";
import { FIXTURES } from "../src/fixtures.ts";
import { benchCurveStrategies, formatCurves, type CurveBenchRow } from "../src/bench/curves.ts";
import { benchOne, formatFaults, formatTable, runBenchmark } from "../src/bench/run.ts";
import { benchRoom, formatRoom, growthSettings, laneSettings, passSettings, sweepRoom } from "../src/bench/room.ts";
import { makeFixture } from "../src/fixtures.ts";
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
// The curve types change only the drawing of the routes, so the small fixtures are enough.
const curves: CurveBenchRow<string>[] = [];
for (const spec of FIXTURES.filter((f) => f.nodes <= 100)) {
  const graph = makeFixture(spec);
  for (const router of ROUTERS) curves.push(...benchCurveStrategies(router, spec.name, graph, listStrategies(STRATEGIES, "curve")));
}
console.log();
console.log(formatCurves(curves));
// The room of the links: a packed board of touching boxes, before and after `makeRoom` at gutter 8 and spacing 4.
console.log();
console.log(formatRoom(benchRoom("packed-grid", packedGridBoard(), { gutter: 8, spacing: 4 }, listStrategies(STRATEGIES, "room"))));
// The sweeps of the knobs of the room: maxGrowth (ROOM-A), the lane order and the spacing (ROOM-C), the gutter and the passes (ROOM-D).
for (const settings of [growthSettings(), laneSettings(), passSettings()]) {
  console.log();
  console.log(formatRoom(sweepRoom("packed-grid", packedGridBoard(), settings)));
}
const json = opt("--json");
if (json) writeFileSync(json, JSON.stringify(rows, null, 2) + "\n");
if (rows.some((r) => !r.deterministic)) process.exitCode = 1;
