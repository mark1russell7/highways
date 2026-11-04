// The shared length of the router `seams` (PASS-SEAMS): how much of the length of a board runs on a line that another route also uses.
//
// - `node scripts/seam-share.ts [--out <file>]`
// - A seam has no room for lanes, so routes on one seam lie on top of each other. The measures of the screen do not show this cost.
// - The ink measure B1 gives credit for shared length, and `crossings` counts each crossing of two shared stretches one time.
// - The counts are the same on each machine. The record is a limit of the router, not a verdict.
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { screenInputs, SCREEN_V2 } from "../src/bench/screen/set.ts";
import type { Result } from "../src/model.ts";
import { cornersRouter, seamsRouter } from "../src/routers/index.ts";

/** One leg of a route on an axis line. */
interface Leg {
  readonly lo: number;
  readonly hi: number;
  readonly route: number;
}

/** One row of the record. */
interface Row {
  readonly seed: number;
  readonly router: string;
  readonly length: number;
  readonly sharedShare: number;
  readonly peak: number;
}

/** This function gives the total length, the share of it on a line with two or more routes, and the most routes on one piece of a line. */
function shareOf(result: Result): { length: number; sharedShare: number; peak: number } {
  const lines = new Map<string, Leg[]>();
  let length = 0;
  const add = (key: string, a: number, b: number, route: number): void => {
    const list = lines.get(key) ?? [];
    list.push({ lo: Math.min(a, b), hi: Math.max(a, b), route });
    lines.set(key, list);
  };
  result.routes.forEach((r, route) => {
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1]!;
      const b = r.points[i]!;
      length += Math.hypot(a.x - b.x, a.y - b.y);
      if (a.x === b.x) add(`x${a.x}`, a.y, b.y, route);
      else if (a.y === b.y) add(`y${a.y}`, a.x, b.x, route);
    }
  });
  let shared = 0;
  let peak = 0;
  for (const legs of lines.values()) {
    const stops = [...new Set(legs.flatMap((l) => [l.lo, l.hi]))].sort((p, q) => p - q);
    for (let i = 1; i < stops.length; i++) {
      const lo = stops[i - 1]!;
      const hi = stops[i]!;
      const routes = new Set(legs.filter((l) => l.lo <= lo && l.hi >= hi).map((l) => l.route)).size;
      if (routes >= 2) shared += (hi - lo) * routes;
      peak = Math.max(peak, routes);
    }
  }
  return { length, sharedShare: length > 0 ? shared / length : 0, peak };
}

const { values } = parseArgs({ options: { out: { type: "string" } } });
const inputs = screenInputs(SCREEN_V2);
const rows: Row[] = [];
for (let seed = 0; seed < 10; seed++) {
  const input = inputs.find((i) => i.id === `screen-v2/packed-grid/s${seed}`)!;
  const graph = inputGraph(input);
  for (const router of [cornersRouter({ name: "corners" }), seamsRouter({ name: "seams" })]) {
    const share = shareOf(router.route(graph));
    rows.push({ seed, router: router.name, length: Math.round(share.length), sharedShare: Math.round(share.sharedShare * 1000) / 1000, peak: share.peak });
  }
}
const text = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
if (values.out) writeFileSync(values.out, text);
else console.log(text);
