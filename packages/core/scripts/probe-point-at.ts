// The probe of POINT-AT: the largest error of the length to the point, for each curve type, against a fine sample of the curve.
// Start: `node scripts/probe-point-at.ts`. Each line of the output is one JSON row.
import { pointSegmentDistance, type Point } from "../src/geom.ts";
import { CURVE_TYPES, curveOf, pointAtFraction, sampleCurve } from "../src/curves/index.ts";
const zig: Point[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 90 }];
const length = (p: readonly Point[]): number => p.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - p[i]!.x, q.y - p[i]!.y), 0);
for (const type of CURVE_TYPES) {
  const curve = curveOf(zig, { type });
  const fine = sampleCurve(curve, 1e-5);
  const total = length(fine);
  let worst = 0, off = 0;
  for (let k = 1; k < 100; k++) {
    const t = k / 100;
    const { point } = pointAtFraction(curve, t);
    let along = 0, best = Infinity, at = 0, run = 0;
    for (let i = 1; i < fine.length; i++) { const d = pointSegmentDistance(point, fine[i-1]!, fine[i]!); if (d < best) { best = d; at = run + Math.hypot(point.x - fine[i-1]!.x, point.y - fine[i-1]!.y); } run += Math.hypot(fine[i]!.x - fine[i-1]!.x, fine[i]!.y - fine[i-1]!.y); }
    along = at; worst = Math.max(worst, Math.abs(along - t * total)); off = Math.max(off, best);
  }
  console.log(JSON.stringify({ type, total: +total.toFixed(4), worstLengthError: +worst.toExponential(3), worstOffCurve: +off.toExponential(3) }));
}
