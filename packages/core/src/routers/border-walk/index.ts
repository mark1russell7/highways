import { center, type Point } from "../../geom.ts";
import { nodeIndex, resolvePorts, splitFrames, type Graph, type Result, type Route, type Router } from "../../model.ts";
import { placePlug } from "../../plugs.ts";
import { defineStrategy, type Strategy } from "../../strategies/model.ts";
import { seamGraph } from "../seams/index.ts";

/** The options of the control `border-walk`. */
export interface BorderWalkOptions {
  /** A link that does not run along a side of a box costs its length times this value. The value 1 gives the shortest way over the corners of the boxes. */
  readonly leave: number;
  /** The number of visible neighbours of each corner. */
  readonly k: number;
}

/** The default options of the control `border-walk`. */
export const BORDER_WALK_DEFAULTS: Readonly<BorderWalkOptions> = Object.freeze({ leave: 3, k: 12 });

/** The size limit of this router. Its search has a weak estimate when a link off a border costs more than its length. */
const MAX_NODES = 2_000;
/** A point at this distance from a side of a box is on that side. */
const ON_SIDE = 1e-6;

/** This function tells if a point is on a side of a box. */
function onSide(p: Point, box: Graph["nodes"][number]["box"]): boolean {
  const inX = p.x >= box.x - ON_SIDE && p.x <= box.x + box.w + ON_SIDE;
  const inY = p.y >= box.y - ON_SIDE && p.y <= box.y + box.h + ON_SIDE;
  const onX = Math.abs(p.x - box.x) <= ON_SIDE || Math.abs(p.x - box.x - box.w) <= ON_SIDE;
  const onY = Math.abs(p.y - box.y) <= ON_SIDE || Math.abs(p.y - box.y - box.h) <= ON_SIDE;
  return (onX && inY) || (onY && inX);
}

/**
 * This function makes the control `border-walk`. Each route goes from plug to plug over the corners of the boxes, and it has no other aim.
 * The test of `route.through` makes each box smaller by 0.5, so a route on a side of a box does not count as a hit.
 * The router pays no clearance for that, so this control tests if `route.through` can be bought.
 * The router does not mark `through`, and it gives no shared run, as `straight`. Only a route with no way gets the straight line.
 */
export function borderWalkRouter(options: Partial<BorderWalkOptions> & { readonly name: string }): Router {
  const leave = options.leave ?? BORDER_WALK_DEFAULTS.leave;
  return {
    name: options.name,
    maxNodes: MAX_NODES,
    route(input: Graph): Result {
      const { graph } = splitFrames(resolvePorts(input));
      const byId = nodeIndex(graph);
      const corners = seamGraph(graph.nodes, options.k ?? BORDER_WALK_DEFAULTS.k);
      const known = new Map<number, boolean>();
      const size = corners.points.length;
      const onBorder = (i: number, j: number): boolean => {
        const key = i * size + j;
        const seen = known.get(key);
        if (seen !== undefined) return seen;
        const [a, b] = [corners.points[i]!, corners.points[j]!];
        const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const on = (a.x === b.x || a.y === b.y) && graph.nodes.some((n) => onSide(middle, n.box));
        known.set(key, on);
        return on;
      };
      const cost = leave === 1 ? undefined : (i: number, j: number, d: number): number => (onBorder(i, j) ? d : d * leave);
      const routes: Route[] = [];
      for (const e of graph.edges) {
        const s = byId.get(e.source.node);
        const t = byId.get(e.target.node);
        if (!s || !t) continue;
        const a = placePlug(s, e.source, center(t.box)).point;
        const b = placePlug(t, e.target, center(s.box)).point;
        const way = corners.path(a, b, cost);
        // A pull cuts each link that it can, and that takes a route off the borders. Only the shortest form takes it.
        routes.push({ edge: e.id, points: !way ? [a, b] : leave === 1 ? corners.pull(way) : way });
      }
      return { routes };
    },
  };
}

/** The strategy of the control `border-walk`. It is a baseline, so no chooser offers it and no default uses it. */
export const borderWalkStrategy: Strategy<"router", BorderWalkOptions> = defineStrategy({
  step: "router",
  name: "border-walk",
  describe: "A control. Each route walks the sides of the boxes from plug to plug, with no other aim.",
  defaults: { ...BORDER_WALK_DEFAULTS },
  schema: {
    leave: { type: "number", min: 1, max: 10, step: 0.5, marks: [1, 3, 10], default: 3, describe: "The cost of a link off the sides of the boxes, as a factor of its length." },
    k: { type: "integer", min: 4, max: 24, step: 1, default: 12, describe: "The number of visible neighbours of each corner." },
  },
  maxNodes: MAX_NODES,
  run: (graph: Graph, o: Readonly<BorderWalkOptions>): Result => borderWalkRouter({ ...o, name: "border-walk" }).route(graph),
});
