import type { HighwayInput, HighwayPlan } from "../model.ts";
import { densityPlan, KDEEB_DEFAULTS, type DensityKernel, type KdeebOptions } from "../kdeeb/index.ts";

/** The options of the highway strategy `cubu` (HWY-007 of the notes). */
export interface CubuOptions extends KdeebOptions {
  /** The way to compute the density: `separable` (CUBu) or `fft` (FFTEB). The default is `separable`. */
  readonly kernel: Exclude<DensityKernel, "direct">;
  /** The spacing of the sample points after each step, in units of the board. The value 0 keeps the points. The default is 8. */
  readonly resample: number;
}

/** The default options of the strategy `cubu`. */
export const CUBU_DEFAULTS: Readonly<Required<Omit<CubuOptions, "margin" | "k">>> = Object.freeze({
  ...KDEEB_DEFAULTS,
  kernel: "separable",
  resample: 8,
});

/**
 * This function gives the highways of the fast density bundling (HWY-007: CUBu of van der Zwan, Codreanu and Telea 2016, and FFTEB of Lhuillier, Hurter and Telea 2017).
 * The steps are those of `kdeeb`, with the mask of the boxes. The density comes from the counts of the cells, blurred by a separable kernel or by a Fourier transform.
 * The sample points of each edge are spaced again after each step.
 */
export function cubuPlan(input: HighwayInput, o: Readonly<CubuOptions>): HighwayPlan {
  return densityPlan(input, o, { kernel: o.kernel, resample: o.resample }, "cubu");
}
