import { describe, expect, it } from "vitest";
import { rng } from "./fixtures.ts";
import {
  bendCount,
  frechet,
  inflectionCount,
  pointSegmentDistance,
  polylineLength,
  segmentBoxDistance,
  segmentHitsBox,
  segmentsCross,
  turns,
  type Point,
} from "./geom.ts";

const P = (x: number, y: number): Point => ({ x, y });

describe("segmentsCross", () => {
  it("counts an X as a crossing", () => {
    expect(segmentsCross(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBe(true);
  });
  it("does not count a shared end, a touch or a collinear overlap", () => {
    expect(segmentsCross(P(0, 0), P(10, 0), P(10, 0), P(10, 10))).toBe(false);
    expect(segmentsCross(P(0, 0), P(10, 0), P(5, 0), P(5, 10))).toBe(false);
    expect(segmentsCross(P(0, 0), P(10, 0), P(5, 0), P(15, 0))).toBe(false);
  });
  it("is symmetric (property, 2 000 random pairs)", () => {
    const R = rng(11);
    for (let i = 0; i < 2000; i++) {
      const [a, b, c, d] = [0, 1, 2, 3].map(() => P(R() * 100, R() * 100)) as [Point, Point, Point, Point];
      const x = segmentsCross(a, b, c, d);
      expect(segmentsCross(c, d, a, b)).toBe(x);
      expect(segmentsCross(b, a, d, c)).toBe(x);
    }
  });
});

describe("segmentHitsBox", () => {
  const box = { x: 10, y: 10, w: 20, h: 10 };
  it("finds a segment through the box and ignores one that only touches its side", () => {
    expect(segmentHitsBox(P(0, 15), P(40, 15), box)).toBe(true);
    expect(segmentHitsBox(P(0, 10), P(40, 10), box)).toBe(false);
    expect(segmentHitsBox(P(0, 0), P(5, 40), box)).toBe(false);
  });
  it("agrees with a dense sample of the segment (property)", () => {
    const R = rng(12);
    for (let i = 0; i < 1000; i++) {
      const a = P(R() * 40, R() * 30);
      const b = P(R() * 40, R() * 30);
      let inside = false;
      for (let k = 1; k < 400; k++) {
        const t = k / 400;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        if (x > box.x + 1e-3 && x < box.x + box.w - 1e-3 && y > box.y + 1e-3 && y < box.y + box.h - 1e-3) inside = true;
      }
      if (inside) expect(segmentHitsBox(a, b, box)).toBe(true);
      if (segmentBoxDistance(a, b, box) > 0.01) expect(segmentHitsBox(a, b, box)).toBe(false);
    }
  });
});

describe("distances", () => {
  it("gives the distance of a point to a segment", () => {
    expect(pointSegmentDistance(P(5, 5), P(0, 0), P(10, 0))).toBe(5);
    expect(pointSegmentDistance(P(-3, 4), P(0, 0), P(10, 0))).toBe(5);
  });
  it("gives the distance of a segment to a box", () => {
    expect(segmentBoxDistance(P(0, 0), P(0, 30), { x: 10, y: 10, w: 5, h: 5 })).toBe(10);
    expect(segmentBoxDistance(P(0, 12), P(30, 12), { x: 10, y: 10, w: 5, h: 5 })).toBe(0);
  });
});

describe("turns, bends and inflections", () => {
  it("measures a straight line, an L and an S", () => {
    expect(bendCount([P(0, 0), P(5, 0), P(10, 0)])).toBe(0);
    expect(turns([P(0, 0), P(10, 0), P(10, 10)])[0]).toBeCloseTo(Math.PI / 2);
    expect(bendCount([P(0, 0), P(10, 0), P(10, 10)])).toBe(1);
    expect(inflectionCount([P(0, 0), P(10, 0), P(10, 10)])).toBe(0);
    expect(inflectionCount([P(0, 0), P(10, 0), P(10, 10), P(20, 10)])).toBe(1);
    expect(inflectionCount([P(0, 0), P(10, 0), P(10, 10), P(20, 10), P(20, 20)])).toBe(2);
  });
  it("skips repeated points", () => {
    expect(bendCount([P(0, 0), P(5, 0), P(5, 0), P(10, 0)])).toBe(0);
  });
  it("gives the length of a polyline", () => {
    expect(polylineLength([P(0, 0), P(3, 4), P(3, 10)])).toBe(11);
  });
});

describe("frechet", () => {
  it("is 0 for the same polyline and the offset for a shifted copy", () => {
    const a = [P(0, 0), P(10, 0), P(20, 5)];
    expect(frechet(a, a)).toBe(0);
    expect(frechet(a, a.map((p) => P(p.x, p.y + 3)))).toBeCloseTo(3);
  });
  it("is symmetric and at least the distance of the ends (property)", () => {
    const R = rng(13);
    for (let i = 0; i < 200; i++) {
      const a = Array.from({ length: 2 + Math.floor(R() * 6) }, () => P(R() * 50, R() * 50));
      const b = Array.from({ length: 2 + Math.floor(R() * 6) }, () => P(R() * 50, R() * 50));
      const f = frechet(a, b);
      expect(frechet(b, a)).toBeCloseTo(f);
      expect(f).toBeGreaterThanOrEqual(Math.hypot(a[0]!.x - b[0]!.x, a[0]!.y - b[0]!.y) - 1e-9);
    }
  });
});
