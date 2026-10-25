import { dist, inflate, segmentHitsRect, type Point } from "./geom.ts";
import { Grid } from "./grid.ts";
import type { Node } from "./model.ts";

/** The nodes as obstacles, with a grid for fast tests. */
export class Obstacles {
  readonly #grid: Grid<Node>;

  /** This constructor indexes the boxes of the nodes. */
  constructor(nodes: readonly Node[], cell: number) {
    this.#grid = new Grid<Node>(cell);
    for (const n of nodes) this.#grid.add(n, n.box);
  }

  /** This method tells if the segment `ab` stays out of each box, made larger by `pad`. The nodes in `skip` do not count. */
  clear(a: Point, b: Point, pad: number, skip?: ReadonlySet<Node>): boolean {
    let ok = true;
    this.#grid.querySegment(a, b, pad, (n) => {
      if (ok && !skip?.has(n)) {
        const x = n.box;
        if (segmentHitsRect(a, b, x.x - pad, x.y - pad, x.x + x.w + pad, x.y + x.h + pad)) ok = false;
      }
    });
    return ok;
  }

  /** This method tells if the polyline stays out of each box, made larger by `pad`. The nodes in `skip` do not count. */
  clearPath(p: readonly Point[], pad: number, skip?: ReadonlySet<Node>): boolean {
    for (let i = 1; i < p.length; i++) if (!this.clear(p[i - 1]!, p[i]!, pad, skip)) return false;
    return true;
  }

  /** This method tells if the point is inside a box, made larger by `pad`. The node `skip` does not count. */
  inside(p: Point, pad: number, skip?: Node): boolean {
    let hit = false;
    this.#grid.query({ x: p.x, y: p.y, w: 0, h: 0 }, (n) => {
      if (!hit && n !== skip) {
        const b = n.box;
        hit = p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad;
      }
    });
    return hit;
  }
}

/** The options of the corner graph. */
export interface CornerGraphOptions {
  /** The distance from a box to its corners. */
  readonly margin: number;
  /** The number of visible neighbours of each corner. */
  readonly k: number;
  /**
   * The spacing of a lattice of free points over the plane, in units of the mean node size. The default is 3, and 0 turns it off.
   * The lattice links groups of nodes across empty space. Without it, the nearest corners of a group are all in that group.
   */
  readonly lattice?: number;
}

/**
 * A sparse visibility graph. Its vertices are the corners of the boxes, made larger by `margin`.
 * Each corner links to its `k` nearest corners that it can see. A lattice of free points links the groups of nodes.
 * A path goes from corner to corner around the boxes.
 * The obstacle test uses half of the margin, so a path keeps a clearance of at least half of the margin.
 */
export class CornerGraph {
  readonly points: Point[] = [];
  readonly #adj: number[][] = [];
  // The length of each link, in the order of #adj.
  readonly #len: number[][] = [];
  readonly #obstacles: Obstacles;
  readonly #pointGrid: Grid<number>;
  readonly #cell: number;
  readonly #pad: number;
  readonly #k: number;
  // The work arrays of A*, made once and cleared by a stamp.
  #g = new Float64Array(0);
  #parent = new Int32Array(0);
  #open = new Int32Array(0);
  #closed = new Int32Array(0);
  #stamp = 0;
  // The stamp of the last call of nearestVisible that tested each corner.
  #tested = new Int32Array(0);
  #testStamp = 0;

  /** This constructor makes the graph of the nodes. */
  constructor(nodes: readonly Node[], obstacles: Obstacles, options: CornerGraphOptions) {
    this.#obstacles = obstacles;
    this.#pad = options.margin / 2;
    this.#k = options.k;
    let size = 0;
    for (const n of nodes) size += (n.box.w + n.box.h) / 2;
    this.#cell = Math.max(1, size / Math.max(1, nodes.length) + 2 * options.margin);
    this.#pointGrid = new Grid<number>(this.#cell);
    for (const n of nodes) {
      const b = inflate(n.box, options.margin);
      for (const c of [
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h },
        { x: b.x, y: b.y + b.h },
      ]) {
        if (!obstacles.inside(c, this.#pad)) this.#addPoint(c);
      }
    }
    const spacing = (options.lattice ?? 3) * this.#cell;
    if (spacing > 0 && nodes.length > 0) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const n of nodes) {
        x0 = Math.min(x0, n.box.x);
        y0 = Math.min(y0, n.box.y);
        x1 = Math.max(x1, n.box.x + n.box.w);
        y1 = Math.max(y1, n.box.y + n.box.h);
      }
      for (let x = x0 - spacing / 2; x <= x1 + spacing; x += spacing) {
        for (let y = y0 - spacing / 2; y <= y1 + spacing; y += spacing) {
          const c = { x, y };
          if (!obstacles.inside(c, options.margin)) this.#addPoint(c);
        }
      }
    }
    const links: Set<number>[] = this.points.map(() => new Set<number>());
    for (let i = 0; i < this.points.length; i++) {
      for (const j of this.nearestVisible(this.points[i]!, this.#k, i)) {
        links[i]!.add(j);
        links[j]!.add(i);
      }
    }
    links.forEach((s, i) => {
      const adj = [...s].sort((a, b) => a - b);
      this.#adj.push(adj);
      this.#len.push(adj.map((j) => dist(this.points[i]!, this.points[j]!)));
    });
  }

  #addPoint(c: Point): void {
    this.#pointGrid.add(this.points.length, { x: c.x, y: c.y, w: 0, h: 0 });
    this.points.push(c);
  }

  /** This method gives the number of links of the graph. */
  get linkCount(): number {
    let n = 0;
    for (const a of this.#adj) n += a.length;
    return n / 2;
  }

  /** This method gives the index of the corner nearest to `p`, seen or not, or -1 when the graph has no corner near it. */
  nearest(p: Point): number {
    for (let r = this.#cell; r <= this.#cell * 64; r *= 2) {
      let best = -1;
      let bestD = Infinity;
      this.#pointGrid.query({ x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r }, (j) => {
        const d = dist(p, this.points[j]!);
        if (d < bestD || (d === bestD && j < best)) {
          bestD = d;
          best = j;
        }
      });
      // A corner beyond r can be nearer than a corner in a corner of the square. Within r, none is.
      if (best >= 0 && bestD <= r) return best;
    }
    return -1;
  }

  /** This method gives at most `k` corners that `p` can see, nearest first. The corner `self` does not count. */
  nearestVisible(p: Point, k: number, self = -1): number[] {
    const out: number[] = [];
    if (this.#tested.length < this.points.length) this.#tested = new Int32Array(this.points.length);
    const tested = this.#tested;
    const stamp = ++this.#testStamp;
    for (let r = this.#cell; r <= this.#cell * 8; r *= 2) {
      const cands: [number, number][] = [];
      this.#pointGrid.query({ x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r }, (j) => {
        if (j !== self && tested[j] !== stamp) cands.push([dist(p, this.points[j]!), j]);
      });
      cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const [d, j] of cands) {
        // A corner beyond r can be nearer than a corner of the next ring, so it waits for that ring.
        if (d > r) break;
        tested[j] = stamp;
        if (this.#obstacles.clear(p, this.points[j]!, this.#pad)) out.push(j);
        if (out.length >= k) return out;
      }
    }
    return out;
  }

  /**
   * This method gives a shortest path from `from` to `to` in the graph (A*), with the two points as its ends.
   * It gives `undefined` when the graph links no corner near `from` to a corner near `to`.
   * The function `cost` can change the cost of the link from corner `i` to corner `j`, of length `d`.
   * It must give at least `floor` × `d`, so that the estimate of A* stays below the true cost.
   */
  path(from: Point, to: Point, cost?: (i: number, j: number, d: number) => number, floor: number = 1): Point[] | undefined {
    if (this.#obstacles.clear(from, to, this.#pad)) return [from, to];
    const n = this.points.length;
    if (this.#g.length < n) {
      this.#g = new Float64Array(n);
      this.#parent = new Int32Array(n);
      this.#open = new Int32Array(n);
      this.#closed = new Int32Array(n);
    }
    const stamp = ++this.#stamp;
    const goal = new Map<number, number>();
    for (const j of this.nearestVisible(to, this.#k * 2)) goal.set(j, dist(this.points[j]!, to));
    if (goal.size === 0) return undefined;
    const heap = new MinHeap();
    const h = (i: number): number => floor * dist(this.points[i]!, to);
    const relax = (j: number, g: number, parent: number): void => {
      if (this.#closed[j] === stamp) return;
      if (this.#open[j] === stamp && this.#g[j]! <= g) return;
      this.#open[j] = stamp;
      this.#g[j] = g;
      this.#parent[j] = parent;
      heap.push(g + h(j), j);
    };
    for (const j of this.nearestVisible(from, this.#k * 2)) relax(j, dist(from, this.points[j]!), -1);
    let best = Infinity;
    let bestEnd = -1;
    while (heap.size > 0) {
      if (heap.topKey >= best) break;
      const i = heap.pop();
      if (this.#closed[i] === stamp) continue;
      this.#closed[i] = stamp;
      const gi = this.#g[i]!;
      const tail = goal.get(i);
      if (tail !== undefined && gi + tail < best) {
        best = gi + tail;
        bestEnd = i;
      }
      const adj = this.#adj[i]!;
      const len = this.#len[i]!;
      for (let m = 0; m < adj.length; m++) {
        const j = adj[m]!;
        const d = len[m]!;
        relax(j, gi + (cost ? cost(i, j, d) : d), i);
      }
    }
    if (bestEnd < 0) return undefined;
    const out: Point[] = [to];
    for (let i = bestEnd; i >= 0; i = this.#parent[i]!) out.push(this.points[i]!);
    out.push(from);
    return out.reverse();
  }

  /** This method removes the vertices that a later vertex makes needless: from each vertex, it goes to the farthest vertex in view. */
  pull(p: readonly Point[], lookahead = 16): Point[] {
    if (p.length < 3) return [...p];
    const out: Point[] = [p[0]!];
    let i = 0;
    while (i < p.length - 1) {
      let j = Math.min(p.length - 1, i + lookahead);
      while (j > i + 1 && !this.#obstacles.clear(p[i]!, p[j]!, this.#pad)) j--;
      out.push(p[j]!);
      i = j;
    }
    return out;
  }
}

/** A binary min-heap of (key, value) pairs. Equal keys come out by the smaller value, so the order is deterministic. */
class MinHeap {
  readonly #k: number[] = [];
  readonly #v: number[] = [];

  get size(): number {
    return this.#k.length;
  }

  #less(a: number, b: number): boolean {
    return this.#k[a]! < this.#k[b]! || (this.#k[a] === this.#k[b] && this.#v[a]! < this.#v[b]!);
  }

  #swap(a: number, b: number): void {
    const k = this.#k[a]!;
    this.#k[a] = this.#k[b]!;
    this.#k[b] = k;
    const v = this.#v[a]!;
    this.#v[a] = this.#v[b]!;
    this.#v[b] = v;
  }

  /** The smallest key. */
  get topKey(): number {
    return this.#k[0]!;
  }

  push(key: number, value: number): void {
    this.#k.push(key);
    this.#v.push(value);
    let i = this.#k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.#less(i, p)) break;
      this.#swap(i, p);
      i = p;
    }
  }

  /** This method removes the pair with the smallest key and gives its value. */
  pop(): number {
    const top = this.#v[0]!;
    const k = this.#k.pop()!;
    const v = this.#v.pop()!;
    if (this.#k.length > 0) {
      this.#k[0] = k;
      this.#v[0] = v;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.#k.length && this.#less(l, m)) m = l;
        if (r < this.#k.length && this.#less(r, m)) m = r;
        if (m === i) break;
        this.#swap(i, m);
        i = m;
      }
    }
    return top;
  }
}
