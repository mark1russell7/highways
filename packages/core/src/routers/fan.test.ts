import { describe, expect, it } from "vitest";
import { dist, type Point } from "../geom.ts";
import { balancedFan, fanPath, gilbertPoint } from "./fan.ts";
import { snellOffset } from "./snell.ts";

const free = (): boolean => true;

describe("gilbertPoint", () => {
  it("moves the split toward the targets when alpha falls, inside the clamp", () => {
    const start = { x: 0, y: 0 };
    const targets = [
      { x: 200, y: -100 },
      { x: 200, y: 100 },
    ];
    const low = gilbertPoint(start, targets, 0.3, free, 5);
    const high = gilbertPoint(start, targets, 0.9, free, 5);
    expect(low.y).toBeCloseTo(0, 6);
    expect(low.x).toBeGreaterThan(high.x);
    // The clamp: at least 0.2 of the way to the center, and at most half of the way to the nearest target.
    expect(high.x).toBeGreaterThanOrEqual(0.2 * 200 - 1e-6);
    expect(dist(start, low)).toBeLessThanOrEqual(0.5 * Math.hypot(200, 100) + 1e-6);
  });

  it("gives the start for no target, and moves back out of the boxes", () => {
    expect(gilbertPoint({ x: 1, y: 2 }, [], 0.5, free, 5)).toEqual({ x: 1, y: 2 });
    const p = gilbertPoint({ x: 0, y: 0 }, [{ x: 100, y: 0 }], 0.5, (q) => q.x < 22, 5);
    expect(p.x).toBeLessThan(22);
  });
});

describe("balancedFan", () => {
  const goals: Point[] = [
    { x: 300, y: -20 },
    { x: 300, y: 20 },
    { x: 300, y: 0 },
  ];
  // Each branch ends with a short stub to its plug, as a way of the corner graph does.
  const line = (from: Point, t: number): Point[] => [from, { x: goals[t]!.x - 10, y: goals[t]!.y }, goals[t]!];

  it("with bf 0, joins each target to the tree at the nearest place, so the routes share ink", () => {
    const fan = balancedFan({ x: 0, y: 0 }, goals, 0, line);
    const paths = goals.map((_, t) => fanPath(fan, fan.leaf[t]!));
    for (const [t, p] of paths.entries()) expect(p[p.length - 1]).toEqual(goals[t]);
    // The later targets join the first route, not the root.
    expect(paths.filter((p) => p.length > 3)).toHaveLength(2);
  });

  it("with a large bf, joins each target to the root", () => {
    const fan = balancedFan({ x: 0, y: 0 }, goals, 1, line);
    for (const t of goals.keys()) expect(fanPath(fan, fan.leaf[t]!)).toHaveLength(3);
  });
});

describe("snellOffset", () => {
  it("puts the merge point where the route meets the run at acos(d)", () => {
    for (const d of [0.25, 0.5, 0.75]) {
      const from = { x: 0, y: -100 };
      const t = snellOffset(from, { x: 0, y: 0 }, { x: 1000, y: 0 }, d);
      const angle = (Math.atan2(100, t) * 180) / Math.PI;
      expect(angle).toBeCloseTo((Math.acos(d) * 180) / Math.PI, 6);
    }
  });

  it("gives 0 or less when the turn is already at most acos(d)", () => {
    expect(snellOffset({ x: -100, y: -10 }, { x: 0, y: 0 }, { x: 100, y: 0 }, 0.5)).toBeLessThanOrEqual(0);
  });
});
