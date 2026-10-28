import type { Node, Quality, Result, Route, SegmentGraph } from "@mark1russell7/highways";
import type { ComparePanels, CompareState, PanelProgress } from "./compare-data.ts";
import type { DemoPick } from "./demo-data.ts";

/** A request to the worker: route one fixture as the demo picks it. */
export interface RouteRequest {
  readonly id: number;
  readonly fixture: string;
  readonly pick: DemoPick;
}

/** The routes of one router on one fixture, with the measures of their quality. */
export interface RouteDone {
  readonly id: number;
  readonly ok: true;
  readonly result: Result;
  /** The nodes of the board after a room strategy opened its gaps. Without a room strategy, the board is the fixture. */
  readonly nodes?: readonly Node[];
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

/** A request to the worker of the compare page: run each strategy of one step on one board. */
export interface CompareRequest {
  readonly id: number;
  readonly state: CompareState;
}

/** The reply of the worker of the compare page: the progress after one strategy, the panels, or the error. */
export type CompareReply =
  | { readonly id: number; readonly ok: true; readonly panels: ComparePanels }
  | { readonly id: number; readonly ok: "progress"; readonly progress: PanelProgress }
  | { readonly id: number; readonly ok: false; readonly error: string };
