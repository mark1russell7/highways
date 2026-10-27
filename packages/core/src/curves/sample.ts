import type { Point } from "../geom.ts";
import type { CurveSegment } from "./model.ts";

/** The largest number of points that `sampleCurve` gives for one segment. */
const MAX_STEPS = 1024;

/**
 * This function gives a polyline that follows the curve. The distance from each part of the curve to the polyline is `tolerance` or less.
 * The polyline starts at the point of the `move` and goes through the end of each segment.
 * Hit tests, measures and renderers that draw only lines use this polyline.
 */
export function sampleCurve(segments: readonly CurveSegment[], tolerance = 0.5): Point[] {
  const tol = Math.max(1e-6, tolerance);
  const out: Point[] = [];
  let at: Point | undefined;
  for (const s of segments) {
    if (s.kind === "move" || at === undefined) {
      out.push(s.to);
      at = s.to;
      continue;
    }
    if (s.kind === "cubic") {
      // The chord of a step of 1/n of the parameter is within 3·D/(4·n²) of the curve. D is the largest second difference of the control points.
      const d = Math.max(
        Math.hypot(at.x - 2 * s.c1.x + s.c2.x, at.y - 2 * s.c1.y + s.c2.y),
        Math.hypot(s.c1.x - 2 * s.c2.x + s.to.x, s.c1.y - 2 * s.c2.y + s.to.y),
      );
      const n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.sqrt((3 * d) / (4 * tol)))));
      for (let k = 1; k < n; k++) out.push(cubicAt(at, s.c1, s.c2, s.to, k / n));
    } else if (s.kind === "arc") {
      // The chord of an angle φ is within r·(1 - cos(φ/2)) of the arc.
      const step = s.radius <= tol ? Math.PI : 2 * Math.acos(1 - tol / s.radius);
      const n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.abs(s.sweep) / step)));
      for (let k = 1; k < n; k++) {
        const a = s.start + (s.sweep * k) / n;
        out.push({ x: s.center.x + s.radius * Math.cos(a), y: s.center.y + s.radius * Math.sin(a) });
      }
    }
    out.push(s.to);
    at = s.to;
  }
  return out;
}

/** This function gives the point at the parameter `t` of the cubic Bezier curve with the control points `p0`, `p1`, `p2` and `p3`. */
export function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/**
 * This function writes the segments as the data of an SVG path: the commands `M`, `L`, `C` and `A`.
 * Each number has at most `digits` digits after the point.
 */
export function toSvgPath(segments: readonly CurveSegment[], digits = 2): string {
  const n = (v: number): string => {
    const s = String(Number(v.toFixed(digits)));
    return s === "-0" ? "0" : s;
  };
  const p = (q: Point): string => `${n(q.x)} ${n(q.y)}`;
  const parts: string[] = [];
  for (const s of segments) {
    if (s.kind === "move") parts.push(`M ${p(s.to)}`);
    else if (s.kind === "line") parts.push(`L ${p(s.to)}`);
    else if (s.kind === "cubic") parts.push(`C ${p(s.c1)} ${p(s.c2)} ${p(s.to)}`);
    else parts.push(`A ${n(s.radius)} ${n(s.radius)} 0 ${Math.abs(s.sweep) > Math.PI ? 1 : 0} ${s.sweep > 0 ? 1 : 0} ${p(s.to)}`);
  }
  return parts.join(" ");
}
