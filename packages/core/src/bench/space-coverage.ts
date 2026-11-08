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

/** The least count of held-out folds of a fit that counts. With 5 folds, a model with no skill beats the mean on each fold with a chance of 1/32. */
export const FIT_MIN_FOLDS = 5;

/**
 * The least mean held-out skill of a fit that counts. The skill of a fold is 1 minus the error of the model over the error of the mean.
 */
export const FIT_EFFECT_BAR = 0.05;

/**
 * One fitted model of a measure over some dimensions of the space.
 * The rule of `fitCounts` tells which fits count.
 */
export interface SpaceFit {
  /** The key of the measure in `MEASURES`. */
  readonly measure: string;
  /** The id of the measure in the record of the fit, when it is not the key. A ratio measure has the key of its raw measure. */
  readonly source?: string;
  readonly dimensions: readonly string[];
  /** The error of the model on the inputs that the fit did not read. */
  readonly heldOutError: number;
  /**
   * The held-out skill of each fold: 1 minus the mean absolute error of the model over that of the mean of the other folds.
   * A skill above 0 tells that the model beats the mean on the fold.
   */
  readonly foldSkill: readonly number[];
  /** The Sobol index of each dimension. */
  readonly sobol: Readonly<Record<string, number>>;
  /** The source of the fit: the run of its record, or the path of a committed record. */
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
  /** The number of fits that the rule examined. */
  readonly tested: number;
  /** The expected count of fits with no skill that pass the fold rule by chance. Each fit adds 1/2 to the power of its folds. */
  readonly expectedFalse: number;
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

/**
 * This function tells if a fit counts. A fit counts when each of these rules holds:
 * - It has a finite held-out error, and `FIT_MIN_FOLDS` folds or more.
 * - Its model beats the mean on each fold, and its mean skill is `FIT_EFFECT_BAR` or more.
 * - It has one dimension or more, and a finite Sobol index for each.
 */
export function fitCounts(fit: SpaceFit): boolean {
  const folds = fit.foldSkill;
  const mean = folds.reduce((sum, x) => sum + x, 0) / Math.max(1, folds.length);
  return (
    Number.isFinite(fit.heldOutError) &&
    folds.length >= FIT_MIN_FOLDS &&
    folds.every((x) => Number.isFinite(x) && x > 0) &&
    mean >= FIT_EFFECT_BAR &&
    fit.dimensions.length > 0 &&
    fit.dimensions.every((d) => Number.isFinite(fit.sobol[d]))
  );
}

/**
 * This function gives the share of the cells with a fit that counts. Each measure counts on each dimension.
 * The denominator is thus `measures` times the dimensions.
 *
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
    tested: fits.length,
    expectedFalse: fits.reduce((sum, f) => sum + 0.5 ** f.foldSkill.length, 0),
    value: cells === 0 ? 0 : covered.size / cells,
  };
}
