// The shared length of the router `seams` (PASS-SEAMS): how much of the length of a board runs on a line that another route also uses.
//
// - `node scripts/seam-share.ts [--out <file>]`
// - A seam has no room for lanes, so routes on one seam lie on top of each other. The measure B11 gives this cost.
// - The ink measure B1 gives credit for shared length, and `crossings` counts each crossing of two shared stretches one time. So `screen-verdict.ts` gives limits of B11.
// - The counts are the same on each machine. The record is a limit of the router, not a verdict.
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { polylineLength } from "../src/geom.ts";
import { routeOverlap } from "../src/bench/measures/overlap.ts";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { screenInputs, SCREEN_V2 } from "../src/bench/screen/set.ts";
import { cornersRouter, seamsRouter } from "../src/routers/index.ts";

/** One row of the record. */
interface Row {
  readonly seed: number;
  readonly router: string;
  readonly length: number;
  readonly sharedShare: number;
  readonly peak: number;
}

const { values } = parseArgs({ options: { out: { type: "string" } } });
const inputs = screenInputs(SCREEN_V2);
const rows: Row[] = [];
for (let seed = 0; seed < 10; seed++) {
  const input = inputs.find((i) => i.id === `screen-v2/packed-grid/s${seed}`)!;
  const graph = inputGraph(input);
  for (const router of [cornersRouter({ name: "corners" }), seamsRouter({ name: "seams" })]) {
    const { routes } = router.route(graph);
    const overlap = routeOverlap(routes);
    const length = routes.reduce((sum, r) => sum + polylineLength(r.points), 0);
    rows.push({ seed, router: router.name, length: Math.round(length), sharedShare: Math.round(overlap.share * 1000) / 1000, peak: overlap.peak });
  }
}
const text = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
if (values.out) writeFileSync(values.out, text);
else console.log(text);
