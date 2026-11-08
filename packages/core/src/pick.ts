import type { Level } from "./model.ts";

/** The side of an item box that `itemSizes` measures: the long side or the short side. */
export type ItemSide = "long" | "short";

/**
 * This function gives the median size of the shown items of each level, in units of the plane.
 * The size of an item is the long side of its box, or the short side with `side` set to `short`.
 * An even count takes the upper of the two middle values.
 */
export function itemSizes(levels: readonly Level[], side: ItemSide = "long"): number[] {
  const measure = side === "short" ? Math.min : Math.max;
  return levels.map((level) => {
    const sizes = level.items.map((i) => measure(i.box.w, i.box.h)).sort((a, b) => a - b);
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

/** The options of `pickLevelOf`: the thresholds of `pickLevel`, the side of the items, and the least count of items of a level. */
export interface LevelPickOptions extends PickOptions {
  /** The side of an item box that the median takes. The default is `long`. */
  readonly side: ItemSide;
  /**
   * The least count of items of a level that the pick shows. The search from fine to coarse stops at a level with fewer items.
   * When no level passes, the pick is the coarsest level with this count or more, else the routes.
   * With no value, the search does not stop, and the fallback is the root level, as in `pickLevel`.
   */
  readonly minItems?: number;
}

/**
 * This function picks the level that a camera shows at a scale, from the levels themselves.
 * Without `side` and `minItems`, it gives `pickLevel(itemSizes(levels), scale, options)`.
 * The value `levels.length` stands for the routes of each edge.
 *
 * One threshold for both values and a `minItems` of 2 give a rule with one threshold.
 * This rule shows the finest level with a median item at the threshold or more, and no level with 1 item.
 */
export function pickLevelOf(levels: readonly Level[], scale: number, options: Partial<LevelPickOptions> = {}): number {
  const sizes = itemSizes(levels, options.side ?? "long");
  const { minItems } = options;
  if (minItems === undefined) return pickLevel(sizes, scale, options);
  const routesAt = options.routesAt ?? PICK.routesAt;
  const itemAt = options.itemAt ?? PICK.itemAt;
  const n = levels.length;
  if (n === 0) return 0;
  if (sizes[n - 1]! * scale >= routesAt) return n;
  for (let d = n - 2; d >= 0; d--) {
    if (levels[d]!.items.length < minItems) break;
    if (sizes[d]! * scale >= itemAt) return d;
  }
  for (let d = 0; d < n - 1; d++) if (levels[d]!.items.length >= minItems) return d;
  return n;
}
