/** One axis of a Pareto front: the key of a measure and the direction that is better. */
export interface Objective {
  readonly key: string;
  /** `min`: lower is better. `max`: higher is better. */
  readonly better: "min" | "max";
}

/** This function gives the value of a measure as a cost: lower is better. A value that is not a number is the worst cost. */
function cost(values: Readonly<Record<string, number>>, o: Objective): number {
  const v = values[o.key];
  if (v === undefined || Number.isNaN(v)) return Infinity;
  return o.better === "min" ? v : -v;
}

/**
 * This function tells if the values `a` dominate the values `b`: `a` is no worse on each objective and better on one objective.
 * A missing value or `NaN` is the worst value.
 */
export function dominates(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>, objectives: readonly Objective[]): boolean {
  let better = false;
  for (const o of objectives) {
    const ca = cost(a, o);
    const cb = cost(b, o);
    if (ca > cb) return false;
    if (ca < cb) better = true;
  }
  return better;
}

/**
 * This function gives the Pareto front of a list: the items that no other item dominates (MEAS0, "Pareto fronts").
 * The function `values` gives the measures of an item. The front keeps the order of the list. The cost is quadratic in the items.
 */
export function paretoFront<T>(items: readonly T[], values: (item: T) => Readonly<Record<string, number>>, objectives: readonly Objective[]): T[] {
  const v = items.map(values);
  return items.filter((_, i) => !v.some((w, j) => j !== i && dominates(w, v[i]!, objectives)));
}
