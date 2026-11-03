/**
 * The highway strategy `grassfire` (NAT-034): corridors on the medial axis of the free space, after Blum (1967).
 * A fire from all boxes burns through a grid. The fronts of two boxes meet on a line that is far from both. These lines are the road graph, and short spurs join the plugs.
 */
import { dist, inflate, type Box, type Point } from "../../geom.ts";
import { Grid } from "../../grid.ts";
import type { Node } from "../../model.ts";
import { CornerGraph, type Obstacles } from "../../visibility.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs, sharedStretches, type KeyedWay } from "../stretches.ts";

/** The options of the highway strategy `grassfire` (NAT-034). */
export interface GrassfireOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The price of a link near a box: a link costs `length × (1 + lambda / clearance)`, with the clearance in mean node sizes, from 0 to 4. The default is 1. */
  readonly lambda: number;
  /** The largest length of the first and the last link of a way, in mean node sizes, from 1 to 5. The default is 3. A way with a longer spur stays off the axis. */
  readonly spur: number;
  /** The size of a grid cell, in mean node sizes, from 0.25 to 1. The default is 0.5. */
  readonly cell: number;
  /** The spacing of the points of the road graph, in mean node sizes, from 0.5 to 4. The default is 1.5. */
  readonly spacing: number;
  /** The cost of a used link, as a share of its price, from 0.2 to 1. The default is 0.5. */
  readonly discount: number;
  /** A highway has this number of edges or more. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `grassfire`. */
export const GRASSFIRE_DEFAULTS: Readonly<Required<Omit<GrassfireOptions, "margin" | "k">>> = Object.freeze({ lambda: 1, spur: 3, cell: 0.5, spacing: 1.5, discount: 0.5, minSize: 2 });

/** The largest number of cells on one side of the grid. A larger board gets larger cells. */
const MAX_SIDE = 512;

/** The length of a diagonal step of the fire. */
const DIAGONAL = 1.4142135623730951;

/** The fire over a grid: the distance to the nearest box and the index of that box, for each cell. */
export interface Fire {
  readonly w: number;
  readonly h: number;
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
  readonly clearance: Float64Array;
  readonly label: Int32Array;
}

/**
 * This function burns the free cells of a grid over the boxes. Two passes of a chamfer transform give each cell its distance to the nearest box, and that box.
 * The grid goes `pad` past the bounds of the boxes. Each pass is `O(G)`.
 */
export function burn(boxes: readonly Box[], cellSize: number, pad: number): Fire {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad;
  const cell = Math.max(cellSize, (x1 - x0) / MAX_SIDE, (y1 - y0) / MAX_SIDE, 1e-6);
  const w = Math.max(1, Math.ceil((x1 - x0) / cell));
  const h = Math.max(1, Math.ceil((y1 - y0) / cell));
  const clearance = new Float64Array(w * h).fill(Infinity);
  const label = new Int32Array(w * h).fill(-1);
  boxes.forEach((b, n) => {
    const cx0 = Math.max(0, Math.floor((b.x - x0) / cell));
    const cy0 = Math.max(0, Math.floor((b.y - y0) / cell));
    const cx1 = Math.min(w - 1, Math.floor((b.x + b.w - x0) / cell));
    const cy1 = Math.min(h - 1, Math.floor((b.y + b.h - y0) / cell));
    for (let y = cy0; y <= cy1; y++)
      for (let x = cx0; x <= cx1; x++) {
        const c = y * w + x;
        if (label[c]! < 0) {
          label[c] = n;
          clearance[c] = 0;
        }
      }
  });
  const relax = (c: number, from: number, step: number): void => {
    const v = clearance[from]! + step * cell;
    if (v < clearance[c]!) {
      clearance[c] = v;
      label[c] = label[from]!;
    }
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = y * w + x;
      if (x > 0) relax(c, c - 1, 1);
      if (y > 0) relax(c, c - w, 1);
      if (y > 0 && x > 0) relax(c, c - w - 1, DIAGONAL);
      if (y > 0 && x + 1 < w) relax(c, c - w + 1, DIAGONAL);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const c = y * w + x;
      if (x + 1 < w) relax(c, c + 1, 1);
      if (y + 1 < h) relax(c, c + w, 1);
      if (y + 1 < h && x + 1 < w) relax(c, c + w + 1, DIAGONAL);
      if (y + 1 < h && x > 0) relax(c, c + w - 1, DIAGONAL);
    }
  return { w, h, cell, x0, y0, clearance, label };
}

/** This function gives the distance of a point to the nearest box, from the cell of the point. A point off the grid gives the value of the nearest cell. */
export function clearanceAt(fire: Fire, p: Point): number {
  const x = Math.min(fire.w - 1, Math.max(0, Math.floor((p.x - fire.x0) / fire.cell)));
  const y = Math.min(fire.h - 1, Math.max(0, Math.floor((p.y - fire.y0) / fire.cell)));
  return fire.clearance[y * fire.w + x]!;
}

/**
 * This function gives points on the medial axis: the free cells where the fronts of two boxes meet (the lines of the Voronoi diagram of the boxes).
 * A point stays when no earlier point is nearer than `spacing`, in the order of the rows.
 */
export function axisPoints(fire: Fire, spacing: number): Point[] {
  const { w, h, cell, x0, y0, label, clearance } = fire;
  const out: Point[] = [];
  const near = new Grid<Point>(Math.max(1e-6, spacing));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = y * w + x;
      if (clearance[c]! <= 0) continue;
      const right = x + 1 < w && label[c + 1] !== label[c];
      const down = y + 1 < h && label[c + w] !== label[c];
      if (!right && !down) continue;
      const p = { x: x0 + (x + 0.5) * cell, y: y0 + (y + 0.5) * cell };
      let free = true;
      near.query({ x: p.x - spacing, y: p.y - spacing, w: 2 * spacing, h: 2 * spacing }, (q) => {
        if (dist(p, q) < spacing) free = false;
      });
      if (!free) continue;
      out.push(p);
      near.add(p, { x: p.x, y: p.y, w: 0, h: 0 });
    }
  return out;
}

/** This function gives the road graph on the axis of the boxes, and the fire. The graph has no corner of a box. */
export function axisGraph(nodes: readonly Node[], obstacles: Obstacles, o: Readonly<GrassfireOptions>, margin: number, k: number): { roads: CornerGraph; fire: Fire; unit: number } {
  let size = 0;
  for (const n of nodes) size += (n.box.w + n.box.h) / 2;
  const unit = Math.max(1, size / Math.max(1, nodes.length));
  const fire = burn(nodes.map((n) => inflate(n.box, margin)), o.cell * unit, 6 * unit);
  const points = axisPoints(fire, Math.max(o.spacing * unit, 2 * fire.cell));
  return { roads: new CornerGraph(nodes, obstacles, { margin, k, cones: true, points }), fire, unit };
}

/**
 * This function gives the highways on the medial axis of NAT-034. The edges route one after the other on the road graph, the longest first.
 * A link costs `length × (1 + lambda / clearance)`, and a used link costs `discount` times that price. The stretches of two edges or more are highways.
 * The spines keep their points, so a highway stays in the middle of its gap. A way with a spur longer than `spur` stays off the axis.
 */
export function grassfirePlan(input: HighwayInput, o: Readonly<GrassfireOptions>): HighwayPlan {
  const margin = o.margin ?? 5;
  const k = o.k ?? 8;
  const nodes = input.graph.nodes;
  if (nodes.length === 0) return { highways: [] };
  const finder = new WayFinder(nodes, { margin, k });
  const { roads, fire, unit } = axisGraph(nodes, finder.obstacles, o, margin, k);
  const M = roads.points.length;
  const key = (i: number, j: number): number => (i < j ? i * M + j : j * M + i);
  const prices = new Map<number, number>();
  const priceOf = (i: number, j: number): number => {
    const n = key(i, j);
    let v = prices.get(n);
    if (v === undefined) {
      const a = roads.points[i]!;
      const b = roads.points[j]!;
      const room = Math.max(fire.cell, clearanceAt(fire, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) / unit;
      prices.set(n, (v = 1 + o.lambda / room));
    }
    return v;
  };
  const share = Math.min(1, Math.max(0.05, o.discount));
  const used = new Set<number>();
  const cost = (i: number, j: number, d: number): number => d * priceOf(i, j) * (used.has(key(i, j)) ? share : 1);
  const id = new Map<Point, number>();
  roads.points.forEach((p, i) => id.set(p, i));
  const spur = o.spur * unit;
  const ends = edgePlugs(input.graph).map(({ edge, ps, pt }) => ({ edge, a: finder.out(ps), b: finder.out(pt) }));
  ends.sort((p, q) => dist(q.a, q.b) - dist(p.a, p.b) || (p.edge.id < q.edge.id ? -1 : p.edge.id > q.edge.id ? 1 : 0));
  const ways: KeyedWay[] = [];
  for (const { edge, a, b } of ends) {
    if (finder.obstacles.clear(a, b, finder.margin)) continue;
    const way = roads.pathThrough(a, b, cost, share);
    if (!way || way.length < 3) continue;
    if (dist(way[0]!, way[1]!) > spur || dist(way[way.length - 2]!, way[way.length - 1]!) > spur) continue;
    for (let i = 2; i < way.length - 1; i++) used.add(key(id.get(way[i - 1]!)!, id.get(way[i]!)!));
    ways.push({ edge: edge.id, key: "road", points: way });
  }
  const onAxis = (a: Point, b: Point): boolean => id.has(a) && id.has(b);
  return sharedStretches(ways, { minSize: o.minSize, link: onAxis });
}
