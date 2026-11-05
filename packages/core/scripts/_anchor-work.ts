// Probe of ROUTE-TIE, kept on a measure branch. Usage: node --import ./_anchor-work-hook.ts _anchor-work.ts <out.json>
// It splits the count WORK.corner of the budget form: the reads of the search, the reads of the walk, and the pops above `best` that the stop at `best + TIE` costs.
import { writeFileSync } from "node:fs";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { WORK } from "../src/work.ts";
import { routerNamed } from "./route-tie-rows.ts";

const g = globalThis as any;
const reg = highwaysRegistry();
const rows: unknown[] = [];
for (const name of ["corners", "shared", "shared-all", "sections", "trunks", "sections-site"]) {
  const router = routerNamed(name);
  const c = { pops: 0, popsOver: 0, walkSteps: 0, walkReads: 0, degreeReads: 0 };
  g.__POP = (over: boolean): void => {
    c.pops++;
    if (over) c.popsOver++;
  };
  g.__STEP = (): void => {
    c.walkSteps++;
  };
  g.__READS = (n: number): void => {
    c.walkReads += n;
  };
  const before = WORK.corner;
  for (const f of HIGHWAYS_FAMILIES) for (let seed = 0; seed < 3; seed++) router.route(reg.generate(f.name, seed).graph);
  const total = WORK.corner - before;
  rows.push({ router: name, total, searchReads: total - c.walkReads, ...c });
  console.log(name, total, "search", total - c.walkReads, JSON.stringify(c));
  writeFileSync(process.argv[2]!, JSON.stringify(rows, null, 1));
}
