import type { Point } from "../geom.ts";
import { arcCurve } from "./arc/index.ts";
import type { CurveSegment, CurveType } from "./model.ts";
import { roundedCurve } from "./rounded/index.ts";
import type { CurveSpace } from "./space.ts";
import { splineCurve } from "./spline/index.ts";
import { straightCurve } from "./straight/index.ts";

export * from "./model.ts";
export { cubicAt, sampleCurve, toSvgPath } from "./sample.ts";
export { curveSpace, type CurveSpace } from "./space.ts";
export { straightCurve } from "./straight/index.ts";
export { roundedCurve, type RoundedOptions } from "./rounded/index.ts";
export { splineCurve, type SplineOptions } from "./spline/index.ts";
export { arcCurve, type ArcOptions } from "./arc/index.ts";

/** The options of `curveOf`. Each type reads only the options that it uses. */
export interface CurveOptions {
  readonly type: CurveType;
  /** The types `rounded` and `arc` read this radius of the corners. The default is 12. */
  readonly radius?: number;
  /** The type `spline` reads this tension, from 0 to 1. The default is 0. */
  readonly tension?: number;
  /** The type `spline` leaves the first point along this outward normal of its plug. */
  readonly startNormal?: Point;
  /** The type `spline` comes into the last point against this outward normal of its plug. */
  readonly endNormal?: Point;
  /** The boxes that the curve must not go through, from `curveSpace`. The type `straight` does not read it. */
  readonly space?: CurveSpace;
}

/**
 * This function gives the curve of a route: a polyline of a router, a lane of `laneRoutes` or a link of a zoom level.
 * The curve starts at the first point and ends at the last point of the polyline.
 * The output is a list of segments for any renderer. `toSvgPath` writes it as SVG path data, and `sampleCurve` gives points.
 */
export function curveOf(points: readonly Point[], options: CurveOptions): CurveSegment[] {
  switch (options.type) {
    case "straight":
      return straightCurve(points);
    case "rounded":
      return roundedCurve(points, options);
    case "spline":
      return splineCurve(points, options);
    case "arc":
      return arcCurve(points, options);
  }
}
