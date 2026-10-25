import { describe, expect, it } from "vitest";
import { rng } from "./fixtures.ts";
import { segmentBoxDistance, segmentHitsBox, type Box, type Point } from "./geom.ts";
import { Grid } from "./grid.ts";

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
