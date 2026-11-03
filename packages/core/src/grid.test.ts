import { describe, expect, it } from "vitest";
import { rng } from "./fixtures.ts";
import { segmentBoxDistance, segmentHitsBox, type Box, type Point } from "./geom.ts";
import { Grid } from "./grid.ts";
import { WORK } from "./work.ts";

describe("Grid", () => {
  it("finds each box near a segment (property, 3 000 random cases)", () => {
    const R = rng(21);
    for (let k = 0; k < 3000; k++) {
      const grid = new Grid<Box>(10 + R() * 50);
      const boxes: Box[] = Array.from({ length: 20 }, () => ({ x: R() * 400, y: R() * 400, w: 5 + R() * 30, h: 5 + R() * 30 }));
      boxes.forEach((b) => grid.add(b, b));
      const a: Point = { x: R() * 400, y: R() * 400 };
      const b: Point = { x: R() * 400, y: R() * 400 };
      const margin = R() * 20;
      const found = new Set<Box>();
      grid.querySegment(a, b, margin, (x) => found.add(x));
      for (const box of boxes) {
        if (segmentHitsBox(a, b, box) || segmentBoxDistance(a, b, box) < margin) expect(found.has(box)).toBe(true);
      }
    }
  });

  it("keeps a long diagonal segment out of the far corners", () => {
    const grid = new Grid<string>(10);
    grid.addSegment("d", { x: 0, y: 0 }, { x: 1000, y: 1000 });
    const near: string[] = [];
    const far: string[] = [];
    grid.query({ x: 500, y: 500, w: 1, h: 1 }, (x) => near.push(x));
    grid.query({ x: 900, y: 50, w: 1, h: 1 }, (x) => far.push(x));
    expect(near).toEqual(["d"]);
    expect(far).toEqual([]);
  });

  it("gives each item one time for each query", () => {
    const grid = new Grid<string>(10);
    grid.add("big", { x: 0, y: 0, w: 100, h: 100 });
    const got: string[] = [];
    grid.querySegment({ x: 0, y: 0 }, { x: 100, y: 100 }, 5, (x) => got.push(x));
    expect(got).toEqual(["big"]);
  });
});

/**
 * This class is the reference grid: a copy of the grid of version 0.11.0, with its map of buckets and `Math.hypot`.
 * The test of SECTIONS-SLOW step 3 compares the grid with it.
 */
class ReferenceGrid<T> {
  readonly #cell: number;
  readonly #buckets = new Map<number, number[]>();
  readonly #items: T[] = [];
  readonly #ids = new Map<T, number>();
  #seen = new Int32Array(16);
  #stamp = 0;

  constructor(cell: number) {
    this.#cell = Math.max(1e-9, cell);
  }

  #key(i: number, j: number): number {
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

  #walk(a: Point, b: Point, margin: number, visit: (item: T) => boolean | void): boolean {
    const stamp = ++this.#stamp;
    const c = this.#cell;
    const items = this.#items;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (c / 2)));
    WORK.sight += n;
    let px = a.x;
    let py = a.y;
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
      const seen = this.#seen;
      for (let i = i0; i <= i1; i++) {
        const before = i >= pi0 && i <= pi1;
        for (let j = j0; j <= j1; j++) {
          if (before && j >= pj0 && j <= pj1) continue;
          const list = this.#buckets.get(this.#key(i, j));
          if (list === undefined) continue;
          for (const id of list) {
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

  add(item: T, b: Box): void {
    this.#put(this.#id(item), b.x, b.y, b.x + b.w, b.y + b.h);
  }

  addSegment(item: T, a: Point, b: Point): void {
    const id = this.#id(item);
    this.#segment(a, b, 0, (x0, y0, x1, y1) => this.#put(id, x0, y0, x1, y1));
  }

  query(b: Box, visit: (item: T) => void): void {
    this.#take(++this.#stamp, b.x, b.y, b.x + b.w, b.y + b.h, visit);
  }

  querySegment(a: Point, b: Point, margin: number, visit: (item: T) => void): void {
    this.#walk(a, b, margin, (item) => {
      visit(item);
    });
  }

  someSegment(a: Point, b: Point, margin: number, test: (item: T) => boolean): boolean {
    return this.#walk(a, b, margin, test);
  }
}

/** The common methods of the grid and of the reference grid. */
interface AnyGrid {
  add(item: number, b: Box): void;
  addSegment(item: number, a: Point, b: Point): void;
  query(b: Box, visit: (item: number) => void): void;
  querySegment(a: Point, b: Point, margin: number, visit: (item: number) => void): void;
  someSegment(a: Point, b: Point, margin: number, test: (item: number) => boolean): boolean;
}

/**
 * This function makes a random segment on a board of side `side`.
 * It gives axis-aligned segments, near axis-aligned segments, points and segments of a whole number of half buckets.
 */
function randomSegment(R: () => number, side: number, cell: number): [Point, Point] {
  const a: Point = { x: (R() - 0.25) * side, y: (R() - 0.25) * side };
  const form = Math.floor(R() * 6);
  const half = cell / 2;
  if (form === 0) return [a, { x: a.x + (R() - 0.5) * side, y: a.y }];
  if (form === 1) return [a, { x: a.x, y: a.y + (R() - 0.5) * side }];
  if (form === 2) return [a, { x: a.x + (R() - 0.5) * side, y: a.y + (R() - 0.5) * 1e-9 }];
  if (form === 3) {
    // The sides 3, 4 and 5 give a length of `m` half buckets, if the arithmetic is exact.
    const m = 1 + Math.floor(R() * 40);
    const s = R() < 0.5 ? -1 : 1;
    return [a, { x: a.x + (s * 3 * m * half) / 5, y: a.y + (4 * m * half) / 5 }];
  }
  if (form === 4) return [a, a];
  return [a, { x: a.x + (R() - 0.5) * side, y: a.y + (R() - 0.5) * side }];
}

/** This function runs one seeded script of adds and queries on a grid. It gives the record of the visits and of the work counts. */
function gridScript(grid: AnyGrid, seed: number, cell: number): (number | boolean | string)[] {
  const R = rng(seed);
  const side = 200 + R() * 4000;
  const out: (number | boolean | string)[] = [];
  let next = 0;
  for (let step = 0; step < 300; step++) {
    const what = R();
    if (what < 0.3) {
      const b: Box = { x: (R() - 0.25) * side, y: (R() - 0.25) * side, w: R() * cell * 3, h: R() * cell * 3 };
      grid.add(next++, b);
    } else if (what < 0.4) {
      const [a, b] = randomSegment(R, side, cell);
      grid.addSegment(next++, a, b);
    } else if (what < 0.5) {
      const b: Box = { x: (R() - 0.25) * side, y: (R() - 0.25) * side, w: R() * side * 0.3, h: R() * side * 0.3 };
      out.push("q");
      grid.query(b, (x) => out.push(x));
    } else {
      const [a, b] = randomSegment(R, side, cell);
      const margin = R() < 0.3 ? 0 : R() * cell;
      const before = WORK.sight;
      if (what < 0.75) {
        out.push("s");
        grid.querySegment(a, b, margin, (x) => out.push(x));
      } else {
        // The test stops at a random item, so the walk can stop in the middle of the segment.
        const stop = Math.floor(R() * Math.max(1, next));
        out.push("t");
        out.push(
          grid.someSegment(a, b, margin, (x) => {
            out.push(x);
            return x === stop;
          }),
        );
      }
      out.push(WORK.sight - before);
    }
  }
  return out;
}

describe("the walk of the grid (SECTIONS-SLOW step 3)", () => {
  for (let seed = 1; seed <= 40; seed++) {
    it(`gives the visits and the work counts of the reference grid in script ${seed}`, () => {
      const R = rng(9000 + seed);
      const cell = R() < 0.2 ? 0.5 + R() * 4 : 10 + R() * 300;
      const got = gridScript(new Grid<number>(cell), 7000 + seed, cell);
      const want = gridScript(new ReferenceGrid<number>(cell), 7000 + seed, cell);
      expect(got).toEqual(want);
    });
  }

  it("gives the step counts of the reference grid for lengths near a whole number of half buckets", () => {
    const R = rng(77);
    for (let k = 0; k < 20_000; k++) {
      const cell = k % 2 === 0 ? 1 + Math.floor(R() * 200) : 1 + R() * 200;
      const half = cell / 2;
      const m = 1 + Math.floor(R() * 200);
      const t = R() * 2 * Math.PI;
      const sides: [number, number][] = [
        [(3 * m * half) / 5, (4 * m * half) / 5],
        [m * half * Math.cos(t), m * half * Math.sin(t)],
        [(5 * m * half) / 13, (12 * m * half) / 13],
        [m * half * (R() - 0.5) * 1e-6, m * half],
      ];
      const [dx, dy] = sides[Math.floor(R() * sides.length)]!;
      const a: Point = { x: (R() - 0.5) * 1e4, y: (R() - 0.5) * 1e4 };
      const b: Point = { x: a.x + dx, y: a.y + dy };
      const s0 = WORK.sight;
      new Grid<number>(cell).querySegment(a, b, 0, () => undefined);
      const s1 = WORK.sight;
      new ReferenceGrid<number>(cell).querySegment(a, b, 0, () => undefined);
      expect(s1 - s0).toBe(WORK.sight - s1);
    }
  });
});
