import type { Box, Point } from "./geom.ts";
import { WORK } from "./work.ts";

/**
 * A uniform grid of buckets over the plane. A box item goes into each bucket that the box touches.
 * A segment item goes only into the buckets along the segment, so a long diagonal segment stays cheap.
 * A query gives each item in the buckets that it touches, one time each.
 */
export class Grid<T> {
  readonly #cell: number;
  // The table of the buckets, by the keys of `#key`, with open addressing. It gives the buckets of a map of the keys, with less work.
  #keys = new Float64Array(64);
  // The index of the list of each slot in `#lists`, plus 1. The value 0 marks an empty slot.
  #slots = new Int32Array(64);
  readonly #lists: number[][] = [];
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

  // The slot of the key: the slot that holds the key, or else the empty slot where the key goes.
  #slot(key: number): number {
    const keys = this.#keys;
    const slots = this.#slots;
    const mask = slots.length - 1;
    // The hash mixes the low and the high 32 bits of the key.
    let h = Math.imul((key | 0) ^ Math.imul((key / 4_294_967_296) | 0, 0x27d4eb2d), 0x9e3779b1);
    h = (h ^ (h >>> 16)) & mask;
    while (slots[h] !== 0 && keys[h] !== key) h = (h + 1) & mask;
    return h;
  }

  // The list of the bucket (i, j), or `undefined` when the bucket is empty.
  #bucket(i: number, j: number): number[] | undefined {
    const s = this.#slots[this.#slot(this.#key(i, j))]!;
    return s === 0 ? undefined : this.#lists[s - 1];
  }

  // The table doubles its size when it is half full, so that each probe stays short.
  #grow(): void {
    const keys = this.#keys;
    const slots = this.#slots;
    this.#keys = new Float64Array(keys.length * 2);
    this.#slots = new Int32Array(slots.length * 2);
    for (let h = 0; h < slots.length; h++) {
      if (slots[h] === 0) continue;
      const to = this.#slot(keys[h]!);
      this.#keys[to] = keys[h]!;
      this.#slots[to] = slots[h]!;
    }
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
        const h = this.#slot(key);
        const s = this.#slots[h]!;
        if (s === 0) {
          this.#keys[h] = key;
          this.#lists.push([id]);
          this.#slots[h] = this.#lists.length;
          if (2 * this.#lists.length > this.#slots.length) this.#grow();
        } else {
          const list = this.#lists[s - 1]!;
          if (list[list.length - 1] !== id) list.push(id);
        }
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
        const list = this.#bucket(i, j);
        if (list === undefined) continue;
        for (let t = 0; t < list.length; t++) {
          const id = list[t]!;
          if (seen[id] === stamp) continue;
          seen[id] = stamp;
          visit(this.#items[id]!);
        }
      }
    }
  }

  /**
   * This method gives each item in the buckets along the segment `ab`, widened by `margin`, to `visit`, one time each.
   * The buckets are those of `#segment`, in the same order, so the items come in the same order.
   * A bucket in the range of the step before has no new item, so the walk skips it.
   * The walk stops when `visit` gives true, and then the method gives true.
   */
  #walk(a: Point, b: Point, margin: number, visit: (item: T) => boolean | void): boolean {
    const stamp = ++this.#stamp;
    const c = this.#cell;
    const items = this.#items;
    const n = steps(b.x - a.x, b.y - a.y, c / 2);
    WORK.sight += n;
    let px = a.x;
    let py = a.y;
    // The bucket range of the step before. The first step has none.
    let pi0 = 1;
    let pi1 = 0;
    let pj0 = 1;
    let pj1 = 0;
    for (let k = 1; k <= n; k++) {
      const qx = k === n ? b.x : a.x + ((b.x - a.x) * k) / n;
      const qy = k === n ? b.y : a.y + ((b.y - a.y) * k) / n;
      const i0 = Math.floor((Math.min(px, qx) - margin) / c);
      const j0 = Math.floor((Math.min(py, qy) - margin) / c);
      const i1 = Math.floor((Math.max(px, qx) + margin) / c);
      const j1 = Math.floor((Math.max(py, qy) + margin) / c);
      // A visit can add an item and so replace the array of stamps. Each step reads it again, as `#take` does.
      const seen = this.#seen;
      for (let i = i0; i <= i1; i++) {
        const before = i >= pi0 && i <= pi1;
        for (let j = j0; j <= j1; j++) {
          if (before && j >= pj0 && j <= pj1) continue;
          const list = this.#bucket(i, j);
          if (list === undefined) continue;
          for (let t = 0; t < list.length; t++) {
            const id = list[t]!;
            if (seen[id] === stamp) continue;
            seen[id] = stamp;
            if (visit(items[id]!) === true) return true;
          }
        }
      }
      pi0 = i0;
      pi1 = i1;
      pj0 = j0;
      pj1 = j1;
      px = qx;
      py = qy;
    }
    return false;
  }

  // The buckets along a segment, widened by `margin`: the boxes of steps of at most half a bucket.
  #segment(a: Point, b: Point, margin: number, each: (x0: number, y0: number, x1: number, y1: number) => void): void {
    const n = steps(b.x - a.x, b.y - a.y, this.#cell / 2);
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
    this.#walk(a, b, margin, (item) => {
      visit(item);
    });
  }

  /**
   * This method tells if `test` gives true for an item whose buckets come within `margin` of the segment `ab`.
   * It gives the items in the order of `querySegment`, and it stops at the first item that passes the test.
   */
  someSegment(a: Point, b: Point, margin: number, test: (item: T) => boolean): boolean {
    return this.#walk(a, b, margin, test);
  }
}

/**
 * This function gives the number of steps of a segment with the sides `dx` and `dy`: its length over `half`, rounded up, and at least 1.
 * It gives the value of `Math.hypot`, but it calls `Math.hypot` only for a length near a whole number of steps.
 * A side of 0 gives the other side as the length, as `Math.hypot` does.
 * Else the square root has a relative error of a few units in the last place, and so does `Math.hypot`.
 * Far from a whole number, the two lengths round up to the same number.
 */
function steps(dx: number, dy: number, half: number): number {
  if (dx === 0 || dy === 0) return Math.max(1, Math.ceil((dx === 0 ? Math.abs(dy) : Math.abs(dx)) / half));
  const s = dx * dx + dy * dy;
  if (s > 1e-280 && s < 1e280) {
    const q = Math.sqrt(s) / half;
    const n = Math.ceil(q);
    const near = q * 1e-12;
    if (n - q > near && q - (n - 1) > near) return Math.max(1, n);
  }
  return Math.max(1, Math.ceil(Math.hypot(dx, dy) / half));
}

/** This function gives the bounding box of the segment `ab`. */
export function segmentBounds(a: Point, b: Point): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
