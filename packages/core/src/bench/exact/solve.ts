import { follow } from "../../highways/follow.ts";
import type { HighwayPlan } from "../../highways/model.ts";
import type { Graph, Route } from "../../model.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { asRouter, getStrategy } from "../../strategies/model.ts";
import { inkSaved } from "../measures/bundles.ts";
import { maxStretch } from "../screen/gap.ts";
import { exactModel, type ExactRule } from "./index.ts";

/**
 * The part of a persistent model of the package `highs` that `solveExact` uses.
 * The library does not import `highs`. The caller gives the loaded runtime, so `highs` stays a devDependency.
 */
export interface HighsModelLike {
  readonly options: { set(values: Readonly<Record<string, string | number | boolean>>): unknown };
  readonly info: { get(name: string): number | bigint };
  run(): unknown;
  getModelStatus(): number;
  getObjectiveValue(): number;
  getSolution(): { readonly colValue: ArrayLike<number> };
  getDimensions(): { readonly numCols: number };
  getColName(index: number): string;
  dispose(): void;
}

/** The part of the loaded runtime of the package `highs` that `solveExact` uses. */
export interface HighsLike {
  createModel(source: { readonly format: "lp"; readonly data: string }): HighsModelLike;
  readonly constants: { readonly modelStatus: { readonly optimal: number; readonly timeLimit: number } };
}

/** The result of one solve of the exact model. */
export interface ExactSolve {
  /** The model status of HiGHS, for example `optimal` or `time-limit`. */
  readonly status: string;
  /** This value is `true` when HiGHS proved the optimum, with a relative MIP gap of 0. */
  readonly proven: boolean;
  /** The objective of the best solution, or `null` without a solution. */
  readonly objective: number | null;
  /** The dual bound of HiGHS at the end of the solve, or `null` when HiGHS gives none. */
  readonly bound: number | null;
  /** The relative MIP gap of HiGHS at the end of the solve: `|objective - bound| / |objective|`. It is `null` without a solution. */
  readonly mipGap: number | null;
  /** The time of the solve, in seconds, without the time to make the model. */
  readonly seconds: number;
  /** The size of the model: the edges with a way in the stretch limit, the binary variables and the constraints. */
  readonly edges: number;
  readonly binaries: number;
  readonly rows: number;
  /** The plan of the best solution. It is empty without a solution. */
  readonly plan: HighwayPlan;
  /** The ink saved (B1) of the model itself: `1 - (the ink of the open links) / (the length of the ways)`. It is `null` without a solution. */
  readonly modelB1: number | null;
}

/** This function gives a finite number of the info of HiGHS, or `null`. */
function infoNumber(model: HighsModelLike, name: string): number | null {
  try {
    const v = Number(model.info.get(name));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * This function makes the exact model of a graph and solves it with HiGHS, with the relative MIP gap 0 and a time limit of `seconds`.
 * It gives the status, the proof, the bound, the gap, the time and the plan of the best solution.
 */
export function solveExact(highs: HighsLike, graph: Graph, o: { readonly stretch: number; readonly rule: ExactRule; readonly seconds: number }): ExactSolve {
  const model = exactModel(graph, { stretch: o.stretch, rule: o.rule });
  const size = { edges: model.edges, binaries: model.columns, rows: model.rows };
  const m = highs.createModel({ format: "lp", data: model.lp });
  try {
    m.options.set({ time_limit: o.seconds, output_flag: false, mip_rel_gap: 0 });
    const start = Date.now();
    m.run();
    const seconds = (Date.now() - start) / 1000;
    const code = m.getModelStatus();
    const statuses = highs.constants.modelStatus;
    const status = code === statuses.optimal ? "optimal" : code === statuses.timeLimit ? "time-limit" : `status-${code}`;
    // The value 2 of `primal_solution_status` is a feasible solution.
    const found = infoNumber(m, "primal_solution_status") === 2;
    if (!found) return { status, proven: false, objective: null, bound: infoNumber(m, "mip_dual_bound"), mipGap: null, seconds, ...size, plan: { highways: [] }, modelB1: null };
    const values = m.getSolution().colValue;
    const byName = new Map<string, number>();
    const cols = m.getDimensions().numCols;
    for (let i = 0; i < cols; i++) byName.set(m.getColName(i), values[i]!);
    const value = (name: string): number => byName.get(name) ?? 0;
    const plan = model.decode(value);
    // The ink is the sum of the lengths of the open links (`y`), and the length of the ways is the sum of the lengths of the arcs (`x`).
    let ink = 0;
    let ways = 0;
    for (const [name, len] of model.lengths) {
      if (value(name) <= 0.5) continue;
      if (name.startsWith("y")) ink += len;
      else ways += len;
    }
    const mipGap = infoNumber(m, "mip_gap");
    return {
      status,
      proven: code === statuses.optimal,
      objective: m.getObjectiveValue(),
      bound: infoNumber(m, "mip_dual_bound"),
      mipGap: code === statuses.optimal ? (mipGap ?? 0) : mipGap,
      seconds,
      ...size,
      plan,
      modelB1: ways > 0 ? Math.max(0, 1 - ink / ways) : 0,
    };
  } finally {
    m.dispose();
  }
}

/** The routes of a plan after `follow`, with the ink saved (B1) and the largest bundle stretch (B3) against the routes of `corners`. */
export interface PlanMeasures {
  readonly routes: readonly Route[];
  readonly b1: number;
  readonly b3max: number;
}

/** This function routes a plan with `follow`, and gives B1 and the largest B3 of the routes. The base of B3 is the router `corners`. */
export function planMeasures(graph: Graph, plan: HighwayPlan): PlanMeasures {
  const routes = follow(graph, plan).routes;
  const corners = asRouter(getStrategy(STRATEGIES, "router", "corners")).route(graph).routes;
  return { routes, b1: inkSaved(routes), b3max: maxStretch(routes, corners) };
}
