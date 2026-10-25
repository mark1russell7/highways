import { describe, expect, it } from "vitest";
import { inflectionCurve, inflectionSector, roundCorners } from "./curves.ts";
import { rng } from "./fixtures.ts";
import { dist, inflectionCount, type Point } from "./geom.ts";

const deg = Math.PI / 180;
const NORMALS: Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

describe("inflectionSector", () => {
  it("gives 0 on an axis, 1 on a diagonal and 2 between them", () => {
    for (const a of [0, 90, 180, 270, -90, 4, 356]) expect(inflectionSector(a * deg)).toBe(0);
    for (const a of [45, 135, 225, 315, -45, 50]) expect(inflectionSector(a * deg)).toBe(1);
    for (const a of [22.5, 67.5, 112, 200, -20]) expect(inflectionSector(a * deg)).toBe(2);
  });
});

describe("inflectionCurve", () => {
  it("has the inflections of the rule and leaves the plug along the normal (property, 3 000 cases)", () => {
    const R = rng(7);
    let tested = 0;
    for (let k = 0; k < 3000; k++) {
      const p0 = { x: R() * 400, y: R() * 400 };
      const normal = NORMALS[Math.floor(R() * 4)]!;
      const target = { x: R() * 400, y: R() * 400 };
      const L = dist(p0, target);
      if (L < 20) continue;
      const ux = (target.x - p0.x) / L;
      const uy = (target.y - p0.y) / L;
      const th = Math.abs(Math.atan2(normal.x * uy - normal.y * ux, normal.x * ux + normal.y * uy));
      // A tiny angle gives turns below the threshold of the count, and a large one is clamped.
      if (th < 0.25 || th > 1.3) continue;
      tested++;
      const c = inflectionCurve(p0, normal, target);
      expect(c[0]).toEqual(p0);
      expect(c[c.length - 1]).toEqual(target);
      expect(inflectionCount(c)).toBe(inflectionSector(Math.atan2(uy, ux)));
      const a = c[0]!;
      const b = c[1]!;
      const dir = Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(normal.y, normal.x);
      expect(Math.abs(Math.atan2(Math.sin(dir), Math.cos(dir)))).toBeLessThan(0.12);
    }
    expect(tested).toBeGreaterThan(500);
  });

  it("is a straight line when the chord is on the normal", () => {
    const c = inflectionCurve({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 100, y: 0 });
    for (const p of c) expect(Math.abs(p.y)).toBeLessThan(1e-9);
  });
});

describe("roundCorners", () => {
  it("keeps the ends and stays near each corner", () => {
    const p = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const r = roundCorners(p, 10);
    expect(r[0]).toEqual(p[0]);
    expect(r[r.length - 1]).toEqual(p[2]);
    for (const q of r.slice(1, -1)) expect(dist(q, p[1]!)).toBeLessThanOrEqual(10 + 1e-9);
  });

  it("uses at most half of a short segment", () => {
    const r = roundCorners(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 100 },
      ],
      10,
    );
    expect(r[1]).toEqual({ x: 2, y: 0 });
  });
});
