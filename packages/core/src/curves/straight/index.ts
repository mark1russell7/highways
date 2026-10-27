import type { Point } from "../../geom.ts";
import type { CurveSegment } from "../model.ts";

/** This function gives the polyline as it is: one `move` to the first point and one `line` to each other point. */
export function straightCurve(points: readonly Point[]): CurveSegment[] {
  return points.map((to, i): CurveSegment => (i === 0 ? { kind: "move", to } : { kind: "line", to }));
}
