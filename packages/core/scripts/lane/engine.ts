// MEASURE-ONLY (LANE-ORDER): `pnpm screen --module packages/core/scripts/lane/engine.ts` screens the built-in strategies with the lane order "engine".
// At the exit, the script writes the count of the runs that orderLanes ordered, the runs with a cycle and the broken cycles.
import { observeLanes, setLaneSort } from "../../src/lane-order.ts";
import { highwayStrategies, routerStrategies } from "../../src/strategies/builtins.ts";

setLaneSort("engine");
const lanes = { runs: 0, cyclic: 0, breaks: 0 };
observeLanes((n, breaks) => {
  if (n < 2) return;
  lanes.runs++;
  if (breaks > 0) lanes.cyclic++;
  lanes.breaks += breaks;
});
process.on("exit", () => console.log(`lane-order engine: ${JSON.stringify(lanes)}`));

export const routers = Object.values(routerStrategies);
export const highways = Object.values(highwayStrategies);
