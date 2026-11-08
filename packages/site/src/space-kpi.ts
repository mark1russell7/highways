// The measures of the layout space program in `kpi.json`: the operators of each step, the strategies of the grammar, the screened
// and measured strategies, the input families and the fitted share (SPACE-KPI). Each value comes from the registry or from a committed record.
// This module reads no file. The module `kpi-files.ts` gives it the facts.
import type { SiteMeasure } from "./kpi.ts";

/** The record of the count of the grammar, relative to the root of the repository. The script `space-size.ts` of the core writes it. */
export const SPACE_SIZE_FILE = "docs/research/space-size/record.json";

/** The form of a time in UTC that `kpi.json` takes, with or without seconds. */
const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/;

/** The least count of operators of a step that the measure `steps-with-20-operators` counts. */
export const STEP_OPERATOR_BAR = 20;

/** This function counts the operators of each step: the built-in strategies of the registry, by their step. */
export function operatorsByStep(strategies: readonly { readonly step: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of strategies) out[s.step] = (out[s.step] ?? 0) + 1;
  return out;
}

/**
 * This function gives the distinct strategies of the rows of the verdict snapshots, in the form `step/strategy`.
 * A snapshot with no step, or a row with no strategy name, gives no strategy. With `sets`, it reads only the snapshots of those sets.
 */
export function screenedStrategies(snapshots: readonly unknown[], sets?: readonly string[]): string[] {
  const out = new Set<string>();
  for (const s of snapshots) {
    if (typeof s !== "object" || s === null) continue;
    const { step, rows, set } = s as { readonly step?: unknown; readonly rows?: unknown; readonly set?: unknown };
    if (typeof step !== "string" || !Array.isArray(rows)) continue;
    if (sets !== undefined && (typeof set !== "string" || !sets.includes(set))) continue;
    for (const r of rows as unknown[]) {
      const name = typeof r === "object" && r !== null ? (r as { readonly strategy?: unknown }).strategy : undefined;
      if (typeof name === "string" && name !== "") out.add(`${step}/${name}`);
    }
  }
  return [...out].sort();
}

/**
 * This function gives the screen sets of the full corpus: each set with a family of each name of `families`.
 * A set of the full corpus measures a strategy on each input family of the corpus.
 */
export function fullCorpusSets(sets: readonly { readonly id: string; readonly families: readonly { readonly name: string }[] }[], families: readonly { readonly name: string }[]): string[] {
  return sets.filter((set) => families.every((f) => set.families.some((m) => m.name === f.name))).map((set) => set.id).sort();
}

/** The count of the grammar from its record. */
export interface GrammarCount {
  readonly points: number;
  readonly levels: number;
  readonly date: string;
}

/**
 * This function gives the count and the date of the record of the count of the grammar, in the form `space-size/1`.
 * It gives `undefined` for a value that is not such a record, or for a date that is not a time in UTC. Then the file has no measure of the grammar.
 */
export function spaceSizeOf(record: unknown): GrammarCount | undefined {
  if (typeof record !== "object" || record === null) return undefined;
  const { schema, base, levels, date } = record as { readonly schema?: unknown; readonly base?: unknown; readonly levels?: unknown; readonly date?: unknown };
  if (schema !== "space-size/1" || typeof base !== "string" || !/^\d+$/.test(base) || typeof levels !== "number" || typeof date !== "string" || !UTC_TIME.test(date)) return undefined;
  return { points: Number(base), levels, date };
}

/** The facts of the layout space measures. */
export interface SpaceFacts {
  /** The operators of each step, from `operatorsByStep`. */
  readonly operators: Readonly<Record<string, number>>;
  /** The count of the grammar, from `spaceSizeOf`. Without it, the file has no measure `grammar-strategies`. */
  readonly grammar?: GrammarCount;
  /** The distinct strategies of the verdict snapshots, from `screenedStrategies`. */
  readonly screened: number;
  /** The distinct strategies of the snapshots of the sets of the full corpus, from `screenedStrategies` and `fullCorpusSets`. */
  readonly measuredFull: number;
  /** The count of the input families of the corpus. */
  readonly inputFamilies: number;
  /** The percent of the cells of the space with a fitted model, from the record `space-coverage/1`. */
  readonly fittedShare: number;
}

/** The things that each layout space measure does not count, by its id. */
export const SPACE_NOT_COUNTED = {
  operators: "A param value, a preset and a variant of an operator. The registry gives each operator once, with its step.",
  variants: "Each variant. A variant counts only after a test shows that its routes differ from each operator of its step on a board. That test is not built.",
  grammar: "A combinator of two or more strategies, because the space has none. Each numeric param has a few levels, so most configs differ only in a param value.",
  screened: "A strategy that a screen ran with no committed verdict snapshot.",
  measuredFull: "A strategy of a screen set without each family of the corpus. The benchmark has 12 fixtures and not the families, so it does not count.",
  families: "A generator outside the corpus registry of the core.",
  fitted: "A fit that does not beat the mean on each held-out input, or has a mean skill below 0.05. A cell is one measure on one dimension.",
  views: "The cards and the pages, because each card shows one strategy. This measure counts each view of a measure over a dimension of the whole space.",
  solved: "Each part of the space, because no part has a verdict that a solver proves.",
} as const;

/**
 * This function gives the layout space measures of `kpi.json`, in a fixed order.
 * The measures of the variants, the views and the solved share read 0 until their tools exist, and each says so.
 *
 * @param facts - The facts of the registry and of the committed records.
 * @param at - The time of the data of the registry: the date of the commit of the build.
 */
export function spaceMeasures(facts: SpaceFacts, at?: string): SiteMeasure[] {
  const dated = at === undefined ? {} : { at };
  const steps = Object.keys(facts.operators).sort();
  const total = steps.reduce((sum, s) => sum + facts.operators[s]!, 0);
  return [
    { id: "operators", value: total, unit: "operators", notCounted: SPACE_NOT_COUNTED.operators, ...dated },
    ...steps.map((s) => ({ id: `operators-${s}`, value: facts.operators[s]!, unit: "operators", notCounted: SPACE_NOT_COUNTED.operators, ...dated })),
    { id: "steps-with-20-operators", value: steps.filter((s) => facts.operators[s]! >= STEP_OPERATOR_BAR).length, unit: "steps", ...dated },
    { id: "distinct-variants", value: 0, unit: "variants", notCounted: SPACE_NOT_COUNTED.variants, ...dated },
    // The count of the grammar has the date of its record, because a script writes it and not the build.
    ...(facts.grammar === undefined ? [] : [{ id: "grammar-strategies", value: facts.grammar.points, unit: "configs", notCounted: SPACE_NOT_COUNTED.grammar, at: facts.grammar.date }]),
    { id: "strategies-screened", value: facts.screened, unit: "strategies", notCounted: SPACE_NOT_COUNTED.screened, ...dated },
    { id: "strategies-measured-full", value: facts.measuredFull, unit: "strategies", notCounted: SPACE_NOT_COUNTED.measuredFull, ...dated },
    { id: "input-families", value: facts.inputFamilies, unit: "families", notCounted: SPACE_NOT_COUNTED.families, ...dated },
    { id: "fitted-share", value: facts.fittedShare, unit: "%", notCounted: SPACE_NOT_COUNTED.fitted, ...dated },
    { id: "views-generated", value: 0, unit: "views", notCounted: SPACE_NOT_COUNTED.views, ...dated },
    { id: "solved-share", value: 0, unit: "%", notCounted: SPACE_NOT_COUNTED.solved, ...dated },
  ];
}
