// The named comparators of the core (LANE-ORDER). `comparators.test.ts` checks that each one is a total order.
// The package index does not export this module.

/** This function compares two texts by their UTF-16 code units. It gives 0 only for equal texts. */
export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** An edge id with its hash. */
export interface Hashed {
  readonly h: number;
  readonly e: { readonly id: string };
}

/** This function compares two edges by the hash of their ids, and then by their ids. Thus the order of two edges does not depend on the input. */
export function byHash(a: Hashed, b: Hashed): number {
  if (a.h !== b.h) return a.h - b.h;
  return byText(a.e.id, b.e.id);
}
