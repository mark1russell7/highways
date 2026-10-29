// The activation test of the screen of `highways` (ACTIVATION): the highways form of an output, the own move of each strategy,
// the base of each strategy, and the report of the candidates that are not exercised.
// `activation.ts` holds the functions without the types of `highways`. This file holds the parts of `highways`.
import type { CurveSegment } from "../../curves/model.ts";
import type { HighwayPlan } from "../../highways/model.ts";
import type { Graph, Result } from "../../model.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import type { Strategy } from "../../strategies/model.ts";
import { exercised, outputGroups, outputHash, type OutputGroup } from "./activation.ts";
import type { LayoutRecord } from "./forms.ts";
import { RECORD_EPS } from "./hash.ts";

const byEdge = <T extends { readonly edge: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));

/**
 * This function gives the output hash of a result of a router, in the highways form.
 * The form holds the routes in the order of the edge ids, and the levels, the bundles and the runs as the router gives them.
 * Each number goes to the grid `RECORD_EPS`, as `round3` does.
 */
export function resultHash(result: Result): string {
  return outputHash(resultForm(result), { grid: RECORD_EPS });
}

/** This function gives the highways form of a result of a router: the value that `resultHash` hashes. */
export function resultForm(result: Result): object {
  return { routes: byEdge(result.routes), levels: result.levels, bundles: result.bundles, runs: result.runs };
}

/** This function gives the output hash of the curves of the step `curve`, in the order of the edge ids. */
export function curvesHash(edges: readonly string[], curves: readonly (readonly CurveSegment[])[]): string {
  return outputHash(byEdge(edges.map((edge, i) => ({ edge, segments: curves[i] ?? [] }))), { grid: RECORD_EPS });
}

/**
 * The name of the own move of each built-in highway finder. The trace of a record names the count `move.<name>`.
 * The count is the number of highways of the plan with 2 edges or more. A finder without an entry counts `move.highway`.
 */
export const MOVE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  keys: "trunk",
  "shared-ways": "sharedWay",
  "shared-ways-all": "sharedWay",
  corridors: "corridor",
  quickbundles: "bundle",
  "road-classes": "mainRoad",
  "flow-field": "fieldLine",
  wspd: "pair",
  "od-cells": "cellPair",
  select: "pick",
  mingle: "merge",
  spiral: "spiralTree",
  "flow-clusters": "cluster",
  traclus: "cluster",
  diffusion: "channel",
  nested: "cluster",
  growth: "road",
  "edge-paths": "path",
  "soft-keys": "softKey",
  hough: "line",
  ridges: "ridge",
  hdbscan: "cluster",
  "hub-arcs": "hubArc",
  hierarchy: "bundle",
  fdeb: "bundle",
  mesh: "meshRoad",
  kdeeb: "bundle",
  cubu: "bundle",
  mlseb: "bundle",
  sbeb: "bundle",
  areas: "area",
  confluent: "track",
  power: "powerEdge",
  frechet: "cluster",
  spectral: "cluster",
  resistance: "cluster",
  "link-communities": "community",
  territories: "territory",
  consensus: "cluster",
  "p-hub": "hubLink",
  "scale-space": "cluster",
  steiner: "tree",
  gaps: "gap",
  streets: "street",
  search: "searched",
  interchanges: "networkRoad",
  knee: "tree",
  bronchial: "tree",
});

/**
 * The highway strategies that change the plan of another strategy (`from`). Their own move is a change of that plan, so they count no move.
 * The output against the plan `from` tells if they ran.
 */
export const PLAN_CHANGERS: readonly string[] = Object.freeze(["crossbars", "divided", "lanes", "level-links", "meet", "stubs", "weiszfeld", "zipper"]);

const FINDERS: readonly string[] = [...new Set([...Object.keys(highwayStrategies).filter((n) => !n.includes("+")), "shared-ways-all"])].sort((a, b) => b.length - a.length);

/** This function gives the name of a strategy without the prefix of a module, for example `spectral-c0.3` for `w3f:spectral-c0.3`. */
function localName(name: string): string {
  const colon = name.indexOf(":");
  const local = colon >= 0 ? name.slice(colon + 1) : name;
  // A wave can give its own variant a name with the wave, for example `w3f-nested-l1`.
  return local.replace(/^w\d[a-z]+-/, "");
}

/**
 * This function gives the built-in highway strategy of a name: the strategy itself, or the strategy of a variant, for example `power` for `power-near`.
 * It gives `undefined` for a gate (a name with `+`) and for a name of another step.
 */
export function finderOf(name: string): string | undefined {
  const local = localName(name);
  if (local.includes("+")) return undefined;
  return FINDERS.find((f) => local === f || local.startsWith(`${f}-`));
}

/**
 * This function gives the count of the own move of a highway strategy on its plan, for example `{ "move.powerEdge": 3 }`.
 * It gives `undefined` for a gate and for a strategy of `PLAN_CHANGERS`.
 */
export function planMoves(name: string, plan: HighwayPlan): Record<string, number> | undefined {
  const finder = finderOf(name);
  if (finder === undefined || PLAN_CHANGERS.includes(finder)) return undefined;
  return { [`move.${MOVE_NAMES[finder] ?? "highway"}`]: plan.highways.filter((h) => h.members.length >= 2).length };
}

/** A function that gives the own move counts of a strategy on a graph, or `undefined` for a strategy without a count. */
export type MoveCounter = (strategy: string, graph: Graph) => Readonly<Record<string, number>> | undefined;

/** This function gives a `MoveCounter` for highway strategies, by the names of the records. It makes the plan of the strategy again. */
export function highwayMoves(strategies: Readonly<Record<string, Strategy<"highway", object>>>): MoveCounter {
  return (name, graph) => {
    const s = strategies[name];
    return s === undefined ? undefined : planMoves(name, s.run({ graph }, s.defaults));
  };
}

/**
 * This function gives the base of a strategy for the fallback test: the strategy that it falls back to or extends.
 * - A gate `X+G` and a wrapped router `X+W` have the base `X`.
 * - A highway finder of a module (`hw:power`, `w3e:power-near`) has the base `hw:none`, the empty plan.
 * - A plan changer has the base of its plan `from`: `hw:shared-ways`, or `hw:corridors` and `hw:none` for a name that ends with `-corridors` and `-none`.
 * - An option of a router (`shared-cap-3`, `shared-all-p3`, `trunks-tree-bf02`, `corners-side`) has the base `shared`, `shared-all`, `trunks` or `corners`.
 * The function gives `undefined` when the base is not in `known`.
 */
export function activationBase(name: string, known: ReadonlySet<string>): string | undefined {
  const pick = (...names: string[]): string | undefined => names.find((n) => n !== name && known.has(n));
  const colon = name.indexOf(":");
  if (colon >= 0) {
    const prefix = name.slice(0, colon);
    const local = name.slice(colon + 1);
    if (local.includes("+")) {
      const inner = local.slice(0, local.lastIndexOf("+"));
      return pick(`${prefix}:${inner}`, `hw:${inner}`);
    }
    if (local === "none") return undefined;
    const finder = finderOf(name);
    if (finder !== undefined && PLAN_CHANGERS.includes(finder)) {
      const from = local.endsWith("-corridors") ? "corridors" : local.endsWith("-none") ? "none" : "shared-ways";
      return pick(`hw:${from}`);
    }
    return pick("hw:none");
  }
  if (name.includes("+")) return pick(name.slice(0, name.lastIndexOf("+")));
  for (const router of ["shared-all", "shared", "trunks", "corners"]) if (name.startsWith(`${router}-`)) return pick(router);
  return undefined;
}

/** The activation of one strategy over the decision inputs of a screen. */
export interface ActivationRow {
  readonly strategy: string;
  /** The base of the fallback test, or `undefined` when the strategy has none. */
  readonly base?: string;
  /** The decision inputs where the strategy ran. */
  readonly inputs: number;
  /** The decision inputs where a move count is above 0. */
  readonly moved: readonly string[];
  /** The decision inputs where the output differs from the output of the base. */
  readonly differs: readonly string[];
  /** The sum of each move count over the decision inputs. */
  readonly moves: Readonly<Record<string, number>>;
  readonly verdict: "exercised" | "not-exercised";
  /** The id of the output group of the strategy on the decision inputs. */
  readonly group: string;
}

/** The groups of the strategies with equal output on each input of one cell (a family of boards). They are diagnostics only. */
export interface CellGroups {
  readonly cell: string;
  readonly groups: readonly OutputGroup[];
}

/** The activation report of a screen. */
export interface ActivationReport {
  /** The decision inputs, in sorted order. */
  readonly inputs: readonly string[];
  readonly rows: readonly ActivationRow[];
  /** The output groups with more than one strategy: equal output hashes on each decision input. */
  readonly groups: readonly OutputGroup[];
  /** The cell groups with more than one strategy, for each family of the decision inputs. */
  readonly cells: readonly CellGroups[];
}

/** This function gives the family of an input id, for example `small-clustered` for `screen-v1/small-clustered/s0`. */
export function familyOf(input: string): string {
  const parts = input.split("/");
  return parts.length >= 3 ? parts[parts.length - 2]! : input;
}

/** This function gives the move counts of a record, from its trace. */
export function recordMoves(record: LayoutRecord): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of record.trace ?? []) for (const [k, v] of Object.entries(t.measures ?? {})) if (k.startsWith("move.")) out[k] = (out[k] ?? 0) + v;
  return out;
}

/**
 * This function gives the activation report of the records of a screen.
 * A strategy is exercised when a move count is above 0 on a decision input.
 * It is also exercised when its output differs from the output of its base on a decision input.
 * The decision inputs are the inputs of the families `families`, or each input. `bases` gives the base of each strategy, or `activationBase` gives it.
 */
export function activationReport(
  records: readonly LayoutRecord[],
  options: { readonly families?: readonly string[]; readonly bases?: Readonly<Record<string, string>> } = {},
): ActivationReport {
  const decision = records.filter((r) => options.families?.includes(familyOf(r.input)) ?? true);
  const inputs = [...new Set(decision.map((r) => r.input))].sort();
  const names = [...new Set(decision.map((r) => r.strategy))];
  const known = new Set(names);
  const at = new Map(decision.map((r) => [`${r.strategy}\u0000${r.input}`, r]));
  const hashOf = (strategy: string, input: string): string | undefined => {
    const r = at.get(`${strategy}\u0000${input}`);
    return r === undefined || r.skipped !== undefined ? undefined : r.outputHash;
  };
  const list = (strategy: string, of: readonly string[]): string[] => of.map((i) => hashOf(strategy, i) ?? "-");
  const all = outputGroups(Object.fromEntries(names.map((n) => [n, list(n, inputs)])));
  const groupOf = new Map(all.flatMap((g) => g.members.map((m) => [m, g.id] as const)));
  const rows = names.map((strategy): ActivationRow => {
    const base = options.bases?.[strategy] ?? activationBase(strategy, known);
    const moved: string[] = [];
    const differs: string[] = [];
    const moves: Record<string, number> = {};
    let ran = 0;
    for (const input of inputs) {
      const r = at.get(`${strategy}\u0000${input}`);
      if (r === undefined || r.skipped !== undefined) continue;
      ran++;
      const m = recordMoves(r);
      for (const [k, v] of Object.entries(m)) moves[k] = (moves[k] ?? 0) + v;
      if (exercised({ moves: m })) moved.push(input);
      const own = hashOf(strategy, input);
      const theirs = base === undefined ? undefined : hashOf(base, input);
      // A skipped run of the base has no hash. Then the input gives no evidence of a difference.
      if (own !== undefined && theirs !== undefined && exercised({ hashes: [own], baseHashes: [theirs] })) differs.push(input);
    }
    const verdict = moved.length > 0 || differs.length > 0 ? "exercised" : "not-exercised";
    return { strategy, ...(base === undefined ? {} : { base }), inputs: ran, moved, differs, moves, verdict, group: groupOf.get(strategy) ?? strategy };
  });
  const families = [...new Set(inputs.map(familyOf))].sort();
  const cells = families.map((cell) => {
    const of = inputs.filter((i) => familyOf(i) === cell);
    return { cell, groups: outputGroups(Object.fromEntries(names.map((n) => [n, list(n, of)]))).filter((g) => g.members.length > 1) };
  });
  return { inputs, rows, groups: all.filter((g) => g.members.length > 1), cells };
}

/** This function writes the activation report as Markdown: the strategies that are not exercised, and the output groups. */
export function formatActivation(report: ActivationReport, candidates?: ReadonlySet<string>): string {
  const rows = report.rows.filter((r) => candidates?.has(r.strategy) ?? true);
  const silent = rows.filter((r) => r.verdict === "not-exercised");
  const lines = [
    "## Activation",
    "",
    `${report.inputs.length} decision inputs, ${rows.length} strategies. A strategy is exercised when its own move count is above 0, or its output differs from the output of its base, on one decision input or more.`,
    "",
    `### Not exercised (${silent.length})`,
    "",
    "| strategy | base | runs | moves |",
    "|---|---|---:|---|",
    ...silent.map((r) => `| ${r.strategy} | ${r.base ?? "-"} | ${r.inputs} | ${Object.entries(r.moves).map(([k, v]) => `${k} ${v}`).join(", ") || "-"} |`),
    "",
    `### Output groups (${report.groups.length})`,
    "",
    "The strategies of a group have equal output on each decision input. A group counts as one candidate.",
    "",
    ...report.groups.map((g) => `- ${g.members.join(", ")}`),
    "",
    "### All strategies",
    "",
    "| strategy | base | runs | moved | differs | moves | verdict | group |",
    "|---|---|---:|---:|---:|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.strategy} | ${r.base ?? "-"} | ${r.inputs} | ${r.moved.length} | ${r.differs.length} | ${Object.entries(r.moves).map(([k, v]) => `${k} ${v}`).join(", ") || "-"} | ${r.verdict} | ${r.group} |`,
    ),
  ];
  return lines.join("\n") + "\n";
}
