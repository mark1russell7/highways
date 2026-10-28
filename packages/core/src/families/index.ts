// The corpus families of highways on the shared registry of `@mark1russell7/layout-contract` (CORPUS-GEN, L45).
import { createFamilyRegistry, type FamilyRegistry } from "@mark1russell7/layout-contract";
import { HUB_CHAIN, MANY_GROUPS, PACKED_GRID } from "./cases.ts";
import { DENSE_GROUPS, SMALL_CLUSTERED, TINY_UNIFORM } from "./fixtures.ts";
import type { HighwaysBoard, HighwaysFamily } from "./model.ts";

export * from "./model.ts";
export { DENSE_GROUPS, FIXTURE_LAYOUTS, FIXTURE_LOCALITY, fixtureParams, fixtureSpecOf, SMALL_CLUSTERED, TINY_UNIFORM } from "./fixtures.ts";
export { HUB_CHAIN, MANY_GROUPS, PACKED_GRID } from "./cases.ts";
// The parts of the shared registry that a host of the families uses. The site imports only `@mark1russell7/highways`.
export {
  createFamilyRegistry,
  DEFAULT_RNG,
  dimensionAt,
  dimensionUnit,
  familyKind,
  levelsOf,
  paramProblem,
  type CorpusDimension,
  type CorpusFamily,
  type DimensionValues,
  type FamilyRegistry,
  type GenerateContext,
  type ParamValue,
} from "@mark1russell7/layout-contract";

/**
 * The corpus families of highways, in the order of the screen sets. Each family at its defaults makes the board of its screen family.
 * An import registers nothing. A host makes a registry with `createFamilyRegistry(HIGHWAYS_FAMILIES)`, or with the lists of other engines too.
 */
export const HIGHWAYS_FAMILIES: readonly HighwaysFamily[] = Object.freeze([TINY_UNIFORM, SMALL_CLUSTERED, DENSE_GROUPS, HUB_CHAIN, MANY_GROUPS, PACKED_GRID]);

/** This function gives a new registry of `HIGHWAYS_FAMILIES`. */
export function highwaysRegistry(): FamilyRegistry<HighwaysBoard> {
  return createFamilyRegistry(HIGHWAYS_FAMILIES);
}
