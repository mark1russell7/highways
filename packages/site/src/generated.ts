// The generated boards of the site (CORPUS-GEN): a family of `HIGHWAYS_FAMILIES`, a seed and the dimensions away from their defaults.
// This module has no DOM, so the tests and the workers use it. `gen-controls.ts` builds the controls from it.
import {
  dimensionAt,
  dimensionUnit,
  HIGHWAYS_FAMILIES,
  highwaysRegistry,
  paramProblem,
  type CorpusDimension,
  type Graph,
  type HighwaysFamily,
  type ParamValue,
} from "@mark1russell7/highways";

/** The registry of the site. The screen sets of the core make their boards with the same families. */
export const GEN_REGISTRY = highwaysRegistry();

/** The families that the site generates: each family of `HIGHWAYS_FAMILIES`, in its order. */
export const GEN_FAMILIES: readonly HighwaysFamily[] = HIGHWAYS_FAMILIES;

/** A generated board: the name of its family, its seed, and the values of the dimensions that differ from their defaults. */
export interface GenSpec {
  readonly family: string;
  readonly seed: number;
  readonly dims: Readonly<Record<string, ParamValue>>;
}

/** The largest seed of the field and of "New seed": the largest unsigned number of 32 bits. */
export const MAX_SEED = 4294967295;

/** The first generated board of a page: the first family at its defaults, with the seed 1. */
export const START_GEN: GenSpec = { family: GEN_FAMILIES[0]!.name, seed: 1, dims: {} };

/** The keys of a URL hash that a generated board uses, other than its dimensions. */
export const GEN_KEYS = ["family", "seed"] as const;

/** This function gives a family by name, or `undefined`. */
export const genFamily = (name: string): HighwaysFamily | undefined => GEN_FAMILIES.find((f) => f.name === name);

/** This function reads the text of a value of a dimension. It gives `undefined` for a value that the dimension does not take. */
export function readDimension(dim: CorpusDimension, text: string): ParamValue | undefined {
  let v: ParamValue;
  if (dim.kind === "enum") v = text;
  else if (dim.kind === "bool") {
    if (text !== "true" && text !== "false") return undefined;
    v = text === "true";
  } else {
    if (text.trim() === "") return undefined;
    v = Number(text);
  }
  return paramProblem(dim, v) === undefined ? v : undefined;
}

/** This function gives the spec with only the dimensions that differ from their defaults, and with a whole seed in range. */
export function cleanGen(spec: GenSpec): GenSpec {
  const family = genFamily(spec.family) ?? GEN_FAMILIES[0]!;
  const dims: Record<string, ParamValue> = {};
  for (const d of family.dimensions) {
    const v = spec.dims[d.name];
    if (v !== undefined && paramProblem(d, v) === undefined && v !== d.default) dims[d.name] = v;
  }
  const seed = Number.isInteger(spec.seed) && spec.seed >= 0 && spec.seed <= MAX_SEED ? spec.seed : START_GEN.seed;
  return { family: family.name, seed, dims };
}

/**
 * This function reads a generated board from the keys of a URL hash: `family`, `seed` and one key for each dimension.
 * It gives `undefined` when the hash has no known `family`. A bad value of a dimension gets the default.
 */
export function readGen(params: URLSearchParams): GenSpec | undefined {
  const family = genFamily(params.get("family") ?? "");
  if (!family) return undefined;
  const dims: Record<string, ParamValue> = {};
  for (const d of family.dimensions) {
    const text = params.get(d.name);
    const v = text === null ? undefined : readDimension(d, text);
    if (v !== undefined) dims[d.name] = v;
  }
  const seedText = params.get("seed");
  return cleanGen({ family: family.name, seed: seedText === null ? START_GEN.seed : Number(seedText), dims });
}

/** This function writes the keys of a generated board into URL parameters: `family`, `seed`, then each dimension away from its default. */
export function writeGen(spec: GenSpec, params: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const clean = cleanGen(spec);
  params.set("family", clean.family);
  params.set("seed", String(clean.seed));
  for (const [k, v] of Object.entries(clean.dims)) params.set(k, String(v));
  return params;
}

/** This function gives the graph of a generated board, from the registry. */
export function genGraph(spec: GenSpec): Graph {
  return GEN_REGISTRY.generate(spec.family, spec.seed, cleanGen(spec).dims).graph;
}

/** This function gives the full value of each dimension of a generated board: its own value, or the default. */
export function genValues(spec: GenSpec): Readonly<Record<string, ParamValue>> {
  return GEN_REGISTRY.resolve(spec.family, cleanGen(spec).dims);
}

/** A control of a dimension: a slider for a number, a select for an `enum` and a check box for a `bool`. */
export type GenControl =
  | { readonly kind: "slider"; readonly dim: CorpusDimension; readonly steps: number }
  | { readonly kind: "select"; readonly dim: CorpusDimension; readonly values: readonly string[] }
  | { readonly kind: "check"; readonly dim: CorpusDimension };

/** The number of steps of the slider of a dimension with a log scale. */
const LOG_STEPS = 1000;

/**
 * This function gives the steps of the slider of a numeric dimension. An `int` with a linear scale has one step for each whole number.
 * A `real` has steps of a power of 10, approximately one hundredth of its range. A log scale has `LOG_STEPS` steps.
 */
export function sliderSteps(dim: CorpusDimension): number {
  const span = (dim.max ?? 0) - (dim.min ?? 0);
  if (dim.scale === "log") return LOG_STEPS;
  if (dim.kind === "int") return Math.max(1, Math.round(span));
  return Math.max(1, Math.round(span / 10 ** Math.floor(Math.log10(span / 100))));
}

/** This function gives the value of a dimension at the step `i` of its slider. A real value keeps 6 significant digits. */
export function sliderValue(dim: CorpusDimension, i: number): number {
  const v = dimensionAt(dim, i / sliderSteps(dim));
  return dim.kind === "int" ? v : Number(v.toPrecision(6));
}

/** This function gives the step of the slider of a dimension nearest to a value. */
export function sliderIndex(dim: CorpusDimension, value: number): number {
  return Math.round(dimensionUnit(dim, value) * sliderSteps(dim));
}

/** This function gives the controls of a family: one for each dimension, in the order of its `dimensions`. */
export function genControls(family: HighwaysFamily): GenControl[] {
  return family.dimensions.map((dim): GenControl => {
    if (dim.kind === "enum") return { kind: "select", dim, values: (dim.values ?? []).map(String) };
    if (dim.kind === "bool") return { kind: "check", dim };
    return { kind: "slider", dim, steps: sliderSteps(dim) };
  });
}

/** This function gives a new random seed from a source of random numbers in [0, 1). */
export function newSeed(random: () => number = Math.random): number {
  return Math.floor(random() * (MAX_SEED + 1));
}

/** A named example: a generated board with a name. A click on it sets the controls. */
export interface NamedGen {
  readonly id: string;
  readonly name: string;
  readonly spec: GenSpec;
}

/**
 * The named examples of the generator: the board of each family in the benchmark, then some boards away from the defaults.
 * The base seeds are the seeds of the screen sets, so the first boards are the screen boards of the member 0.
 */
export const NAMED_GENS: readonly NamedGen[] = [
  { id: "tiny", name: "Tiny board", spec: { family: "tiny-uniform", seed: 1, dims: {} } },
  { id: "clusters", name: "Clusters with fixed plugs", spec: { family: "small-clustered", seed: 2, dims: {} } },
  { id: "dense", name: "Dense groups", spec: { family: "dense-groups", seed: 3, dims: {} } },
  { id: "hubs", name: "A chain of hubs", spec: { family: "hub-chain", seed: 3, dims: {} } },
  { id: "groups", name: "Many groups", spec: { family: "many-groups", seed: 7, dims: {} } },
  { id: "packed", name: "A packed grid", spec: { family: "packed-grid", seed: 11, dims: {} } },
  { id: "large-grid", name: "A large grid of nodes", spec: { family: "tiny-uniform", seed: 5, dims: { layout: "grid", nodes: 200, edgesPerNode: 2 } } },
  { id: "hub-nodes", name: "Hub nodes with many edges", spec: { family: "small-clustered", seed: 9, dims: { layout: "hubs", nodes: 120, fixedPorts: 0 } } },
  { id: "far-links", name: "Long links between far rows", spec: { family: "hub-chain", seed: 12, dims: { rows: 6, cols: 24, long: 120 } } },
];
