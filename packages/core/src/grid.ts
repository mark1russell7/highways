import type { Box, Point } from "./geom.ts";

/**
 * A uniform grid of buckets over the plane. A box item goes into each bucket that the box touches.
 * A segment item goes only into the buckets along the segment, so a long diagonal segment stays cheap.
 * A query gives each item in the buckets that it touches, one time each.
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

  #box(b: Box, visit: (key: number) => void): void {
    const c = this.#cell;
    const i1 = Math.floor((b.x + b.w) / c);
    const j1 = Math.floor((b.y + b.h) / c);
    for (let i = Math.floor(b.x / c); i <= i1; i++) for (let j = Math.floor(b.y / c); j <= j1; j++) visit(this.#key(i, j));
  }

  // The buckets along a segment, widened by `margin`: the boxes of steps of at most half a bucket.
  #segment(a: Point, b: Point, margin: number, visit: (key: number) => void): void {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (this.#cell / 2)));
    const keys = new Set<number>();
    let p = a;
    for (let k = 1; k <= n; k++) {
      const q = k === n ? b : { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      const x = Math.min(p.x, q.x) - margin;
      const y = Math.min(p.y, q.y) - margin;
      this.#box({ x, y, w: Math.abs(p.x - q.x) + 2 * margin, h: Math.abs(p.y - q.y) + 2 * margin }, (key) => keys.add(key));
      p = q;
    }
    for (const key of keys) visit(key);
  }

  #put(item: T): (key: number) => void {
    return (key) => {
      const list = this.#buckets.get(key);
      if (list) list.push(item);
      else this.#buckets.set(key, [item]);
    };
  }

  #take(visit: (item: T) => void): (key: number) => void {
    const stamp = ++this.#stamp;
    return (key) => {
      const list = this.#buckets.get(key);
      if (!list) return;
      for (const item of list) {
        if (this.#seen.get(item) === stamp) continue;
        this.#seen.set(item, stamp);
        visit(item);
      }
    };
  }

  /** This method adds an item with its bounding box. */
  add(item: T, b: Box): void {
    this.#box(b, this.#put(item));
  }

  /** This method adds the segment `ab` as an item. */
  addSegment(item: T, a: Point, b: Point): void {
    this.#segment(a, b, 0, this.#put(item));
  }

  /** This method gives each item whose buckets touch the box to `visit`, one time each. */
  query(b: Box, visit: (item: T) => void): void {
    this.#box(b, this.#take(visit));
  }

  /** This method gives each item whose buckets come within `margin` of the segment `ab` to `visit`, one time each. */
  querySegment(a: Point, b: Point, margin: number, visit: (item: T) => void): void {
    this.#segment(a, b, margin, this.#take(visit));
  }
}

/** This function gives the bounding box of the segment `ab`. */
export function segmentBounds(a: Point, b: Point): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
