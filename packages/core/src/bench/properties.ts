import { dist, inflate, pointBoxDistance, segmentHitsBox } from "../geom.ts";
import { Grid } from "../grid.ts";
import { fixedPortPoint, nodeIndex, type Graph, type Node, type Result } from "../model.ts";

/** A broken hard rule. A correct router has none. */
export interface Violation {
  readonly rule: "complete" | "ends-at-plugs" | "fixed-plugs" | "no-pass-through" | "counts-sum" | "bundle-trunk";
  readonly edge?: string;
  readonly detail: string;
}

/** The tolerance of the hard rules, in units of the plane. */
export const TOLERANCE = 0.5;

/**
 * This function checks the hard rules of a result. Each edge has one route, and each route starts and ends at its nodes.
 * Fixed plugs stay in place. No route goes through a node that is not one of its ends. The counts of each level add up.
 *
 * Each route of a bundle starts with its trunk, and an edge is in one bundle at most. The function gives at most `limit` violations.
 */
export function checkProperties(graph: Graph, result: Result, limit = 100): Violation[] {
  const out: Violation[] = [];
  const add = (v: Violation): boolean => {
    out.push(v);
    return out.length >= limit;
  };
  const byId = nodeIndex(graph);
  const grid = new Grid<Node>(180);
  for (const n of graph.nodes) grid.add(n, n.box);
  const routes = new Map<string, (typeof result.routes)[number]>();
  for (const r of result.routes) routes.set(r.edge, r);
  for (const e of graph.edges) {
    const r = routes.get(e.id);
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) continue;
    if (!r || r.points.length < 2) {
      if (add({ rule: "complete", edge: e.id, detail: "no route" })) return out;
      continue;
    }
    const a = r.points[0]!;
    const b = r.points[r.points.length - 1]!;
    if (pointBoxDistance(a, s.box) > TOLERANCE || pointBoxDistance(b, t.box) > TOLERANCE)
      if (add({ rule: "ends-at-plugs", edge: e.id, detail: "an end of the route is away from its node" })) return out;
    const fs = fixedPortPoint(s, e.source);
    const ft = fixedPortPoint(t, e.target);
    if ((fs && dist(fs, a) > TOLERANCE) || (ft && dist(ft, b) > TOLERANCE))
      if (add({ rule: "fixed-plugs", edge: e.id, detail: "the route does not start or end at its fixed plug" })) return out;
    for (let i = 1; i < r.points.length; i++) {
      const p = r.points[i - 1]!;
      const q = r.points[i]!;
      let hit: Node | undefined;
      grid.querySegment(p, q, 0, (n) => {
        if (!hit && n !== s && n !== t && segmentHitsBox(p, q, inflate(n.box, -TOLERANCE))) hit = n;
      });
      if (hit) {
        if (add({ rule: "no-pass-through", edge: e.id, detail: `segment ${i} goes through ${hit.id}` })) return out;
        break;
      }
    }
  }
  const bundled = new Set<string>();
  for (const b of result.bundles ?? []) {
    for (const id of b.edges) {
      const r = routes.get(id);
      const shares = r !== undefined && r.points.length >= b.trunk.length && b.trunk.every((p, i) => dist(p, r.points[i]!) <= TOLERANCE);
      if (bundled.has(id) || !shares)
        if (add({ rule: "bundle-trunk", edge: id, detail: `bundle ${b.id}: the route is in two bundles or does not start with the trunk` })) return out;
      bundled.add(id);
    }
  }
  for (const level of result.levels ?? []) {
    const itemOf = new Map<string, string>();
    for (const it of level.items) for (const n of it.nodes) itemOf.set(n, it.id);
    if (itemOf.size !== graph.nodes.length)
      if (add({ rule: "counts-sum", detail: `level ${level.depth}: the items hold ${itemOf.size} of ${graph.nodes.length} nodes` }))
        return out;
    let between = 0;
    for (const e of graph.edges) if (itemOf.get(e.source.node) !== itemOf.get(e.target.node)) between++;
    const sum = level.links.reduce((s, l) => s + l.count, 0);
    if (sum !== between)
      if (add({ rule: "counts-sum", detail: `level ${level.depth}: the links count ${sum} edges, not ${between}` })) return out;
  }
  return out;
}
