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
    return this.hit(a, b, pad, skip) === undefined;
  }

  /**
   * This method gives a node whose box, made larger by `pad`, the segment `ab` goes into, or `undefined` when the segment is clear.
   * The nodes in `skip` do not count. The test stops at the first such node.
   */
  hit(a: Point, b: Point, pad: number, skip?: ReadonlySet<Node>): Node | undefined {
    let found: Node | undefined;
    this.#grid.someSegment(a, b, pad, (n) => {
      if (skip?.has(n) || !hits(a, b, n, pad)) return false;
      found = n;
      return true;
    });
    return found;
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

/** This function tells if the segment `ab` goes into the box of the node, made larger by `pad`. */
function hits(a: Point, b: Point, n: Node, pad: number): boolean {
  const x = n.box;
  return segmentHitsRect(a, b, x.x - pad, x.y - pad, x.x + x.w + pad, x.y + x.h + pad);
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
  // The corners in each bucket of the point grid, by the key of the bucket. A corner is in one bucket: the bucket of its point.
  readonly #buckets = new Map<number, number[]>();
  // The distance from the point of the last call of nearestVisible to each corner that the call found.
  #dist = new Float64Array(0);
  // The corners of one ring of nearestVisible, nearest first.
  readonly #near = new MinHeap();
  // The corners that each end of a path sees, by the coordinates of the end.
  readonly #endCache = new Map<string, number[]>();

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
    const j = this.points.length;
    this.#pointGrid.add(j, { x: c.x, y: c.y, w: 0, h: 0 });
    const key = bucketKey(Math.floor(c.x / this.#cell), Math.floor(c.y / this.#cell));
    const list = this.#buckets.get(key);
    if (list === undefined) this.#buckets.set(key, [j]);
    else list.push(j);
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
    return this.#nearestVisible(p, k, self, this.#pad);
  }

  /**
   * This method tests the corners in rings of radius `r` = 1, 2, 4 and 8 cells. In each ring, it tests the corners
   * within `r` that an earlier ring did not test, nearest first, and equal distances by index.
   * The ring of `r` takes the corners of the buckets that the square of side `2r` around `p` touches.
   * A corner of these buckets beyond `r` waits for the next ring. So the method visits each bucket one time.
   */
  #nearestVisible(p: Point, k: number, self: number, pad: number): number[] {
    const out: number[] = [];
    if (this.#dist.length < this.points.length) this.#dist = new Float64Array(this.points.length);
    const dd = this.#dist;
    const points = this.points;
    const cell = this.#cell;
    const blockers: Node[] = [];
    const now = this.#near;
    // The corners that the rings found beyond their radius. The next ring takes them.
    let wait: number[] = [];
    // The bucket range of the ring before. The first ring has none.
    let pi0 = 1;
    let pi1 = 0;
    let pj0 = 1;
    let pj1 = 0;
    for (let r = cell; r <= cell * 8; r *= 2) {
      // These bounds are the bounds of a query of the box at (p.x - r, p.y - r) with the side 2r.
      const x0 = p.x - r;
      const y0 = p.y - r;
      const i0 = Math.floor(x0 / cell);
      const j0 = Math.floor(y0 / cell);
      const i1 = Math.floor((x0 + 2 * r) / cell);
      const j1 = Math.floor((y0 + 2 * r) / cell);
      const later: number[] = [];
      now.clear();
      for (const j of wait) {
        if (dd[j]! > r) later.push(j);
        else now.add(dd[j]!, j);
      }
      for (let bi = i0; bi <= i1; bi++) {
        const before = bi >= pi0 && bi <= pi1;
        for (let bj = j0; bj <= j1; bj++) {
          if (before && bj >= pj0 && bj <= pj1) continue;
          const list = this.#buckets.get(bucketKey(bi, bj));
          if (list === undefined) continue;
          for (const j of list) {
            if (j === self) continue;
            const d = dist(p, points[j]!);
            dd[j] = d;
            if (d > r) later.push(j);
            else now.add(d, j);
          }
        }
      }
      // The heap gives the corners nearest first, and equal distances by index. A call often stops after a few corners.
      now.build();
      while (now.size > 0) {
        const j = now.pop();
        // A node that stopped an earlier segment often stops this segment too, so the test takes these nodes first.
        // The order of the nodes does not change the result.
        const q = points[j]!;
        let blocked = false;
        for (let b = 0; b < blockers.length && !blocked; b++) blocked = hits(p, q, blockers[b]!, pad);
        if (blocked) continue;
        const hit = this.#obstacles.hit(p, q, pad);
        if (hit !== undefined) blockers.push(hit);
        else {
          out.push(j);
          if (out.length >= k) return out;
        }
      }
      wait = later;
      pi0 = i0;
      pi1 = i1;
      pj0 = j0;
      pj1 = j1;
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
    for (const j of this.#ends(to)) goal.set(j, dist(this.points[j]!, to));
    if (goal.size === 0) return undefined;
    const heap = new MinHeap();
    const points = this.points;
    const G = this.#g;
    const parentOf = this.#parent;
    const open = this.#open;
    const closed = this.#closed;
    const relax = (j: number, g: number, parent: number): void => {
      if (closed[j] === stamp) return;
      if (open[j] === stamp && G[j]! <= g) return;
      open[j] = stamp;
      G[j] = g;
      parentOf[j] = parent;
      heap.push(g + floor * dist(points[j]!, to), j);
    };
    for (const j of this.#ends(from)) relax(j, dist(from, points[j]!), -1);
    let best = Infinity;
    let bestEnd = -1;
    while (heap.size > 0) {
      if (heap.topKey >= best) break;
      const i = heap.pop();
      if (closed[i] === stamp) continue;
      closed[i] = stamp;
      const gi = G[i]!;
      const tail = goal.get(i);
      if (tail !== undefined && gi + tail < best) {
        best = gi + tail;
        bestEnd = i;
      }
      const adj = this.#adj[i]!;
      const len = this.#len[i]!;
      for (let m = 0; m < adj.length; m++) {
        const j = adj[m]!;
        if (closed[j] === stamp) continue;
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

  /**
   * This method gives the corners that an end of a path can see. An end near a box sees no corner with the clearance.
   * Then the end takes the corners that it sees without the clearance, so the path does not cut through the boxes.
   * The graph does not change, so the method keeps the corners of each end.
   */
  #ends(p: Point): number[] {
    const key = `${p.x},${p.y}`;
    let out = this.#endCache.get(key);
    if (!out) {
      out = this.nearestVisible(p, this.#k * 2);
      if (out.length === 0) out = this.#nearestVisible(p, this.#k * 2, -1, 0);
      this.#endCache.set(key, out);
    }
    return out;
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

/** This function packs the two indices of a bucket into one number. Each index stays within ±2^20. */
const bucketKey = (i: number, j: number): number => (i + 1_048_576) * 2_097_152 + (j + 1_048_576);

/**
 * A binary min-heap of (key, value) pairs in typed arrays. The pairs come out by key, and equal keys by value, so the order is deterministic.
 * The method `push` adds a pair to the heap. The method `add` only appends a pair, and the method `build` then makes the heap of all the pairs.
 */
class MinHeap {
  #d = new Float64Array(64);
  #j = new Int32Array(64);
  size = 0;

  /** The smallest key. */
  get topKey(): number {
    return this.#d[0]!;
  }

  push(key: number, value: number): void {
    this.add(key, value);
    const d = this.#d;
    const jj = this.#j;
    let i = this.size - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!(key < d[p]! || (key === d[p] && value < jj[p]!))) break;
      d[i] = d[p]!;
      jj[i] = jj[p]!;
      i = p;
    }
    d[i] = key;
    jj[i] = value;
  }

  clear(): void {
    this.size = 0;
  }

  add(d: number, j: number): void {
    if (this.size === this.#d.length) {
      const dd = new Float64Array(2 * this.size);
      dd.set(this.#d);
      this.#d = dd;
      const jj = new Int32Array(2 * this.size);
      jj.set(this.#j);
      this.#j = jj;
    }
    this.#d[this.size] = d;
    this.#j[this.size] = j;
    this.size++;
  }

  build(): void {
    for (let i = (this.size >> 1) - 1; i >= 0; i--) this.#down(i);
  }

  /** This method removes the pair with the smallest key and gives its value. */
  pop(): number {
    const top = this.#j[0]!;
    this.size--;
    if (this.size > 0) {
      this.#d[0] = this.#d[this.size]!;
      this.#j[0] = this.#j[this.size]!;
      this.#down(0);
    }
    return top;
  }

  #down(i: number): void {
    const d = this.#d;
    const jj = this.#j;
    const n = this.size;
    const di = d[i]!;
    const ji = jj[i]!;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      let m = l;
      if (r < n && (d[r]! < d[l]! || (d[r] === d[l] && jj[r]! < jj[l]!))) m = r;
      if (!(d[m]! < di || (d[m] === di && jj[m]! < ji))) break;
      d[i] = d[m]!;
      jj[i] = jj[m]!;
      i = m;
    }
    d[i] = di;
    jj[i] = ji;
  }
}
