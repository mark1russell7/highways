import { inflectionCurve, roundCorners } from "./curves.ts";
import type { Point } from "./geom.ts";
import type { Node } from "./model.ts";
import type { Plug } from "./plugs.ts";
import { CornerGraph, Obstacles } from "./visibility.ts";

/** The options of a way finder. */
export interface WayOptions {
  /** The distance from a box to the corners of the graph. The default is 5. */
  readonly margin?: number;
  /** The number of visible neighbours of each corner. The default is 8. */
  readonly k?: number;
  /** With `smooth`, a way in clear view uses the inflection rule, and the other ways get round corners. */
  readonly smooth?: boolean;
}

/**
 * The ways around the nodes of one graph. A way leaves a plug along its normal.
 * It goes a shortest way (A*) through the corner graph, without the needless corners. It enters the other plug along its normal.
 */
export class WayFinder {
  readonly obstacles: Obstacles;
  readonly corners: CornerGraph;
  readonly margin: number;
  readonly #smooth: boolean;

  /** This constructor makes the obstacles and the corner graph of the nodes. */
  constructor(nodes: readonly Node[], options: WayOptions = {}) {
    this.margin = options.margin ?? 5;
    this.#smooth = options.smooth ?? false;
    this.obstacles = new Obstacles(nodes, 180);
    this.corners = new CornerGraph(nodes, this.obstacles, { margin: this.margin, k: options.k ?? 8 });
  }

  /** This method gives the point at `margin` from the plug, along its normal. */
  out(p: Plug): Point {
    return { x: p.point.x + p.normal.x * this.margin, y: p.point.y + p.normal.y * this.margin };
  }

  /** This method gives a way from plug to plug. Without a way in the graph, it gives the straight line. */
  between(ps: Plug, pt: Plug, ends: ReadonlySet<Node>): Point[] {
    if (this.#smooth) {
      const curve = inflectionCurve(ps.point, ps.normal, pt.point);
      if (this.obstacles.clearPath(curve, this.margin / 2, ends)) return curve;
    }
    const way = this.corners.path(this.out(ps), this.out(pt));
    if (!way) return [ps.point, pt.point];
    const poly = [ps.point, ...this.corners.pull(way), pt.point];
    if (this.#smooth) {
      const round = roundCorners(poly, this.margin);
      if (this.obstacles.clearPath(round, 0, ends)) return round;
    }
    return poly;
  }

  /** This method gives a way from a plug to a free point, or `undefined` when the graph has none. */
  fromPlug(ps: Plug, to: Point): Point[] | undefined {
    const way = this.corners.path(this.out(ps), to);
    return way && [ps.point, ...this.corners.pull(way)];
  }

  /** This method gives a way from a free point to a plug, or `undefined` when the graph has none. */
  toPlug(from: Point, pt: Plug): Point[] | undefined {
    const way = this.corners.path(from, this.out(pt));
    return way && [...this.corners.pull(way), pt.point];
  }
}
