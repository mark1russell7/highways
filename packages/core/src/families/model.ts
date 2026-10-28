// The form of the corpus families of highways (CORPUS-GEN) on the shared registry of `@mark1russell7/layout-contract` (L45).
import type { CorpusDimension, CorpusFamily, DimensionValues, ParamValue } from "@mark1russell7/layout-contract";
import type { LayoutGenerator } from "../bench/screen/forms.ts";
import type { Graph } from "../model.ts";

/**
 * The output of a family of highways: the graph of the board and its generator record.
 * A screen set puts the board into an input file with `graphInput`. The set gives the id, the member seed and the cell.
 */
export interface HighwaysBoard {
  readonly graph: Graph;
  /** The generator of the board: its name, its version, its parameters and its input seed. */
  readonly generator: LayoutGenerator;
}

/** A corpus family of highways: a family of the shared registry whose output is a `HighwaysBoard`. */
export type HighwaysFamily = CorpusFamily<HighwaysBoard>;

/** The engine of each dimension of the families of highways. */
export const HIGHWAYS_ENGINE = "highways";

/** The fields of a numeric dimension of `numberDimension`. */
interface NumberFields {
  readonly name: string;
  readonly kind: "int" | "real";
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly scale?: "linear" | "log";
  readonly meaning: string;
}

/** This function gives an `int` or a `real` dimension that only highways reads. */
export function numberDimension(fields: NumberFields): CorpusDimension {
  return Object.freeze({ ...fields, scale: fields.scale ?? "linear", engines: Object.freeze([HIGHWAYS_ENGINE]) });
}

/** This function gives an `enum` dimension that only highways reads. */
export function enumDimension(name: string, values: readonly string[], value: string, meaning: string): CorpusDimension {
  return Object.freeze({ name, kind: "enum", values: Object.freeze([...values]), default: value, meaning, engines: Object.freeze([HIGHWAYS_ENGINE]) });
}

/** This function gives the values of the dimensions that differ from their defaults, in the order of the dimensions. */
export function changedDimensions(dimensions: readonly CorpusDimension[], dims: DimensionValues): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const d of dimensions) if (!Object.is(dims[d.name], d.default)) out[d.name] = dims[d.name]!;
  return out;
}

/** This function gives the value of a numeric dimension. It throws a `RangeError` when the value is not a number. */
export function numberOf(dims: DimensionValues, name: string): number {
  const v = dims[name];
  if (typeof v !== "number") throw new RangeError(`The dimension "${name}" is ${String(v)}, not a number.`);
  return v;
}
