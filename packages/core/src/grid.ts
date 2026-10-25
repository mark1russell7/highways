import type { Box, Point } from "./geom.ts";

/**
 * A uniform grid of buckets over the plane. A box item goes into each bucket that the box touches.
 * A segment item goes only into the buckets along the segment, so a long diagonal segment stays cheap.
 * A query gives each item in the buckets that it touches, one time each.
 */
export class Grid<T> {
  readonly #cell: number;
  readonly #buckets = new Map<number, number[]>();
  readonly #items: T[] = [];
  readonly #ids = new Map<T, number>();
  // The stamp of the last query that gave each item, by the index of the item.
  #seen = new Int32Array(16);
  #stamp = 0;

  /** This constructor makes an empty grid with square buckets of side `cell`. */
  constructor(cell: number) {
    this.#cell = Math.max(1e-9, cell);
  }

  #key(i: number, j: number): number {
    // The key packs the two bucket indices into one number. Each index stays within ±2^20.
    return (i + 1_048_576) * 2_097_152 + (j + 1_048_576);
  }

  #id(item: T): number {
    let id = this.#ids.get(item);
    if (id === undefined) {
      id = this.#items.length;
      this.#ids.set(item, id);
      this.#items.push(item);
      if (id >= this.#seen.length) {
        const seen = new Int32Array(this.#seen.length * 2);
        seen.set(this.#seen);
        this.#seen = seen;
      }
    }
    return id;
  }

  #put(id: number, x0: number, y0: number, x1: number, y1: number): void {
    const c = this.#cell;
    const i1 = Math.floor(x1 / c);
    const j1 = Math.floor(y1 / c);
    for (let i = Math.floor(x0 / c); i <= i1; i++) {
      for (let j = Math.floor(y0 / c); j <= j1; j++) {
        const key = this.#key(i, j);
        const list = this.#buckets.get(key);
        if (list === undefined) this.#buckets.set(key, [id]);
        else if (list[list.length - 1] !== id) list.push(id);
      }
    }
  }

  #take(stamp: number, x0: number, y0: number, x1: number, y1: number, visit: (item: T) => void): void {
    const c = this.#cell;
    const i1 = Math.floor(x1 / c);
    const j1 = Math.floor(y1 / c);
    const seen = this.#seen;
    for (let i = Math.floor(x0 / c); i <= i1; i++) {
      for (let j = Math.floor(y0 / c); j <= j1; j++) {
        const list = this.#buckets.get(this.#key(i, j));
        if (list === undefined) continue;
        for (const id of list) {
          if (seen[id] === stamp) continue;
          seen[id] = stamp;
          visit(this.#items[id]!);
        }
      }
    }
  }

  // The buckets along a segment, widened by `margin`: the boxes of steps of at most half a bucket.
  #segment(a: Point, b: Point, margin: number, each: (x0: number, y0: number, x1: number, y1: number) => void): void {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (this.#cell / 2)));
    let px = a.x;
    let py = a.y;
    for (let k = 1; k <= n; k++) {
      const qx = k === n ? b.x : a.x + ((b.x - a.x) * k) / n;
      const qy = k === n ? b.y : a.y + ((b.y - a.y) * k) / n;
      each(Math.min(px, qx) - margin, Math.min(py, qy) - margin, Math.max(px, qx) + margin, Math.max(py, qy) + margin);
      px = qx;
      py = qy;
    }
  }

  /** This method adds an item with its bounding box. */
  add(item: T, b: Box): void {
    this.#put(this.#id(item), b.x, b.y, b.x + b.w, b.y + b.h);
  }

  /** This method adds the segment `ab` as an item. */
  addSegment(item: T, a: Point, b: Point): void {
    const id = this.#id(item);
    this.#segment(a, b, 0, (x0, y0, x1, y1) => this.#put(id, x0, y0, x1, y1));
  }

  /** This method gives each item whose buckets touch the box to `visit`, one time each. */
  query(b: Box, visit: (item: T) => void): void {
    this.#take(++this.#stamp, b.x, b.y, b.x + b.w, b.y + b.h, visit);
  }

  /** This method gives each item whose buckets come within `margin` of the segment `ab` to `visit`, one time each. */
  querySegment(a: Point, b: Point, margin: number, visit: (item: T) => void): void {
    const stamp = ++this.#stamp;
    this.#segment(a, b, margin, (x0, y0, x1, y1) => this.#take(stamp, x0, y0, x1, y1, visit));
  }
}

/** This function gives the bounding box of the segment `ab`. */
export function segmentBounds(a: Point, b: Point): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
