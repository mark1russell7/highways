import { inflectionCurve, roundCorners } from "./curves.ts";
import type { Point } from "./geom.ts";
import type { Node } from "./model.ts";
import type { Plug } from "./plugs.ts";
import { CornerGraph, Obstacles } from "./visibility.ts";

/**
 * The parts of the margin that the first step of a plug tries, in order (PLUG-OUT-BLOCKED).
 * The margin is a preference, not a wall. A small margin is better than a straight line through a box.
 */
export const OUT_STEPS: readonly number[] = [1, 0.5, 0.25, 0];

/** The options of a way finder. */
export interface WayOptions {
  /** The distance from a box to the corners of the graph. The default is 5. */
  readonly margin?: number;
  /** The number of visible neighbours of each corner. The default is 8. */
  readonly k?: number;
  /** With `smooth`, a way in clear view uses the inflection rule, and the other ways get round corners. */
  readonly smooth?: boolean;
  /** With `false`, a way keeps the whole margin, so a closed gap gives the straight line. The default is `true`, and a closed gap tries each step of `OUT_STEPS`. */
  readonly outSteps?: boolean;
}

/**
 * The ways around the nodes of one graph. A way leaves a plug along its normal.
 * It goes a shortest way (A*) through the corner graph, without the needless corners. It enters the other plug along its normal.
 */
/** The options of `WayFinder`. */
export interface WayFinderOptions extends WayOptions {
  /** The limit of the work that joins the parts of the corner graph. `CornerGraphOptions.joinWork` tells more. */
  readonly joinWork?: number;
  /** With `false`, the join does not label the free regions. `CornerGraphOptions.joinRegions` tells more. */
  readonly joinRegions?: boolean;
}

/** This function removes a point that equals the point before it: a step of 0 starts the way at the plug. */
function tidy(points: readonly Point[]): Point[] {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y);
}

export class WayFinder {
  readonly obstacles: Obstacles;
  readonly corners: CornerGraph;
  readonly margin: number;
  /** The number of ways that each lower step of `OUT_STEPS` gave. The whole margin has no count: this list counts only the ways with a lower graph. */
  readonly lowerWays: number[] = OUT_STEPS.map(() => 0);
  /** With `true`, a way that the whole margin does not give tries the lower steps of `OUT_STEPS`. */
  readonly outSteps: boolean;
  readonly #smooth: boolean;
  readonly #nodes: readonly Node[];
  readonly #graphOptions: Pick<WayFinderOptions, "joinWork" | "joinRegions"> & { readonly k: number };
  readonly #lower: (CornerGraph | undefined)[] = [];

  /** This constructor makes the obstacles and the corner graph of the nodes. */
  constructor(nodes: readonly Node[], options: WayFinderOptions = {}) {
    this.margin = options.margin ?? 5;
    this.#smooth = options.smooth ?? false;
    this.outSteps = options.outSteps ?? true;
    this.obstacles = new Obstacles(nodes, 180);
    this.#nodes = nodes;
    this.#graphOptions = { k: options.k ?? 8, ...(options.joinWork === undefined ? {} : { joinWork: options.joinWork }), ...(options.joinRegions === undefined ? {} : { joinRegions: options.joinRegions }) };
    this.corners = new CornerGraph(nodes, this.obstacles, { margin: this.margin, ...this.#graphOptions });
  }

  /** This method gives the point at `margin` from the plug, along its normal. When that point gives no start, a part of the margin gives the point (`outStep`). */
  out(p: Plug): Point {
    return this.#at(p, this.outStep(p));
  }

  /**
   * This method gives the index in `OUT_STEPS` of the first step of a plug.
   * A step is good when its point is out of each box, the step goes through no box and the point sees a corner.
   * With no good step, the method gives 0, so the search finds no start.
   */
  outStep(p: Plug): number {
    if (!this.outSteps) return 0;
    for (let i = 0; i < OUT_STEPS.length; i++) {
      const q = this.#at(p, i);
      if (!this.obstacles.inside(q, 0) && this.obstacles.clear(p.point, q, 0) && this.corners.sees(q)) return i;
    }
    return 0;
  }

  /**
   * This method gives the points of a way between two ends, without the needless corners.
   * It searches first at the whole margin, so a route with a way there keeps its bytes.
   * The corner graph at the margin can have no link between two free ends: boxes that stand closer than twice the margin close each gap.
   * Then the method tries the first step of `out`, and the graphs of the lower steps of `OUT_STEPS`. It makes each graph at the first search that needs it.
   * With `ends`, a straight line between two plugs that goes through no other box stops the method, and it gives `undefined`.
   */
  way(from: Plug | Point, to: Plug | Point, ends?: ReadonlySet<Node>): Point[] | undefined {
    const whole = (e: Plug | Point): Point => ("normal" in e ? this.#at(e, 0) : e);
    const open = (e: Plug | Point): boolean => !("normal" in e) || this.obstacles.clear(e.point, this.#at(e, 0), 0);
    if (!this.outSteps || (open(from) && open(to))) {
      const first = this.corners.path(whole(from), whole(to));
      if (first) return this.corners.pull(first);
    }
    if (!this.outSteps) return undefined;
    if (ends && "normal" in from && "normal" in to && this.obstacles.clear(from.point, to.point, 0, ends)) return undefined;
    const end = (e: Plug | Point, step: number): Point => {
      if (!("normal" in e)) return e;
      return step === 0 ? this.out(e) : this.#at(e, Math.max(step, this.outStep(e)));
    };
    const way = this.corners.path(end(from, 0), end(to, 0));
    if (way) return this.corners.pull(way);
    for (let step = 1; step < OUT_STEPS.length; step++) {
      const graph = (this.#lower[step] ??= new CornerGraph(this.#nodes, this.obstacles, { margin: this.margin * OUT_STEPS[step]!, ...this.#graphOptions }));
      const low = graph.path(end(from, step), end(to, step));
      if (low) {
        this.lowerWays[step]!++;
        return graph.pull(low);
      }
    }
    return undefined;
  }

  /** This method gives the point of a step of `OUT_STEPS`, along the normal of the plug. */
  #at(p: Plug, step: number): Point {
    const d = this.margin * OUT_STEPS[step]!;
    return { x: p.point.x + p.normal.x * d, y: p.point.y + p.normal.y * d };
  }

  /** This method gives a way from plug to plug. Without a way in the graph, it gives the straight line. */
  between(ps: Plug, pt: Plug, ends: ReadonlySet<Node>): Point[] {
    if (this.#smooth) {
      const curve = inflectionCurve(ps.point, ps.normal, pt.point);
      if (this.obstacles.clearPath(curve, this.margin / 2, ends)) return curve;
    }
    const way = this.way(ps, pt, ends);
    if (!way) return [ps.point, pt.point];
    const poly = tidy([ps.point, ...way, pt.point]);
    if (this.#smooth) {
      const round = roundCorners(poly, this.margin);
      if (this.obstacles.clearPath(round, 0, ends)) return round;
    }
    return poly;
  }

  /** This method gives a way from a plug to a free point, or `undefined` when the graph has none. */
  fromPlug(ps: Plug, to: Point): Point[] | undefined {
    const way = this.way(ps, to);
    return way && tidy([ps.point, ...way]);
  }

  /** This method gives a way from a free point to a plug, or `undefined` when the graph has none. */
  toPlug(from: Point, pt: Plug): Point[] | undefined {
    const way = this.way(from, pt);
    return way && tidy([...way, pt.point]);
  }
}
