// RULE-019: the rule file `energy` against `shared` on the 150 boards of `screen-v3`. Each family gets R2 (the mean crossing angle), crossings and hard breaks.
// Run from `packages/core`: `node scripts/rule-energy.ts <out.json>`. The record is local, so it has no time.
import { writeFileSync } from "node:fs";
import { crossingAngles, drawnSegments } from "../src/bench/measures/routes.ts";
import { checkProperties } from "../src/bench/properties.ts";
import { measureQuality } from "../src/bench/quality.ts";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { SCREEN_SETS, screenInputs } from "../src/bench/screen/index.ts";
import type { Graph, Result } from "../src/model.ts";
import { RULES_DEFAULTS, rulesRouter, rulesStrategy } from "../src/routers/index.ts";
import { sharedRouter } from "../src/routers/shared.ts";
import { byCollection } from "../src/routers/trunks.ts";

const out = process.argv[2];

/** One arm of the count: a name and its router. */
const arms: readonly { readonly name: string; readonly run: (graph: Graph) => Result }[] = [
  { name: "shared", run: (graph) => sharedRouter({ name: "shared", rule: byCollection }).route(graph) },
  { name: "energy-adam", run: (graph) => rulesStrategy.run(graph, { ...RULES_DEFAULTS, preset: "energy" }) },
  { name: "energy-gradient", run: (graph) => rulesStrategy.run(graph, { ...RULES_DEFAULTS, preset: "energy", descent: "gradient" }) },
  { name: "elastic-adam", run: (graph) => rulesStrategy.run(graph, RULES_DEFAULTS) },
  { name: "angle-only", run: (graph) => rulesRouter({ name: "rules", rule: byCollection, rules: { rules: [{ select: "leg-crossings", term: "angle", weight: 1 }] } }).route(graph) },
];

/** The sum of one arm over one family. */
interface Row {
  boards: number;
  crossed: number;
  crossings: number;
  meanSum: number;
  breaks: number;
}

/** This function gives the median of a list of numbers. */
function median(values: readonly number[]): number {
  const list = [...values].sort((a, b) => a - b);
  return list.length === 0 ? 0 : (list[Math.floor((list.length - 1) / 2)]! + list[Math.ceil((list.length - 1) / 2)]!) / 2;
}

const rows = new Map<string, Row>();
const perBoard = new Map<string, number[]>();
for (const input of screenInputs(SCREEN_SETS["screen-v3"]!)) {
  const graph = inputGraph(input);
  for (const arm of arms) {
    const result = arm.run(graph);
    const angles = crossingAngles(drawnSegments(result.routes));
    const key = `${input.family}|${arm.name}`;
    const row = rows.get(key) ?? { boards: 0, crossed: 0, crossings: 0, meanSum: 0, breaks: 0 };
    row.boards++;
    row.crossings += measureQuality(graph, result).crossings;
    row.breaks += checkProperties(graph, result, Infinity).length;
    if (angles.crossings > 0) {
      row.crossed++;
      row.meanSum += angles.mean;
      perBoard.set(key, [...(perBoard.get(key) ?? []), angles.mean]);
    }
    rows.set(key, row);
  }
}

const families = [...new Set([...rows.keys()].map((k) => k.split("|")[0]!))].sort();
const table = families.map((family) => {
  const of = Object.fromEntries(
    arms.map((arm) => {
      const r = rows.get(`${family}|${arm.name}`)!;
      return [arm.name, { boards: r.boards, crossedBoards: r.crossed, crossings: r.crossings, r2Median: Math.round(median(perBoard.get(`${family}|${arm.name}`) ?? []) * 90 * 100) / 100, breaks: r.breaks }];
    }),
  );
  return { family, arms: of };
});

const rises = (name: string): number => table.filter((row) => (row.arms[name]?.r2Median ?? 0) > (row.arms["shared"]?.r2Median ?? 0)).length;
const falls = (name: string): number => table.filter((row) => (row.arms[name]?.r2Median ?? 0) < (row.arms["shared"]?.r2Median ?? 0)).length;
const record = { set: "screen-v3", unit: "degrees, the median over the boards with a crossing of the mean crossing angle", families: table.length, rises: { adam: rises("energy-adam"), gradient: rises("energy-gradient"), angleOnly: rises("angle-only") }, falls: { adam: falls("energy-adam"), gradient: falls("energy-gradient"), angleOnly: falls("angle-only") }, table };
if (out) writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
for (const row of table) console.log(row.family, ...arms.map((arm) => `${arm.name} ${row.arms[arm.name]!.r2Median} x${row.arms[arm.name]!.crossings} b${row.arms[arm.name]!.breaks}`));
console.log("rises", record.rises, "falls", record.falls);
