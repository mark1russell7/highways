// The normal form of the output of a router (ENTRY-FINGERPRINT). The screen hashes it with the grid `RECORD_EPS` (`resultHash`),
// and the fingerprint of an entry hashes it with exact numbers. This file is the one home of the form.
import type { Result } from "../model.ts";

/** This function gives a copy of a list in the order of the edge ids. The order of two ids is the order of their UTF-16 code units. */
export function sortByEdge<T extends { readonly edge: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));
}

/**
 * This function gives the highways form of a result of a router: the value that `resultHash` and the fingerprint hash.
 * The form holds the routes in the order of the edge ids, and the levels, the bundles and the runs as the router gives them.
 */
export function resultForm(result: Result): object {
  return { routes: sortByEdge(result.routes), levels: result.levels, bundles: result.bundles, runs: result.runs };
}
