import type { Quality, Result, Route, SegmentGraph } from "@mark1russell7/highways";

/** A request to the worker: route one fixture with one router. */
export interface RouteRequest {
  readonly id: number;
  readonly fixture: string;
  readonly router: string;
}

/** The routes of one router on one fixture, with the measures of their quality. */
export interface RouteDone {
  readonly id: number;
  readonly ok: true;
  readonly result: Result;
  /** The time of the route, in milliseconds. */
  readonly ms: number;
  readonly quality: Quality;
  /** The number of broken hard rules. */
  readonly violations: number;
  /** The shared and the private segments, when the result has runs or bundles. */
  readonly segments?: SegmentGraph;
  /** The routes with the lanes of each shared segment pulled apart. */
  readonly apart?: readonly Route[];
}

/** The reply of the worker when the route failed. */
export interface RouteFailed {
  readonly id: number;
  readonly ok: false;
  readonly error: string;
}

/** A reply of the worker. */
export type RouteReply = RouteDone | RouteFailed;
