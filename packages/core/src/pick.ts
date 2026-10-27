import type { Level } from "./model.ts";

/** This function gives the median width of the shown items of each level, in units of the plane. */
export function itemSizes(levels: readonly Level[]): number[] {
  return levels.map((level) => {
    const sizes = level.items.map((i) => Math.max(i.box.w, i.box.h)).sort((a, b) => a - b);
    return sizes.length ? sizes[Math.floor(sizes.length / 2)]! : 0;
  });
}

/** The far-view thresholds of `pickLevel`, in pixels on the screen. */
export interface PickOptions {
  /** When a node is at least this wide on the screen, the view shows each route. */
  readonly routesAt: number;
  /** A level is fine enough when its median item is at least this wide on the screen. */
  readonly itemAt: number;
}

/** The default thresholds: a node of 22 pixels shows its routes, and a group of 120 pixels shows its parts. */
export const PICK: PickOptions = Object.freeze({ routesAt: 22, itemAt: 120 });

/**
 * This function picks the level that a camera shows at a scale, in pixels for each unit of the plane. The sizes come from `itemSizes`.
 * The value `sizes.length` stands for the routes of each edge. The last level holds the nodes alone.
 * Each threshold that `options` does not give gets its value from `PICK`.
 */
export function pickLevel(sizes: readonly number[], scale: number, options: Partial<PickOptions> = PICK): number {
  const routesAt = options.routesAt ?? PICK.routesAt;
  const itemAt = options.itemAt ?? PICK.itemAt;
  const n = sizes.length;
  if (n === 0) return 0;
  if (sizes[n - 1]! * scale >= routesAt) return n;
  let pick = 0;
  for (let d = 0; d < n - 1; d++) if (sizes[d]! * scale >= itemAt) pick = d;
  return pick;
}
