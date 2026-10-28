// MEASURE-ONLY (LANE-ORDER): `pnpm screen --module packages/core/scripts/lane/diff.ts` screens the built-in strategies of the step.
// For each distinct run of 2 or more lanes, it compares the merge sort of the package with the sort of this engine, by the count of lanes.
// Two runs are the same run when their lanes in their start order have the same JSON. Thus a repeated route does not count again.
// At the exit, the script writes the counts.
import { createHash } from "node:crypto";
import { hasCycle, observeLanes } from "../../src/lane-order.ts";
import { highwayStrategies, routerStrategies } from "../../src/strategies/builtins.ts";

const sizes: Record<string, { runs: number; cyclic: number; changed: number }> = {};
const seen = new Set<string>();
let calls = 0;

observeLanes((start, compare, order) => {
  if (start.length < 2) return;
  calls++;
  let key: string;
  try {
    key = createHash("sha256").update(JSON.stringify(start)).digest("hex");
  } catch {
    key = `call ${calls}`;
  }
  if (seen.has(key)) return;
  seen.add(key);
  const size = String(Math.min(start.length, 8));
  const s = (sizes[size] ??= { runs: 0, cyclic: 0, changed: 0 });
  s.runs++;
  if (hasCycle(start.length, (i, j) => compare(start[i]!, start[j]!))) s.cyclic++;
  const engine = [...start].sort(compare);
  if (engine.some((x, i) => x !== order[i])) s.changed++;
});

process.on("exit", () => console.log(`lane-order diff: ${JSON.stringify({ node: process.version, v8: process.versions.v8, calls, distinct: seen.size, sizes })}`));

export const routers = Object.values(routerStrategies);
export const highways = Object.values(highwayStrategies);
