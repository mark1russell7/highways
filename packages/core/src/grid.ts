import type { Box } from "./geom.ts";

/**
 * A uniform grid of buckets over the plane. Each item goes into each bucket that its bounding box touches.
 * A query gives each item whose bucket the query box touches, one time each.
 */
export class Grid<T> {
  readonly #cell: number;
  readonly #buckets = new Map<number, T[]>();
  readonly #seen = new Map<T, number>();
  #stamp = 0;

  /** This constructor makes an empty grid with square buckets of side `cell`. */
  constructor(cell: number) {
    this.#cell = Math.max(1e-9, cell);
  }

  #key(i: number, j: number): number {
    // The key packs the two bucket indices into one number. Each index stays within ±2^20.
    return (i + 1_048_576) * 2_097_152 + (j + 1_048_576);
  }

  #range(b: Box): [number, number, number, number] {
    const c = this.#cell;
    return [Math.floor(b.x / c), Math.floor(b.y / c), Math.floor((b.x + b.w) / c), Math.floor((b.y + b.h) / c)];
  }

  /** This method adds an item with its bounding box. */
  add(item: T, b: Box): void {
    const [i0, j0, i1, j1] = this.#range(b);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = this.#key(i, j);
        const list = this.#buckets.get(k);
        if (list) list.push(item);
        else this.#buckets.set(k, [item]);
      }
  }

  /** This method gives each item whose buckets touch the box to `visit`, one time each. */
  query(b: Box, visit: (item: T) => void): void {
    const stamp = ++this.#stamp;
    const [i0, j0, i1, j1] = this.#range(b);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const list = this.#buckets.get(this.#key(i, j));
        if (!list) continue;
        for (const item of list) {
          if (this.#seen.get(item) === stamp) continue;
          this.#seen.set(item, stamp);
          visit(item);
        }
      }
  }
}

/** This function gives the bounding box of the segment `ab`. */
export function segmentBounds(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
