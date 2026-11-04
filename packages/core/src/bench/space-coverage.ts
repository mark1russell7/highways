import { listStrategies, STEPS, type AnyStrategy, type Registry } from "../strategies/model.ts";
import { keyOfStrategy } from "../strategies/opt-in.ts";

/** The kinds of a dimension of the space: a strategy, an option of a strategy, or a dimension of an input family. */
export type SpaceKind = "strategy" | "option" | "input";

/** One dimension of the space. The `id` has the form `strategy:<key>`, `option:<key>.<name>` or `input:<family>.<dimension>`. */
export interface SpaceDimension {
  readonly id: string;
  readonly kind: SpaceKind;
}

/** The part of an input family that the space reads. */
export interface SpaceFamily {
  readonly name: string;
  readonly dimensions: readonly { readonly name: string }[];
}

/**
 * One fitted model of a measure over some dimensions of the space.
 * A fit counts only when `heldOutError` is finite and `sobol` has a finite index for each dimension of `dimensions`.
 */
export interface SpaceFit {
  /** The key of the measure in `MEASURES`. */
  readonly measure: string;
  readonly dimensions: readonly string[];
  /** The error of the model on the inputs that the fit did not read. */
  readonly heldOutError: number;
  /** The Sobol index of each dimension. */
  readonly sobol: Readonly<Record<string, number>>;
  /** The run of the record of the fit. */
  readonly run: string;
}

/** The result of `spaceCoverage`. A cell is one measure on one dimension. */
export interface SpaceCoverage {
  readonly measures: number;
  readonly strategies: number;
  readonly options: number;
  readonly inputs: number;
  readonly cells: number;
  /** The number of cells with a fit that counts. */
  readonly fitted: number;
  /** `fitted` divided by `cells`. */
  readonly value: number;
}

/** This function gives the dimensions of the space from the registries. A new strategy, option or family dimension adds to the list with no edit of this function. */
export function spaceDimensions(registry: Registry, families: readonly SpaceFamily[]): SpaceDimension[] {
  const out: SpaceDimension[] = [];
  for (const strategy of STEPS.flatMap((step) => listStrategies(registry, step) as readonly AnyStrategy[])) {
    const key = keyOfStrategy(strategy);
    out.push({ id: `strategy:${key}`, kind: "strategy" });
    for (const name of Object.keys(strategy.schema ?? {})) out.push({ id: `option:${key}.${name}`, kind: "option" });
  }
  for (const family of families) {
    for (const dimension of family.dimensions) out.push({ id: `input:${family.name}.${dimension.name}`, kind: "input" });
  }
  return out;
}

/** This function tells if a fit has a finite held-out error and a finite Sobol index for each of its dimensions. */
export function fitCounts(fit: SpaceFit): boolean {
  return Number.isFinite(fit.heldOutError) && fit.dimensions.length > 0 && fit.dimensions.every((d) => Number.isFinite(fit.sobol[d]));
}

/**
 * This function gives the share of the cells with a fit that counts. Each measure counts on each dimension.
 * The denominator is thus `measures` times the dimensions.
 * This product also counts cells where a measure does not change with a dimension. A later slice can remove these cells with a stated reason.
 * This function throws when a fit names a measure or a dimension that the space does not have. That fit is a fault of the record.
 */
export function spaceCoverage(measures: readonly string[], dimensions: readonly SpaceDimension[], fits: readonly SpaceFit[]): SpaceCoverage {
  const known = new Set(dimensions.map((d) => d.id));
  const named = new Set(measures);
  const covered = new Set<string>();
  for (const fit of fits) {
    if (!named.has(fit.measure)) throw new Error(`The fit of run ${fit.run} names the measure ${fit.measure}, and the space does not have it.`);
    for (const d of fit.dimensions) if (!known.has(d)) throw new Error(`The fit of run ${fit.run} names the dimension ${d}, and the space does not have it.`);
    if (fitCounts(fit)) for (const d of fit.dimensions) covered.add(`${fit.measure} ${d}`);
  }
  const count = (kind: SpaceKind): number => dimensions.filter((d) => d.kind === kind).length;
  const cells = measures.length * dimensions.length;
  return {
    measures: measures.length,
    strategies: count("strategy"),
    options: count("option"),
    inputs: count("input"),
    cells,
    fitted: covered.size,
    value: cells === 0 ? 0 : covered.size / cells,
  };
}
