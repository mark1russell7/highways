// RULE-019 and RULE-POINTS: rule files against `shared` on the 150 boards of `screen-v3`. Each family gets R2 (the mean crossing angle), crossings and hard breaks for each arm, and each arm states its variable.
// Run from `packages/core`: `node scripts/rule-energy.ts <out.json>`. The record is local, so it has no time.
import { writeFileSync } from "node:fs";
import { crossingAngles, drawnSegments } from "../src/bench/measures/routes.ts";
import { checkProperties } from "../src/bench/properties.ts";
import { measureQuality } from "../src/bench/quality.ts";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { SCREEN_SETS, screenInputs } from "../src/bench/screen/index.ts";
import type { Graph, Result } from "../src/model.ts";
import { ENERGY_RULES, freeVariables, RULES_DEFAULTS, rulesRouter, rulesStrategy, type RuleVariable, type SolverOutcome } from "../src/routers/index.ts";
import { sharedRouter } from "../src/routers/shared.ts";
import { byCollection } from "../src/routers/trunks.ts";

const out = process.argv[2];

/** This function routes a board, and gives the outcome of the guards to `report`. */
type Run = (graph: Graph, report: (outcome: SolverOutcome) => void) => Result;

/** This function gives the arm with only the term `angle`. */
function angleOnly(variable: RuleVariable): Run {
  return (graph, report) => rulesRouter({ name: "rules", rule: byCollection, report, rules: { variable, rules: [{ select: "free-crossings", term: "angle", weight: 1 }] } }).route(graph);
}

/** One arm of the count: a name, its variable and its router. The arm `shared` moves nothing, and its variable is `none`. */
const arms: readonly { readonly name: string; readonly variable: RuleVariable | "none"; readonly run: Run }[] = [
  { name: "shared", variable: "none", run: (graph) => sharedRouter({ name: "shared", rule: byCollection }).route(graph) },
  { name: "energy-adam", variable: "legs", run: (graph, report) => rulesStrategy.run(graph, { ...RULES_DEFAULTS, preset: "energy", report }) },
  { name: "energy-gradient", variable: "legs", run: (graph, report) => rulesStrategy.run(graph, { ...RULES_DEFAULTS, preset: "energy", descent: "gradient", report }) },
  { name: "elastic-adam", variable: "legs", run: (graph, report) => rulesStrategy.run(graph, { ...RULES_DEFAULTS, report }) },
  { name: "angle-only", variable: "legs", run: angleOnly("legs") },
  { name: "energy-adam-points", variable: "points", run: (graph, report) => rulesStrategy.run(graph, { ...RULES_DEFAULTS, preset: "energy", variable: "points", report }) },
  { name: "energy-gradient-points", variable: "points", run: (graph, report) => rulesStrategy.run(graph, { ...RULES_DEFAULTS, preset: "energy", descent: "gradient", variable: "points", report }) },
  { name: "elastic-adam-points", variable: "points", run: (graph, report) => rulesStrategy.run(graph, { ...RULES_DEFAULTS, variable: "points", report }) },
  { name: "angle-only-points", variable: "points", run: angleOnly("points") },
];

/** The sum of one arm over one family. */
interface Row {
  boards: number;
  /** The boards where this arm gives the routes of `shared`. */
  sameAsShared: number;
  /** The boards where the guard of the whole board gave back the routes of `shared`, and the moved routes that it dropped. */
  droppedBoards: number;
  droppedRoutes: number;
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
const variableCount = new Map<string, { legs: number; points: number }>();
const perBoard = new Map<string, number[]>();
for (const input of screenInputs(SCREEN_SETS["screen-v3"]!)) {
  const graph = inputGraph(input);
  const base = arms[0]!.run(graph, () => undefined);
  const count = variableCount.get(input.family) ?? { legs: 0, points: 0 };
  count.legs += freeVariables(graph, base, { ...ENERGY_RULES, variable: "legs" }, RULES_DEFAULTS.clearance).length;
  // A point has two variables, one in x and one in y.
  count.points += freeVariables(graph, base, { ...ENERGY_RULES, variable: "points" }, RULES_DEFAULTS.clearance).length / 2;
  variableCount.set(input.family, count);
  for (const arm of arms) {
    let outcome: SolverOutcome | undefined;
    const result = arm.run(graph, (o) => {
      outcome = o;
    });
    const angles = crossingAngles(drawnSegments(result.routes));
    const key = `${input.family}|${arm.name}`;
    const row = rows.get(key) ?? { boards: 0, sameAsShared: 0, droppedBoards: 0, droppedRoutes: 0, crossed: 0, crossings: 0, meanSum: 0, breaks: 0 };
    row.boards++;
    const seen = outcome as SolverOutcome | undefined;
    if (seen !== undefined && seen.dropped !== "none") {
      row.droppedBoards++;
      row.droppedRoutes += seen.routes;
    }
    if (JSON.stringify(result.routes) === JSON.stringify(base.routes)) row.sameAsShared++;
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
      return [arm.name, { variable: arm.variable, boards: r.boards, sameAsShared: r.sameAsShared, droppedBoards: r.droppedBoards, droppedRoutes: r.droppedRoutes, crossedBoards: r.crossed, crossings: r.crossings, r2Median: Math.round(median(perBoard.get(`${family}|${arm.name}`) ?? []) * 90 * 100) / 100, breaks: r.breaks }];
    }),
  );
  return { family, freeLegs: variableCount.get(family)!.legs, freePoints: variableCount.get(family)!.points, arms: of };
});

const rises = (name: string): number => table.filter((row) => (row.arms[name]?.r2Median ?? 0) > (row.arms["shared"]?.r2Median ?? 0)).length;
const falls = (name: string): number => table.filter((row) => (row.arms[name]?.r2Median ?? 0) < (row.arms["shared"]?.r2Median ?? 0)).length;
const moved = arms.slice(1).map((arm) => arm.name);
const record = { set: "screen-v3", unit: "degrees, the median over the boards with a crossing of the mean crossing angle", families: table.length, rises: Object.fromEntries(moved.map((name) => [name, rises(name)])), falls: Object.fromEntries(moved.map((name) => [name, falls(name)])), table };
if (out) writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
for (const row of table) console.log(row.family, ...arms.map((arm) => `${arm.name} ${row.arms[arm.name]!.r2Median} x${row.arms[arm.name]!.crossings} b${row.arms[arm.name]!.breaks} same${row.arms[arm.name]!.sameAsShared} dropped${row.arms[arm.name]!.droppedBoards}`));
console.log("rises", record.rises, "falls", record.falls);
