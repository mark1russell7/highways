// A probe of HWC-B on case-many-groups after ROUTE-TIE: the crossings in the body and at the ends, with each lane order and shift.
import { CASES } from "../src/cases.ts";
import { benchHighways } from "../src/bench/curves.ts";
import { sharedRouter } from "../src/routers/shared.ts";
const graph = CASES.find((c) => c.name === "case-many-groups")!.make();
for (const [dx, dy] of [[0, 0], [1e-12, -1e-12], [-1e-10, 1e-10], [1e-8, 1e-8], [-1e-7, -1e-7]] as const) {
  const nodes = graph.nodes.map((n) => ({ ...n, box: { ...n.box, x: n.box.x + dx, y: n.box.y + dy } }));
  const g = { ...graph, nodes };
  const [, run] = benchHighways(sharedRouter({ name: "shared-all", laneOrder: "run" }), "case-many-groups", g);
  const [, bundle] = benchHighways(sharedRouter({ name: "shared-all" }), "case-many-groups", g);
  console.log(JSON.stringify({ dx, dy, run: [run!.crossings, run!.endCrossings], bundle: [bundle!.crossings, bundle!.endCrossings] }));
}
