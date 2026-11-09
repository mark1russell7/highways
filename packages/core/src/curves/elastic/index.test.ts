import { describe, expect, it } from "vitest";
import { polylineLength, type Point } from "../../geom.ts";
import { sampleCurve } from "../sample.ts";
import { curveSpace } from "../space.ts";
import { splineCurve } from "../spline/index.ts";
import { ELASTIC_DEFAULTS, elasticCurve, relaxBand } from "./index.ts";

/** A route with one corner: 100 east, then 100 south. */
const ell: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
];

describe("relaxBand (NAT-026)", () => {
  it("keeps the two ends, and pulls a corner toward the chord of its neighbors", () => {
    const band = relaxBand([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], [], 1, 0);
    expect(band[0]).toEqual({ x: 0, y: 0 });
    expect(band[2]).toEqual({ x: 20, y: 0 });
    expect(band[1]).toEqual({ x: 10, y: 5 });
  });

  it("pushes a sample out of the clearance of a near box", () => {
    const box = { x: 0, y: 4, w: 20, h: 10 };
    const band = relaxBand([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], [box], 1, 12);
    // The sample is 4 from the box, so the push is 8 away from the box, times the weight 0.5.
    expect(band[1]).toEqual({ x: 10, y: -4 });
  });
});

describe("the curve elastic (NAT-026)", () => {
  it("keeps the ends, cuts the corner and gives a shorter curve", () => {
    const curve = elasticCurve(ell);
    expect(curve[0]).toEqual({ kind: "move", to: ell[0] });
    expect(curve[curve.length - 1]!.to).toEqual(ell[2]);
    expect(curve.slice(1).every((s) => s.kind === "cubic" || s.kind === "line")).toBe(true);
    const drawn = sampleCurve(curve, 0.25);
    expect(polylineLength(drawn)).toBeLessThan(polylineLength(ell) - 10);
  });

  it("starts the band at the lead on the first leg", () => {
    const curve = elasticCurve(ell, { lead: 12 });
    expect(curve[1]!.to).toEqual({ x: ELASTIC_DEFAULTS.lead, y: 0 });
  });

  it("gives the polyline for 0 rounds, for two points and for a route shorter than its leads", () => {
    const line = (p: readonly Point[]) => p.map((to, i) => (i === 0 ? { kind: "move", to } : { kind: "line", to }));
    expect(elasticCurve(ell, { rounds: 0 })).toEqual(line(ell));
    expect(elasticCurve(ell.slice(0, 2))).toEqual(line(ell.slice(0, 2)));
    const tiny = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }];
    expect(elasticCurve(tiny)).toEqual(line(tiny));
  });

  it("leaves along the plug normals when it has no band, as the spline does (C10)", () => {
    // Two points, with normals across the leg: the polyline leaves off the normal, and the fallback does not.
    const leg: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 40 }];
    const normals = { startNormal: { x: 0, y: 1 }, endNormal: { x: 0, y: 1 } };
    const curve = elasticCurve(leg, normals);
    expect(curve).toEqual(splineCurve(leg, normals));
    const first = curve[1]!;
    expect(first.kind).toBe("cubic");
    if (first.kind === "cubic") expect(first.c1.x).toBeCloseTo(0, 9);
    expect(elasticCurve(ell, { ...normals, rounds: 0 })).toEqual(splineCurve(ell, normals));
  });

  it("goes through no box that the polyline avoids", () => {
    // A box in the inner side of the corner: the chord of the corner goes through it.
    const space = curveSpace([{ x: 30, y: 10, w: 60, h: 60 }]);
    const curve = elasticCurve(ell, { space });
    expect(space.addsHit(sampleCurve(curve, space.tolerance), ell)).toBe(false);
    // Without the box, the band cuts the corner deeper.
    const free = sampleCurve(elasticCurve(ell), 0.25);
    expect(polylineLength(sampleCurve(curve, 0.25))).toBeGreaterThan(polylineLength(free));
  });

  it("gives the same curve for the same input", () => {
    const space = curveSpace([{ x: 30, y: 10, w: 60, h: 60 }]);
    expect(elasticCurve(ell, { space })).toEqual(elasticCurve(ell, { space }));
  });
});
