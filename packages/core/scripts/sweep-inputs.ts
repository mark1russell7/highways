// The drawn inputs of a sweep (SPACE-INPUTS). This file reads no file, so its test gives it a registry.
// A screen set has one value of each dimension of a family, so a fit cannot tell the effect of a dimension of the input.
// A draw gives each input its own values of the number dimensions of its family. The record keeps the values, so a model can explain a raw measure.
import { dimensionAt, type CorpusDimension, type FamilyRegistry, type SupportedValues } from "@mark1russell7/layout-contract";
import { deriveSeed, random } from "@mark1russell7/rigor-generators";
import type { ResponseDimension } from "@mark1russell7/rigor-statistics";
import { graphInput, type LayoutInput } from "../src/bench/screen/index.ts";
import { inputDimensionId } from "../src/bench/space-coverage.ts";
import type { HighwaysBoard } from "../src/families/index.ts";

/** The set of a drawn input. Its id is `drawn/<family>/d<k>`. */
export const DRAWN_SET = "drawn";

/** The categorical dimension of a sweep record with the family of each input. Each input dimension has a `when` on it. */
export const FAMILY_DIMENSION = "family";

/** The count of decimal places of a drawn `real` value. The generator gets the rounded value, so the record and the board agree. */
export const DRAW_DECIMALS = 4;

/** One drawn input, with its family and the drawn value of each number dimension by its id in the space. */
export interface DrawnInput {
  readonly input: LayoutInput;
  readonly family: string;
  readonly values: Readonly<Record<string, number>>;
}

/** This function gives the range form of a `supported` field, or `undefined` for a list or for no field. */
function supportedRange(supported: SupportedValues | undefined): { readonly min?: number; readonly max?: number } | undefined {
  return supported === undefined || Array.isArray(supported) ? undefined : (supported as { readonly min?: number; readonly max?: number });
}

/**
 * This function gives the range that the draw takes for a number dimension: its range, inside its supported range.
 * It gives `undefined` for a dimension that is not `int` or `real`, a dimension with a `when`, and a range of one value.
 * A dimension with a `when` is active only for some values of another dimension, so the draw keeps its default.
 */
export function drawRange(d: CorpusDimension): readonly [number, number] | undefined {
  if ((d.kind !== "int" && d.kind !== "real") || d.when !== undefined || d.min === undefined || d.max === undefined) return undefined;
  const s = supportedRange(d.supported);
  const lo = Math.max(d.min, s?.min ?? d.min);
  const hi = Math.min(d.max, s?.max ?? d.max);
  return hi > lo ? [lo, hi] : undefined;
}

/** This function gives the number dimensions of a family that the draw changes, each with its range. */
export function drawnDimensions(dimensions: readonly CorpusDimension[]): { readonly dimension: CorpusDimension; readonly range: readonly [number, number] }[] {
  return dimensions.flatMap((dimension) => {
    const range = drawRange(dimension);
    return range === undefined ? [] : [{ dimension, range }];
  });
}

/**
 * This function draws `perFamily` inputs of each family in `families`. The member `k` has the input seed `deriveSeed(seed, "<family>/<k>")`.
 * Each number dimension gets a uniform fraction of its range from its own stream, on the scale of the dimension (`dimensionAt`).
 * The stream of a dimension has its name, so a new dimension of a family does not change the values of the others.
 * The other dimensions keep their defaults.
 */
export function drawInputs(registry: FamilyRegistry<HighwaysBoard>, families: readonly string[], perFamily: number, seed: number): DrawnInput[] {
  if (!Number.isInteger(perFamily) || perFamily < 1) throw new Error(`The count of drawn inputs of each family is not a whole number of 1 or more: ${perFamily}.`);
  const out: DrawnInput[] = [];
  for (const family of families) {
    const drawn = drawnDimensions(registry.family(family).dimensions);
    for (let k = 0; k < perFamily; k++) {
      const inputSeed = deriveSeed(seed, `${family}/${k}`);
      const streams = random(inputSeed).fork("dimensions");
      const dims: Record<string, number> = {};
      const values: Record<string, number> = {};
      for (const { dimension, range } of drawn) {
        const raw = dimensionAt({ ...dimension, min: range[0], max: range[1] }, streams.fork(dimension.name).next());
        const value = dimension.kind === "int" ? raw : Number(raw.toFixed(DRAW_DECIMALS));
        dims[dimension.name] = value;
        values[inputDimensionId(family, dimension.name)] = value;
      }
      const board = registry.generate(family, inputSeed, dims);
      const input = graphInput(board.graph, { id: `${DRAWN_SET}/${family}/d${k}`, set: DRAWN_SET, family, seed: inputSeed, generator: board.generator });
      out.push({ input, family, values });
    }
  }
  return out;
}

/**
 * This function gives the dimensions of a sweep record for the drawn inputs: the categorical dimension `family`, then each drawn dimension of each family.
 * An input dimension has a `when` on `family`, so it applies only to the inputs of its family.
 * A log scale needs a range above 0, so a dimension with a range from 0 or less gets no log scale in the record.
 */
export function inputDimensions(registry: FamilyRegistry<HighwaysBoard>, families: readonly string[]): ResponseDimension[] {
  return [
    { id: FAMILY_DIMENSION, label: "Family", unit: "", kind: "categorical", levels: [...families] },
    ...families.flatMap((family) =>
      drawnDimensions(registry.family(family).dimensions).map(
        ({ dimension, range }): ResponseDimension => ({
          id: inputDimensionId(family, dimension.name),
          label: `${dimension.name} (${family})`,
          unit: "",
          kind: "continuous",
          range: [range[0], range[1]],
          ...(dimension.scale === "log" && range[0] > 0 ? { log: true } : {}),
          when: { dimension: FAMILY_DIMENSION, levels: [family] },
        }),
      ),
    ),
  ];
}
