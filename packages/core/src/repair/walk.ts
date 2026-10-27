import { TOLERANCE } from "../bench/properties.ts";
import { dist, inflate, segmentHitsBox, type Box, type Point } from "../geom.ts";
import type { Grid } from "../grid.ts";
import type { Node } from "../model.ts";
import { nearestSide } from "../plugs.ts";

/** The sides of a box, as the indexes of two corners: north, east, south and west. */
const SIDES: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [3, 2],
  [0, 3],
];
const SIDE_INDEX = { north: 0, east: 1, south: 2, west: 3 } as const;

/** This function gives the four corners of a box: top left, top right, bottom right and bottom left. */
function corners(b: Box): Point[] {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ];
}

const EPS = 1e-6;
const keyOf = (p: Point): string => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;

/** This function tells if the point `c` is on the axis-parallel segment `pq`. */
function onSide(c: Point, p: Point, q: Point): boolean {
  if (Math.abs(p.y - q.y) <= EPS) return Math.abs(c.y - p.y) <= EPS && c.x >= Math.min(p.x, q.x) - EPS && c.x <= Math.max(p.x, q.x) + EPS;
  return Math.abs(c.x - p.x) <= EPS && c.y >= Math.min(p.y, q.y) - EPS && c.y <= Math.max(p.y, q.y) + EPS;
}

/** This function drops each point that is on the straight line between the point before it and the point after it. */
function straighten(p: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const v of p) {
    if (out.length > 0 && dist(out[out.length - 1]!, v) <= EPS) continue;
    while (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const cross = (b.x - a.x) * (v.y - b.y) - (b.y - a.y) * (v.x - b.x);
      const dot = (b.x - a.x) * (v.x - b.x) + (b.y - a.y) * (v.y - b.y);
      if (Math.abs(cross) > EPS || dot < 0) break;
      out.pop();
    }
    out.push(v);
  }
  return out;
}

/**
 * The boundary walk of the repair step (RULE-046): a graph of the sides of the boxes.
 * The vertices are the corners of the boxes. The edges are the parts of each side between two corners on it.
 * A walk on this graph goes along the boundaries of the boxes, and not through a box. Thus it joins two boxes also when the boxes touch.
 * The graph drops each part of a side that goes through another box, so overlapping boxes do not open a way.
 */
export class BoundaryWalk {
  readonly #points: Point[] = [];
  readonly #index = new Map<string, number>();
  readonly #next: { readonly to: number; readonly d: number }[][] = [];
  /** The vertices on each side of each node, in the order along the side. */
  readonly #sides = new Map<Node, number[][]>();

  /** This constructor makes the graph of the sides of the nodes. `grid` holds the nodes by their boxes. */
  constructor(nodes: readonly Node[], grid: Grid<Node>) {
    for (const n of nodes) for (const c of corners(n.box)) this.#vertex(c);
    for (const n of nodes) {
      const cs = corners(n.box);
      const lists: number[][] = [];
      for (const [i, j] of SIDES) {
        const p = cs[i]!;
        const q = cs[j]!;
        const on = new Set<number>([this.#vertex(p), this.#vertex(q)]);
        const area = { x: Math.min(p.x, q.x) - 1, y: Math.min(p.y, q.y) - 1, w: Math.abs(q.x - p.x) + 2, h: Math.abs(q.y - p.y) + 2 };
        grid.query(area, (m) => {
          for (const c of corners(m.box)) if (onSide(c, p, q)) on.add(this.#vertex(c));
        });
        const list = [...on].sort((u, v) => dist(p, this.#points[u]!) - dist(p, this.#points[v]!) || u - v);
        lists.push(list);
        for (let k = 1; k < list.length; k++) {
          const u = list[k - 1]!;
          const v = list[k]!;
          const a = this.#points[u]!;
          const b = this.#points[v]!;
          if (dist(a, b) <= EPS || this.#blocked(grid, a, b)) continue;
          this.#link(u, v);
        }
      }
      this.#sides.set(n, lists);
    }
  }

  /** This method gives the index of the vertex at the point, and adds the vertex if it is new. */
  #vertex(p: Point): number {
    const k = keyOf(p);
    let i = this.#index.get(k);
    if (i === undefined) {
      i = this.#points.length;
      this.#points.push(p);
      this.#next.push([]);
      this.#index.set(k, i);
    }
    return i;
  }

  #link(u: number, v: number): void {
    const d = dist(this.#points[u]!, this.#points[v]!);
    if (this.#next[u]!.some((e) => e.to === v)) return;
    this.#next[u]!.push({ to: v, d });
    this.#next[v]!.push({ to: u, d });
  }

  /** This method tells if the segment goes through a box, as the rule `no-pass-through` tests it. */
  #blocked(grid: Grid<Node>, a: Point, b: Point): boolean {
    return grid.someSegment(a, b, 0, (n) => segmentHitsBox(a, b, inflate(n.box, -TOLERANCE)));
  }

  /** This method finds the side of `node` that is nearest to `p`. It gives the two vertices of that side that are next to `p`. */
  #around(node: Node, p: Point): number[] {
    const list = this.#sides.get(node)?.[SIDE_INDEX[nearestSide(node.box, p)]];
    if (!list || list.length === 0) return [];
    const from = this.#points[list[0]!]!;
    const at = dist(from, p);
    let k = 0;
    while (k < list.length && dist(from, this.#points[list[k]!]!) < at) k++;
    return [list[k - 1], list[k]].filter((v): v is number => v !== undefined);
  }

  /**
   * This method gives a way along the boundaries of the boxes. The way goes from the point `a` on the box of `s` to the point `b` on the box of `t`.
   * A point that is not on its box goes first to the nearest point of the boundary.
   * The method gives `undefined` when no way joins the two boxes.
   */
  path(a: Point, s: Node, b: Point, t: Node): Point[] | undefined {
    const a1 = nearestOnBoundary(s.box, a);
    const b1 = nearestOnBoundary(t.box, b);
    const n = this.#points.length;
    const src = n;
    const dst = n + 1;
    const extra = new Map<number, { readonly to: number; readonly d: number }[]>();
    const add = (u: number, v: number, d: number): void => {
      if (!extra.has(u)) extra.set(u, []);
      extra.get(u)!.push({ to: v, d });
    };
    for (const v of this.#around(s, a1)) add(src, v, dist(a1, this.#points[v]!));
    for (const v of this.#around(t, b1)) add(v, dst, dist(b1, this.#points[v]!));
    if (!extra.has(src)) return undefined;
    const pointOf = (i: number): Point => (i === src ? a1 : i === dst ? b1 : this.#points[i]!);
    const best = new Float64Array(n + 2).fill(Infinity);
    const prev = new Int32Array(n + 2).fill(-1);
    best[src] = 0;
    const heap: [number, number][] = [[0, src]];
    const less = (x: [number, number], y: [number, number]): boolean => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
    const pop = (): [number, number] => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && less(heap[l]!, heap[m]!)) m = l;
          if (r < heap.length && less(heap[r]!, heap[m]!)) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m]!, heap[i]!];
          i = m;
        }
      }
      return top;
    };
    const push = (x: [number, number]): void => {
      heap.push(x);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!less(heap[i]!, heap[p]!)) break;
        [heap[i], heap[p]] = [heap[p]!, heap[i]!];
        i = p;
      }
    };
    while (heap.length > 0) {
      const [d, u] = pop();
      if (d > best[u]!) continue;
      if (u === dst) break;
      const edges = [...(u < n ? this.#next[u]! : []), ...(extra.get(u) ?? [])];
      for (const e of edges) {
        const nd = d + e.d;
        if (nd < best[e.to]!) {
          best[e.to] = nd;
          prev[e.to] = u;
          push([nd, e.to]);
        }
      }
    }
    if (prev[dst] === -1) return undefined;
    const way: Point[] = [];
    for (let i = dst; i !== -1; i = prev[i]!) way.push(pointOf(i));
    way.reverse();
    return straighten([a, ...way, b]);
  }
}

/** This function gives the point of the boundary of the box that is nearest to `p`. A point on the boundary gives itself. */
export function nearestOnBoundary(box: Box, p: Point): Point {
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.w;
  const y1 = box.y + box.h;
  const inside = p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1;
  if (!inside) return { x: Math.min(x1, Math.max(x0, p.x)), y: Math.min(y1, Math.max(y0, p.y)) };
  const side = nearestSide(box, p);
  if (side === "north") return { x: p.x, y: y0 };
  if (side === "south") return { x: p.x, y: y1 };
  if (side === "west") return { x: x0, y: p.y };
  return { x: x1, y: p.y };
}
