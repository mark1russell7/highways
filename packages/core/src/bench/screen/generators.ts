import { createFamilyRegistry, RECT_SCATTERED } from "@mark1russell7/layout-contract";
import type { LayoutInput } from "./forms.ts";

/** This function gives a whole number from `lo` to `hi`, both included, from a generator of random numbers. It is the shared function of `@mark1russell7/layout-contract`. */
export { randomInt } from "@mark1russell7/layout-contract";

/** The parameters of the generator `rect-scattered`. */
export interface RectScatteredParams {
  /** The number of boxes. */
  readonly count: number;
}

/** The registry of the shared family `rect-scattered` (CORPUS-GEN). highways has no copy of its generator. */
const SHARED = createFamilyRegistry([RECT_SCATTERED]);

/**
 * This function makes the input of the shared generator `rect-scattered`, version 1: a fixed rectangle container, scattered obstacles and boxes without positions.
 * It uses the shared family `RECT_SCATTERED` of `@mark1russell7/layout-contract` (CORPUS-GEN). The repository `packing` makes the same file, byte for byte.
 *
 * @deprecated Use `RECT_SCATTERED` on a registry of `createFamilyRegistry`. This function stays for the callers of today.
 */
export function rectScattered(seed: number, params: RectScatteredParams, set = "xcheck-v1"): LayoutInput {
  return SHARED.generate("rect-scattered", seed, { count: params.count }, { set }) as unknown as LayoutInput;
}
