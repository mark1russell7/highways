import type { LayoutInput, LayoutObstacle } from "./forms.ts";
import { documentHash, mulberry32, stepSeed } from "./hash.ts";

/** This function gives a whole number from `lo` to `hi`, both included, from a generator of random numbers. */
export function randomInt(r: () => number, lo: number, hi: number): number {
  return lo + Math.floor(r() * (hi - lo + 1));
}

/** The parameters of the generator `rect-scattered`. */
export interface RectScatteredParams {
  /** The number of boxes. */
  readonly count: number;
}

/**
 * This function makes the input of the shared generator `rect-scattered`, version 1: a fixed rectangle container, scattered obstacles and boxes without positions.
 * The repository `packing` makes the same file, byte for byte. A test in each repository pins the hashes of the seeds 1, 2 and 3.
 * The steps are `container`, `obstacles` and `boxes`. Each step has its own generator from `stepSeed`.
 */
export function rectScattered(seed: number, params: RectScatteredParams, set = "xcheck-v1"): LayoutInput {
  let r = mulberry32(stepSeed(seed, "container"));
  const w = randomInt(r, 600, 1000);
  const h = randomInt(r, 400, 800);
  r = mulberry32(stepSeed(seed, "obstacles"));
  const n = randomInt(r, 3, 8);
  const obstacles: LayoutObstacle[] = [];
  for (let i = 0; i < n; i++) {
    const ow = randomInt(r, 40, 160);
    const oh = randomInt(r, 40, 160);
    const x = randomInt(r, 0, w - ow);
    const y = randomInt(r, 0, h - oh);
    obstacles.push({ id: `o${i}`, region: { kind: "rect", x, y, w: ow, h: oh } });
  }
  r = mulberry32(stepSeed(seed, "boxes"));
  const boxes = Array.from({ length: params.count }, (_, i) => {
    const bw = randomInt(r, 20, 120);
    const bh = randomInt(r, 20, 80);
    return { id: `b${i}`, w: bw, h: bh };
  });
  const body = {
    schema: "layout-input/1" as const,
    id: `${set}/rect-scattered/s${seed}`,
    set,
    family: "rect-scattered",
    seed,
    source: "made-up" as const,
    generator: { name: "rect-scattered", version: 1, params: { count: params.count }, seed },
    container: { w, h, fixed: "size" as const },
    obstacles,
    boxes,
    edges: [],
  };
  return { ...body, hash: documentHash(body) };
}
