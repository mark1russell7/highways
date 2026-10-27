import { center, dist, type Point } from "../../geom.ts";
import { nodeIndex, type Node } from "../../model.ts";
import { orderLanes } from "../../segments.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { tidyPlan } from "../base.ts";
import { memberAt, type Highway, type HighwayInput, type HighwayMember, type HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";

/** The options of the highway strategy `spiral` (HWY-017 with EDA-035 of the notes). */
export interface SpiralOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The spiral angle, in degrees: the largest angle between a branch and the line to the root. The default is 25. */
  readonly alpha: number;
  /** A node with this number of edges or more gets a spiral tree. The default is 4. */
  readonly minTargets: number;
  /** The number of points of the arc of each branch. The default is 4. */
  readonly arc: number;
}

/** The default options of the strategy `spiral`. */
export const SPIRAL_DEFAULTS: Readonly<Required<Omit<SpiralOptions, "margin" | "k">>> = Object.freeze({ alpha: 25, minTargets: 4, arc: 4 });

/** One node of a spiral tree, in polar coordinates around the root. A leaf has an edge, and a join has two children. */
export interface SpiralNode {
  readonly r: number;
  readonly theta: number;
  readonly point: Point;
  /** A join with this node is this distance or more nearer to the root than the node. A leaf keeps its box clear so. A join has 0. */
  readonly clear: number;
  readonly edge?: string;
  readonly children: readonly SpiralNode[];
}

const TAU = 2 * Math.PI;

/** This function gives the angle `t` in the range from 0 to 2 pi. */
const wrap = (t: number): number => ((t % TAU) + TAU) % TAU;

/**
 * This function gives the join of the nodes `p` and `q` of a spiral tree with the angle `alpha`. It gives `undefined` when no join is possible.
 * Each node can reach the points inside its two spirals toward the root: `|theta - theta_p| <= tan(alpha) ln(r_p / r)`.
 * The join is the point farthest from the root that both nodes reach, and that is `clear` nearer to the root than each node.
 * At that radius, the join is at the middle of the angles that both nodes reach.
 */
export function spiralJoin(p: SpiralNode, q: SpiralNode, alpha: number, root: Point): { r: number; theta: number; point: Point } | undefined {
  const t = Math.tan(alpha);
  // The angle from p to q, counterclockwise, in the range from -pi to pi.
  let delta = wrap(q.theta - p.theta);
  if (delta > Math.PI) delta -= TAU;
  const gap = Math.abs(delta);
  if (gap >= Math.PI || t <= 0) return undefined;
  const near = p.r <= q.r ? p : q;
  const far = p.r <= q.r ? q : p;
  const meet = t * Math.log(far.r / near.r) >= gap ? near.r : Math.exp((Math.log(p.r) + Math.log(q.r) - gap / t) / 2);
  const r = Math.min(meet, p.r - p.clear, q.r - q.clear);
  if (!(r > 0)) return undefined;
  // In the frame where p is at 0 and q is at `gap`, p reaches [-rp, rp] and q reaches [gap - rq, gap + rq].
  const rp = t * Math.log(p.r / r);
  const rq = t * Math.log(q.r / r);
  const lo = Math.max(-rp, gap - rq);
  const hi = Math.min(rp, gap + rq);
  if (lo > hi + 1e-9) return undefined;
  const theta = wrap(p.theta + Math.sign(delta) * ((lo + hi) / 2));
  return { r, theta, point: { x: root.x + r * Math.cos(theta), y: root.y + r * Math.sin(theta) } };
}

/**
 * This function gives the spiral tree of the leaves around the root (Buchin, Speckmann and Verbeek 2011), with the greedy sweep.
 * The sweep goes from the far leaves to the root. A leaf joins the wavefront at its radius. Two nodes that are next to each other in angle join at their join point.
 * The join with the largest radius goes first. No join occurs below the radius `rMin`. The function gives the nodes of the wavefront at the end.
 */
export function spiralTree(leaves: readonly SpiralNode[], alpha: number, root: Point, rMin: number): SpiralNode[] {
  const waiting = [...leaves].sort((a, b) => b.r - a.r || (a.edge! < b.edge! ? -1 : 1));
  const front: SpiralNode[] = [];
  const insert = (n: SpiralNode): void => {
    let i = 0;
    while (i < front.length && front[i]!.theta <= n.theta) i++;
    front.splice(i, 0, n);
  };
  for (;;) {
    let best: { i: number; r: number; theta: number; point: Point } | undefined;
    if (front.length >= 2)
      for (let i = 0; i < front.length; i++) {
        if (front.length === 2 && i === 1) break;
        const j = (i + 1) % front.length;
        const join = spiralJoin(front[i]!, front[j]!, alpha, root);
        if (join && join.r >= rMin && (!best || join.r > best.r)) best = { i, ...join };
      }
    const next = waiting[0];
    if (next && (!best || next.r >= best.r)) {
      insert(waiting.shift()!);
      continue;
    }
    if (!best) return front;
    const i = best.i;
    const j = (i + 1) % front.length;
    const node: SpiralNode = { r: best.r, theta: best.theta, point: best.point, clear: 0, children: [front[i]!, front[j]!] };
    for (const k of [i, j].sort((a, b) => b - a)) front.splice(k, 1);
    insert(node);
  }
}

/** This function gives the leaves under a node of a spiral tree, in the order of the tree. */
function leavesOf(n: SpiralNode): string[] {
  return n.edge !== undefined ? [n.edge] : n.children.flatMap(leavesOf);
}

/**
 * This function gives the highways of the spiral trees (HWY-017, EDA-035). Each node with `minTargets` edges or more is the root of a fan.
 * The nodes with more edges go first, and each edge is in one fan at most. The far plug of each edge is a leaf of the tree of its fan.
 * Each branch of a tree with two leaves or more is a highway. Its spine is an arc of a logarithmic spiral, or a way through the corner graph where the arc hits a box.
 * An edge rides the branches from the root to its leaf, or from its leaf to the root when the root is its target.
 */
export function spiralPlan(input: HighwayInput, o: Readonly<SpiralOptions>): HighwayPlan {
  const graph = input.graph;
  const finder = new WayFinder(graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const pad = finder.margin / 2;
  const byId = nodeIndex(graph);
  const plugs = edgePlugs(graph);
  const degree = new Map<string, number>();
  for (const { edge } of plugs) {
    if (edge.source.node === edge.target.node) continue;
    for (const n of [edge.source.node, edge.target.node]) degree.set(n, (degree.get(n) ?? 0) + 1);
  }
  const hubs = [...degree].filter(([, d]) => d >= o.minTargets).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const alpha = (Math.max(1, Math.min(80, o.alpha)) * Math.PI) / 180;
  const arcPoints = Math.max(2, Math.round(o.arc));
  const used = new Set<string>();
  const highways: Highway[] = [];

  /** This function gives the spine from the point `a` to the point `b`. The spine is a spiral arc in free space, or a way through the corner graph. */
  const spineOf = (root: Point, a: { r: number; theta: number; point: Point }, b: { r: number; theta: number; point: Point }): Point[] | undefined => {
    if (finder.obstacles.inside(a.point, pad) || finder.obstacles.inside(b.point, pad)) return undefined;
    let dt = wrap(b.theta - a.theta);
    if (dt > Math.PI) dt -= TAU;
    const arc: Point[] = [a.point];
    for (let s = 1; s < arcPoints - 1; s++) {
      const u = s / (arcPoints - 1);
      const r = a.r * Math.pow(b.r / a.r, u);
      const theta = a.theta + dt * u;
      arc.push({ x: root.x + r * Math.cos(theta), y: root.y + r * Math.sin(theta) });
    }
    arc.push(b.point);
    if (finder.obstacles.clearPath(arc, pad)) return arc;
    const way = finder.corners.path(a.point, b.point);
    return way ? finder.corners.pull(way) : undefined;
  };

  for (const [hubId] of hubs) {
    const hub: Node | undefined = byId.get(hubId);
    if (!hub) continue;
    const root = center(hub.box);
    const rMin = Math.hypot(hub.box.w, hub.box.h) / 2 + 2 * finder.margin;
    const fan = plugs.filter(({ edge }) => !used.has(edge.id) && edge.source.node !== edge.target.node && (edge.source.node === hubId || edge.target.node === hubId));
    if (fan.length < o.minTargets) continue;
    const out = new Map<string, boolean>();
    const near = new Map<string, Point>();
    const far = new Map<string, Point>();
    const leaves: SpiralNode[] = fan.map(({ edge, ps, pt }) => {
      const outward = edge.source.node === hubId;
      out.set(edge.id, outward);
      near.set(edge.id, outward ? ps.point : pt.point);
      const p = outward ? pt.point : ps.point;
      far.set(edge.id, p);
      const box = byId.get(outward ? edge.target.node : edge.source.node)!.box;
      const clear = Math.hypot(box.w, box.h) / 2 + finder.margin;
      return { r: Math.max(1e-6, dist(root, p)), theta: wrap(Math.atan2(p.y - root.y, p.x - root.x)), point: p, clear, edge: edge.id, children: [] };
    });
    for (const { edge } of fan) used.add(edge.id);
    const tops = spiralTree(leaves, alpha, root, rMin);
    // The branches: each link from a node to a child with two leaves or more, from the root down.
    interface Branch {
      readonly spine: Point[];
      readonly edges: string[];
      readonly depth: number;
    }
    const branches: Branch[] = [];
    const walk = (parent: { r: number; theta: number; point: Point }, child: SpiralNode, depth: number): void => {
      if (child.edge !== undefined) return;
      const spine = dist(parent.point, child.point) > finder.margin ? spineOf(root, parent, child) : undefined;
      if (spine && spine.length >= 2) branches.push({ spine, edges: leavesOf(child), depth });
      for (const c of child.children) if (dist(c.point, child.point) > 1e-9) walk(child, c, depth + 1);
      // A child at the point of the join (the nearer node of a join) goes on from the same point.
      for (const c of child.children) if (dist(c.point, child.point) <= 1e-9) for (const g of c.children) walk(child, g, depth + 1);
    };
    for (const top of tops) {
      if (top.edge !== undefined) continue;
      // The trunk from the hub: it starts at the radius `rMin` on the line to the top node.
      const start = { r: rMin, theta: top.theta, point: { x: root.x + rMin * Math.cos(top.theta), y: root.y + rMin * Math.sin(top.theta) } };
      walk(top.r > rMin + finder.margin ? start : top, top, 0);
    }
    for (const b of branches) {
      if (b.edges.length < 2) continue;
      const last = b.spine.length - 1;
      const tripOf = (edge: string): Point[] => [near.get(edge)!, ...b.spine, far.get(edge)!];
      const lanes = orderLanes(
        b.spine,
        b.edges.map((edge) => ({ edge, points: tripOf(edge) })),
        "bundle",
      );
      const members: HighwayMember[] = lanes.map((edge) => (out.get(edge) ? memberAt(b.spine, edge, 0, last, b.depth) : memberAt(b.spine, edge, last, 0, -b.depth)));
      highways.push({ id: `h${highways.length}`, key: `spiral:${hubId}`, spine: b.spine, lanes, members });
    }
  }
  return tidyPlan({ highways });
}
