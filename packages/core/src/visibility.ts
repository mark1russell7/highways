import { TOLERANCE } from "./bench/properties.ts";
import { dist, inflate, segmentHitsBox, segmentHitsRect, type Box, type Point } from "./geom.ts";
import { Grid } from "./grid.ts";
import type { Node } from "./model.ts";
import { WORK } from "./work.ts";

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
    let tests = 0;
    this.#grid.someSegment(a, b, pad, (n) => {
      tests++;
      if (skip?.has(n) || !hits(a, b, n, pad)) return false;
      found = n;
      return true;
    });
    WORK.sight += tests;
    return found;
  }

  /** This method tells if the polyline stays out of each box, made larger by `pad`. The nodes in `skip` do not count. */
  clearPath(p: readonly Point[], pad: number, skip?: ReadonlySet<Node>): boolean {
    for (let i = 1; i < p.length; i++) if (!this.clear(p[i - 1]!, p[i]!, pad, skip)) return false;
    return true;
  }

  /**
   * This method gives each node whose box the segment `ab` goes through to `visit`, one time each.
   * The segment goes through a box when a part of it longer than `TOLERANCE` is inside the box made smaller by `TOLERANCE`.
   * The link measures (`measureLinks`) use the same test.
   */
  through(a: Point, b: Point, visit: (n: Node) => void): void {
    this.#grid.querySegment(a, b, 0, (n) => {
      if (segmentHitsBox(a, b, inflate(n.box, -TOLERANCE), TOLERANCE)) visit(n);
    });
  }

  /** This method gives each node whose box the segment `ab` goes through to `visit`, with the test of the rule `no-pass-through`. */
  across(a: Point, b: Point, visit: (n: Node) => void): void {
    this.#grid.querySegment(a, b, 0, (n) => {
      if (segmentHitsBox(a, b, inflate(n.box, -TOLERANCE))) visit(n);
    });
  }

  /** This method gives each node whose bucket the box touches to `visit`. A node can be outside the box. */
  query(box: Box, visit: (n: Node) => void): void {
    this.#grid.query(box, visit);
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

/** A free point at an end of a search of `CornerGraph.pathAmong`, and the cost to reach it. */
export interface Terminal {
  readonly point: Point;
  readonly cost: number;
}

/** A path of `CornerGraph.pathAmong`: its points, the index of its first point in `from`, the index of its last point in `to`, and its cost. */
export interface Among {
  readonly points: Point[];
  readonly from: number;
  readonly to: number;
  readonly cost: number;
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
  /**
   * With `cones`, each corner also links to the nearest corner that it can see in each of four cones around the axes.
   * Then a path can go along a long corridor between rows or columns of boxes. The default is false.
   */
  readonly cones?: boolean;
  /**
   * The limit of the work that joins the parts of the graph, in points looked at. The default is `JOIN_WORK`, and 0 turns the join off.
   * The nearest links of a corner can all stay on one side of a gap. Then one region of the plane falls into two parts.
   */
  readonly joinWork?: number;
}

/**
 * The default limit of the join. The work of a graph of `n` points is at most `2 * n * n`, and the worst `maze` boards needed `1.1 * n * n`.
 * So this limit does not stop the join below 2048 points, and it keeps a margin of 3 up to 1900 points.
 */
export const JOIN_WORK: number = 3 * 2048 * 2048;

/**
 * A sparse visibility graph. Its vertices are the corners of the boxes, made larger by `margin`.
 * Each corner links to its `k` nearest corners that it can see. A lattice of free points links the groups of nodes.
 * A path goes from corner to corner around the boxes.
 * The obstacle test uses half of the margin, so a path keeps a clearance of at least half of the margin.
 */
export class CornerGraph {
  readonly points: Point[] = [];
  /** This flag is true when the limit of `joinWork` stopped the join, so a link between two parts can be missing. */
  joinStopped = false;
  readonly #adj: number[][] = [];
  // The links of #adj in flat arrays for the search. The links of corner `i` are at the indices `#start[i]` to `#start[i + 1] - 1`.
  // `#to` holds the other corner of each link and `#length` holds its length. The order of the links is the order of #adj.
  readonly #start: Int32Array;
  readonly #to: Int32Array;
  readonly #length: Float64Array;
  // The coordinates of the corners, in the order of `points`.
  readonly #x: Float64Array;
  readonly #y: Float64Array;
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
  // The estimate of A* of each open corner. The cost from each corner near a point of `to` to that point, for the corners whose `#goalAt` is the stamp.
  #h = new Float64Array(0);
  #goalTail = new Float64Array(0);
  #goalAt = new Int32Array(0);
  #stamp = 0;
  readonly #heap = new CornerHeap();
  // The corners in each bucket of the point grid, by the key of the bucket. A corner is in one bucket: the bucket of its point.
  readonly #buckets = new Map<number, number[]>();
  // The lists of #buckets in a dense table over the bucket range of the corners (`#bucket`). It is undefined when the range is too large.
  #cells: (number[] | undefined)[] | undefined;
  #ci0 = 0;
  #cj0 = 0;
  #cw = 0;
  #ch = 0;
  // The distance from the point of the last call of nearestVisible to each corner that the call found.
  #dist = new Float64Array(0);
  // The corners of one ring of nearestVisible, nearest first.
  readonly #near = new MinHeap();
  // The corners that each end of a path sees, by the coordinates of the end.
  readonly #endCache = new Map<string, number[]>();
  // The corners that each end of a path of `pathAmong` sees. Such a path has several ends, so each end takes fewer corners.
  readonly #fewCache = new Map<string, number[]>();
  // The connected part of the graph of each corner. The first call of `path` makes it.
  #part: Int32Array | undefined;

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
    this.#cells = this.#denseCells();
    const links: Set<number>[] = this.points.map(() => new Set<number>());
    for (let i = 0; i < this.points.length; i++) {
      // The k nearest corners of a corner in a long corridor are often all on one side. The cones add a link along the corridor.
      for (const j of this.#nearestVisible(this.points[i]!, this.#k, i, this.#pad, options.cones ?? false)) {
        links[i]!.add(j);
        links[j]!.add(i);
      }
    }
    this.#joinParts(links, options.joinWork ?? JOIN_WORK);
    const count = this.points.length;
    this.#start = new Int32Array(count + 1);
    links.forEach((s, i) => {
      const adj = [...s].sort((a, b) => a - b);
      this.#adj.push(adj);
      this.#start[i + 1] = this.#start[i]! + adj.length;
    });
    this.#to = new Int32Array(this.#start[count]!);
    this.#length = new Float64Array(this.#start[count]!);
    this.#x = new Float64Array(count);
    this.#y = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const p = this.points[i]!;
      this.#x[i] = p.x;
      this.#y[i] = p.y;
      const adj = this.#adj[i]!;
      const s = this.#start[i]!;
      for (let m = 0; m < adj.length; m++) {
        this.#to[s + m] = adj[m]!;
        this.#length[s + m] = dist(p, this.points[adj[m]!]!);
      }
    }
  }

  /**
   * This method links the parts of the graph that can see each other (CORNER-REACH). The largest part gets no links of its own.
   * The other parts go from large to small. Each of their corners links to the nearest corner in another part that it can see.
   * The order comes only from the indices of the corners and the sizes of the parts, and an equal distance goes to the lower index.
   * A graph with one part does not change. When the work reaches its limit, the method stops and sets `joinStopped`.
   */
  #joinParts(links: Set<number>[], work: number): void {
    const count = this.points.length;
    const part = new Int32Array(count).fill(-1);
    const members: number[][] = [];
    for (let i = 0; i < count; i++) {
      if (part[i] !== -1) continue;
      const m = members.length;
      const list: number[] = [];
      const stack = [i];
      part[i] = m;
      while (stack.length > 0) {
        const a = stack.pop()!;
        list.push(a);
        for (const b of links[a]!) {
          if (part[b] !== -1) continue;
          part[b] = m;
          stack.push(b);
        }
      }
      members.push(list.sort((a, b) => a - b));
    }
    if (work <= 0 || members.length < 2) return;
    const order = members.map((_, m) => m).sort((a, b) => members[b]!.length - members[a]!.length || a - b);
    order.shift();
    let left = work;
    const far = new Float64Array(count);
    for (const m of order) {
      for (const i of members[m]!) {
        if (left < count) {
          this.joinStopped = true;
          return;
        }
        left -= count;
        const p = this.points[i]!;
        const others: number[] = [];
        for (let j = 0; j < count; j++) {
          if (part[j] === m) continue;
          const q = this.points[j]!;
          far[j] = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
          others.push(j);
        }
        others.sort((a, b) => far[a]! - far[b]! || a - b);
        for (const j of others) {
          left--;
          if (!this.#obstacles.clear(p, this.points[j]!, this.#pad)) continue;
          links[i]!.add(j);
          links[j]!.add(i);
          break;
        }
      }
    }
  }

  /**
   * This method puts the lists of #buckets into a dense table over the bucket range of the corners.
   * It gives undefined when the table is much larger than the number of corners.
   * The table holds the same lists, so a test of a bucket gives the same corners in the same order.
   */
  #denseCells(): (number[] | undefined)[] | undefined {
    let i0 = Infinity;
    let j0 = Infinity;
    let i1 = -Infinity;
    let j1 = -Infinity;
    for (const list of this.#buckets.values()) {
      const p = this.points[list[0]!]!;
      const i = Math.floor(p.x / this.#cell);
      const j = Math.floor(p.y / this.#cell);
      i0 = Math.min(i0, i);
      j0 = Math.min(j0, j);
      i1 = Math.max(i1, i);
      j1 = Math.max(j1, j);
    }
    // A key of #buckets packs two indices within ±2^20 without a collision. The table applies only in that range.
    if (!(i0 >= -KEY_RANGE && j0 >= -KEY_RANGE && i1 < KEY_RANGE && j1 < KEY_RANGE)) return undefined;
    const w = i1 - i0 + 1;
    const h = j1 - j0 + 1;
    if (w * h > 4 * this.points.length + 4096) return undefined;
    const cells = new Array<number[] | undefined>(w * h).fill(undefined);
    for (const list of this.#buckets.values()) {
      const p = this.points[list[0]!]!;
      cells[(Math.floor(p.x / this.#cell) - i0) * h + (Math.floor(p.y / this.#cell) - j0)] = list;
    }
    this.#ci0 = i0;
    this.#cj0 = j0;
    this.#cw = w;
    this.#ch = h;
    return cells;
  }

  /** This method gives the list of the corners in the bucket (`i`, `j`), as `#buckets` gives it. */
  #bucket(i: number, j: number): number[] | undefined {
    const cells = this.#cells;
    if (cells !== undefined) {
      const a = i - this.#ci0;
      const b = j - this.#cj0;
      if (a >= 0 && a < this.#cw && b >= 0 && b < this.#ch) return cells[a * this.#ch + b];
      // A bucket out of the table and in the key range has no corner. The map gives the other buckets.
      if (i >= -KEY_RANGE && i < KEY_RANGE && j >= -KEY_RANGE && j < KEY_RANGE) return undefined;
    }
    return this.#buckets.get(bucketKey(i, j));
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

  /** This method gives the corners that link to the corner `i`, in the order of their indexes. A corner that is not in the graph gives an empty list. */
  neighbours(i: number): readonly number[] {
    return this.#adj[i] ?? [];
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
   * With `cones`, the method also gives the nearest visible corner of each of four cones around the axes that the `k` nearest corners leave empty.
   */
  #nearestVisible(p: Point, k: number, self: number, pad: number, cones = false): number[] {
    const out: number[] = [];
    // The bits of the full cones: 1 is +x, 2 is +y, 4 is -x and 8 is -y.
    let full = 0;
    if (this.#dist.length < this.points.length) this.#dist = new Float64Array(this.points.length);
    const dd = this.#dist;
    const points = this.points;
    const cell = this.#cell;
    const reach = CONE_CELLS * cell;
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
      // The ring of `r` holds the corners beyond `r / 2`. With the k nearest corners, the cones take no corner beyond `reach`.
      if (out.length >= k && r / 2 >= reach) return out;
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
          const list = this.#bucket(bi, bj);
          if (list === undefined) continue;
          WORK.sight += list.length;
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
        WORK.sight++;
        // A node that stopped an earlier segment often stops this segment too, so the test takes these nodes first.
        // The order of the nodes does not change the result.
        const q = points[j]!;
        const cone = cones ? coneOf(q.x - p.x, q.y - p.y) : 0;
        if (out.length >= k) {
          // After the k nearest corners, only a corner of an empty cone counts, up to `CONE_CELLS` cells from `p`.
          if (dd[j]! > reach) return out;
          if ((full & cone) !== 0) continue;
        }
        let blocked = false;
        for (let b = 0; b < blockers.length && !blocked; b++) blocked = hits(p, q, blockers[b]!, pad);
        if (blocked) continue;
        const hit = this.#obstacles.hit(p, q, pad);
        if (hit !== undefined) blockers.push(hit);
        else {
          out.push(j);
          full |= cone;
          if (out.length >= k && (!cones || full === 15)) return out;
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
    return this.#search([{ point: from, cost: 0 }], [{ point: to, cost: 0 }], cost, floor, this.#k * 2)?.points;
  }

  /**
   * This method gives the shortest path from a point of `from` to a point of `to`, or `undefined` when the graph has none.
   * The cost of a path includes the costs of its two points. One search finds the path, so this method is faster than a call of `path` for each pair.
   */
  pathAmong(from: readonly Terminal[], to: readonly Terminal[]): Among | undefined {
    const found = this.#search(from, to, undefined, 1, this.#k);
    // A straight line between two points that costs less than the found path is better. The test takes the lines in order of cost.
    const lines: Among[] = [];
    from.forEach((a, i) =>
      to.forEach((b, k) => {
        const c = a.cost + dist(a.point, b.point) + b.cost;
        if (!found || c < found.cost) lines.push({ points: [a.point, b.point], from: i, to: k, cost: c });
      }),
    );
    lines.sort((u, v) => u.cost - v.cost);
    return lines.find((l) => this.#obstacles.clear(l.points[0]!, l.points[1]!, this.#pad)) ?? found;
  }

  /** This method is the search (A*) of `path` and `pathAmong`. */
  #search(
    from: readonly Terminal[],
    to: readonly Terminal[],
    cost: ((i: number, j: number, d: number) => number) | undefined,
    floor: number,
    count: number,
  ): Among | undefined {
    const n = this.points.length;
    if (this.#g.length < n) {
      this.#g = new Float64Array(n);
      this.#parent = new Int32Array(n);
      this.#open = new Int32Array(n);
      this.#closed = new Int32Array(n);
      this.#h = new Float64Array(n);
      this.#goalTail = new Float64Array(n);
      this.#goalAt = new Int32Array(n);
    }
    const stamp = ++this.#stamp;
    const points = this.points;
    // The cost from each corner near a point of `to` to that point, and the index of that point.
    const goal = new Map<number, number>();
    const goalOf = new Map<number, number>();
    to.forEach((b, k) => {
      for (const j of this.#ends(b.point, count)) {
        const tail = dist(points[j]!, b.point) + b.cost;
        const now = goal.get(j);
        if (now === undefined || tail < now) {
          goal.set(j, tail);
          goalOf.set(j, k);
        }
      }
    });
    if (goal.size === 0) return undefined;
    const starts = from.map((a) => this.#ends(a.point, count));
    // Without a start and a goal in one connected part, A* finds no path. This test stops it before it visits the whole part.
    if (!starts.some((list) => this.#joined(list, goal))) return undefined;
    const goalTail = this.#goalTail;
    const goalAt = this.#goalAt;
    for (const [j, tail] of goal) {
      goalTail[j] = tail;
      goalAt[j] = stamp;
    }
    // The search keeps one entry for each open corner. A lower cost moves the entry up. The old search pushed a second entry instead.
    // The corners come out in the same order: by key, and equal keys by index. A second entry of a corner came out after the corner was closed, and the search skipped it.
    const heap = this.#heap;
    heap.reset(n);
    const G = this.#g;
    const H = this.#h;
    const parentOf = this.#parent;
    const open = this.#open;
    const closed = this.#closed;
    const X = this.#x;
    const Y = this.#y;
    const start = this.#start;
    const next = this.#to;
    const length = this.#length;
    const one = to.length === 1;
    const tx = one ? to[0]!.point.x : 0;
    const ty = one ? to[0]!.point.y : 0;
    // The estimate is `floor` times the distance to the nearest point of `to`, with the operations of `dist`. A corner keeps it while it is open.
    const estimate = (j: number): number => {
      if (one) {
        const dx = X[j]! - tx;
        const dy = Y[j]! - ty;
        return floor * Math.sqrt(dx * dx + dy * dy);
      }
      let h = Infinity;
      for (const b of to) {
        const dx = X[j]! - b.point.x;
        const dy = Y[j]! - b.point.y;
        h = Math.min(h, Math.sqrt(dx * dx + dy * dy));
      }
      return floor * h;
    };
    // The parent of a first corner is -1 - i, where i is the index of its point in `from`.
    from.forEach((a, i) => {
      for (const j of starts[i]!) {
        const g = a.cost + dist(a.point, points[j]!);
        if (open[j] === stamp) {
          if (G[j]! <= g) continue;
        } else {
          open[j] = stamp;
          H[j] = estimate(j);
        }
        G[j] = g;
        parentOf[j] = -1 - i;
        heap.set(g + H[j]!, j);
      }
    });
    let best = Infinity;
    let bestEnd = -1;
    let settled = 0;
    while (heap.size > 0) {
      if (heap.topKey >= best) break;
      const i = heap.pop();
      closed[i] = stamp;
      const m0 = start[i]!;
      const m1 = start[i + 1]!;
      settled += 1 + (m1 - m0);
      const gi = G[i]!;
      if (goalAt[i] === stamp && gi + goalTail[i]! < best) {
        best = gi + goalTail[i]!;
        bestEnd = i;
      }
      for (let m = m0; m < m1; m++) {
        const j = next[m]!;
        if (closed[j] === stamp) continue;
        const d = length[m]!;
        const g = gi + (cost ? cost(i, j, d) : d);
        if (open[j] === stamp) {
          if (G[j]! <= g) continue;
        } else {
          open[j] = stamp;
          H[j] = estimate(j);
        }
        G[j] = g;
        parentOf[j] = i;
        heap.set(g + H[j]!, j);
      }
    }
    WORK.corner += settled;
    if (bestEnd < 0) return undefined;
    const k = goalOf.get(bestEnd)!;
    const out: Point[] = [to[k]!.point];
    for (let i = bestEnd; ; i = parentOf[i]!) {
      out.push(points[i]!);
      if (parentOf[i]! < 0) {
        const f = -1 - parentOf[i]!;
        out.push(from[f]!.point);
        return { points: out.reverse(), from: f, to: k, cost: best };
      }
    }
  }

  /** This method tells if a corner of `starts` and a corner of `goal` are in one connected part of the graph. */
  #joined(starts: readonly number[], goal: ReadonlyMap<number, number>): boolean {
    const part = (this.#part ??= this.#parts());
    const goals = new Set<number>();
    for (const j of goal.keys()) goals.add(part[j]!);
    for (const j of starts) if (goals.has(part[j]!)) return true;
    return false;
  }

  /** This method gives the number of the connected part of each corner. */
  #parts(): Int32Array {
    const part = new Int32Array(this.points.length).fill(-1);
    const stack: number[] = [];
    let count = 0;
    for (let i = 0; i < part.length; i++) {
      if (part[i] !== -1) continue;
      part[i] = count;
      stack.push(i);
      while (stack.length > 0) {
        for (const j of this.#adj[stack.pop()!]!) {
          if (part[j] !== -1) continue;
          part[j] = count;
          stack.push(j);
        }
      }
      count++;
    }
    return part;
  }

  /**
   * This method gives at most `count` corners that an end of a path can see. An end near a box sees no corner with the clearance.
   * Then the end takes the corners that it sees without the clearance, so the path does not cut through the boxes.
   * The graph does not change, so the method keeps the corners of each end.
   */
  #ends(p: Point, count: number): number[] {
    const cache = count === this.#k * 2 ? this.#endCache : this.#fewCache;
    const key = `${p.x},${p.y}`;
    let out = cache.get(key);
    if (!out) {
      out = this.nearestVisible(p, count);
      if (out.length === 0) out = this.#nearestVisible(p, count, -1, 0);
      cache.set(key, out);
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

/** The options of the soft graph. */
export interface SoftGraphOptions {
  /** The distance from a box to its corners. */
  readonly margin: number;
  /** The number of nearest neighbours of each vertex. */
  readonly k: number;
  /**
   * The spacing of a lattice of points in the bounding box of the boxes, in units of the mean node size. The default is 3, and 0 turns it off.
   * The lattice links groups of boxes across empty space.
   */
  readonly lattice?: number;
}

/**
 * A graph whose links can go through the boxes. Its vertices are the corners of the boxes, made larger by `margin`,
 * and a lattice of points in the bounding box of the boxes. Each vertex links to its `k` nearest vertices, in view or not.
 * The graph keeps the boxes that each link goes through (`Obstacles.through`).
 * A search gives each box a cost, so a path goes through few boxes, and only through boxes of a low cost.
 */
export class SoftGraph {
  readonly points: Point[] = [];
  readonly #nodes: readonly Node[];
  readonly #obstacles: Obstacles;
  // The links in flat arrays. The links of vertex `i` are at the indices `#start[i]` to `#start[i + 1] - 1`, in the order of the vertex indices.
  // `#to` holds the other vertex of each link and `#length` holds its length.
  readonly #start: Int32Array;
  readonly #to: Int32Array;
  readonly #length: Float64Array;
  // The indices of the nodes that link `m` goes through are at the indices `#boxStart[m]` to `#boxStart[m + 1] - 1` of `#boxes`.
  readonly #boxStart: Int32Array;
  readonly #boxes: Int32Array;
  readonly #grid: Grid<number>;
  readonly #cell: number;
  readonly #k: number;
  // The state of one search. A value of `#g`, `#closed`, `#goalTail` or `#cost` counts only when its stamp is the stamp of the search.
  readonly #g: Float64Array;
  readonly #gAt: Int32Array;
  readonly #parent: Int32Array;
  readonly #closed: Int32Array;
  readonly #goalTail: Float64Array;
  readonly #goalAt: Int32Array;
  // The cost of each box in the search, by the index of its node. The search uses `cost` one time for each box of its links.
  readonly #cost: Float64Array;
  readonly #costAt: Int32Array;
  #stamp = 0;
  readonly #heap = new MinHeap();

  /** This constructor makes the graph of the nodes. */
  constructor(nodes: readonly Node[], obstacles: Obstacles, options: SoftGraphOptions) {
    this.#nodes = nodes;
    this.#obstacles = obstacles;
    this.#k = options.k;
    let size = 0;
    for (const n of nodes) size += (n.box.w + n.box.h) / 2;
    this.#cell = Math.max(1, size / Math.max(1, nodes.length) + 2 * options.margin);
    this.#grid = new Grid<number>(this.#cell);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of nodes) {
      const b = inflate(n.box, options.margin);
      for (const c of [
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h },
        { x: b.x, y: b.y + b.h },
      ])
        this.#add(c);
      x0 = Math.min(x0, n.box.x);
      y0 = Math.min(y0, n.box.y);
      x1 = Math.max(x1, n.box.x + n.box.w);
      y1 = Math.max(y1, n.box.y + n.box.h);
    }
    // The lattice stays in the bounding box of the boxes, so a path does not go around the outer edge of the board.
    const spacing = (options.lattice ?? 3) * this.#cell;
    if (spacing > 0) for (let x = x0 + spacing / 2; x < x1; x += spacing) for (let y = y0 + spacing / 2; y < y1; y += spacing) this.#add({ x, y });
    const links: Set<number>[] = this.points.map(() => new Set<number>());
    for (let i = 0; i < this.points.length; i++)
      for (const j of this.#nearest(this.points[i]!, this.#k, i)) {
        links[i]!.add(j);
        links[j]!.add(i);
      }
    const index = new Map(nodes.map((n, i) => [n, i]));
    // The boxes of each link, found one time for the two directions of the link.
    const known = new Map<number, readonly number[]>();
    const count = this.points.length;
    const adjs = links.map((set) => [...set].sort((a, b) => a - b));
    this.#start = new Int32Array(count + 1);
    for (let i = 0; i < count; i++) this.#start[i + 1] = this.#start[i]! + adjs[i]!.length;
    const total = this.#start[count]!;
    this.#to = new Int32Array(total);
    this.#length = new Float64Array(total);
    this.#boxStart = new Int32Array(total + 1);
    const boxes: number[] = [];
    for (let i = 0; i < count; i++) {
      const adj = adjs[i]!;
      for (let m = 0; m < adj.length; m++) {
        const j = adj[m]!;
        const at = this.#start[i]! + m;
        this.#to[at] = j;
        this.#length[at] = dist(this.points[i]!, this.points[j]!);
        const key = Math.min(i, j) * count + Math.max(i, j);
        let list = known.get(key);
        if (list === undefined) {
          const found: number[] = [];
          obstacles.through(this.points[i]!, this.points[j]!, (n) => found.push(index.get(n)!));
          list = found;
          known.set(key, list);
        }
        for (const b of list) boxes.push(b);
        this.#boxStart[at + 1] = boxes.length;
      }
    }
    this.#boxes = Int32Array.from(boxes);
    this.#g = new Float64Array(count);
    this.#gAt = new Int32Array(count);
    this.#parent = new Int32Array(count);
    this.#closed = new Int32Array(count);
    this.#goalTail = new Float64Array(count);
    this.#goalAt = new Int32Array(count);
    this.#cost = new Float64Array(nodes.length);
    this.#costAt = new Int32Array(nodes.length);
  }

  #add(c: Point): void {
    this.#grid.add(this.points.length, { x: c.x, y: c.y, w: 0, h: 0 });
    this.points.push(c);
  }

  /** This method gives at most `k` vertices nearest to `p`, in view or not, nearest first, and equal distances by index. The vertex `self` does not count. */
  #nearest(p: Point, k: number, self = -1): number[] {
    const all = this.points.length - (self >= 0 ? 1 : 0);
    const want = Math.min(k, all);
    if (want <= 0) return [];
    for (let r = this.#cell; ; r *= 2) {
      const found: number[] = [];
      this.#grid.query({ x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r }, (j) => {
        if (j !== self && dist(p, this.points[j]!) <= r) found.push(j);
      });
      if (found.length >= want) {
        const d = (j: number): number => dist(p, this.points[j]!);
        return found.sort((a, b) => d(a) - d(b) || a - b).slice(0, want);
      }
    }
  }

  /**
   * This method gives a path of least cost from `from` to `to` (A*), with the two points as its ends.
   * The cost of a path is its length, plus `cost(n)` for each link of the path and each box `n` of that link.
   * Each cost must be 0 or more. The straight line from `from` to `to` is a path too, so the method always gives a path.
   * The cost of a box must stay the same during one call. The search keeps the cost of each box of a link after its first use.
   */
  path(from: Point, to: Point, cost: (n: Node) => number): Point[] {
    const points = this.points;
    const nodes = this.#nodes;
    const extra = (a: Point, b: Point): number => {
      let c = 0;
      this.#obstacles.through(a, b, (m) => {
        c += cost(m);
      });
      return c;
    };
    // A search starts a new stamp in place of new arrays. A vertex without the stamp in `#gAt` has the cost Infinity.
    const stamp = ++this.#stamp;
    const g = this.#g;
    const gAt = this.#gAt;
    const parent = this.#parent;
    const closed = this.#closed;
    const goalTail = this.#goalTail;
    const goalAt = this.#goalAt;
    const boxCost = this.#cost;
    const boxCostAt = this.#costAt;
    const start = this.#start;
    const link = this.#to;
    const length = this.#length;
    const boxStart = this.#boxStart;
    const boxes = this.#boxes;
    let best = dist(from, to) + extra(from, to);
    let bestEnd = -1;
    for (const j of this.#nearest(to, 2 * this.#k)) {
      goalTail[j] = dist(points[j]!, to) + extra(points[j]!, to);
      goalAt[j] = stamp;
    }
    const heap = this.#heap;
    heap.clear();
    for (const j of this.#nearest(from, 2 * this.#k)) {
      const c = dist(from, points[j]!) + extra(from, points[j]!);
      if (c < (gAt[j] === stamp ? g[j]! : Infinity)) {
        g[j] = c;
        gAt[j] = stamp;
        parent[j] = -1;
        heap.push(c + dist(points[j]!, to), j);
      }
    }
    while (heap.size > 0) {
      if (heap.topKey >= best) break;
      const i = heap.pop();
      if (closed[i] === stamp) continue;
      closed[i] = stamp;
      const gi = g[i]!;
      if (goalAt[i] === stamp && gi + goalTail[i]! < best) {
        best = gi + goalTail[i]!;
        bestEnd = i;
      }
      const end = start[i + 1]!;
      for (let m = start[i]!; m < end; m++) {
        const j = link[m]!;
        if (closed[j] === stamp) continue;
        let c = gi + length[m]!;
        // The sum adds the costs of the boxes in the order of the link, so the cost of the path stays the same to the last bit.
        const last = boxStart[m + 1]!;
        for (let q = boxStart[m]!; q < last; q++) {
          const b = boxes[q]!;
          if (boxCostAt[b] !== stamp) {
            boxCost[b] = cost(nodes[b]!);
            boxCostAt[b] = stamp;
          }
          c += boxCost[b]!;
        }
        if (c < (gAt[j] === stamp ? g[j]! : Infinity)) {
          g[j] = c;
          gAt[j] = stamp;
          parent[j] = i;
          heap.push(c + dist(points[j]!, to), j);
        }
      }
    }
    const out: Point[] = [to];
    for (let i = bestEnd; i >= 0; i = parent[i]!) out.push(points[i]!);
    out.push(from);
    return out.reverse();
  }
}

/** A link of a cone is at most this number of cells long. A longer search costs time on a dense level and finds few new links. */
const CONE_CELLS = 3;

/** This function gives the bit of the cone of the offset (`dx`, `dy`): 1 is +x, 2 is +y, 4 is -x and 8 is -y. A diagonal offset is in a cone of the x axis. */
const coneOf = (dx: number, dy: number): number => (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 4) : dy > 0 ? 2 : 8);

/** This function packs the two indices of a bucket into one number. Each index stays within ±2^20. */
const bucketKey = (i: number, j: number): number => (i + 1_048_576) * 2_097_152 + (j + 1_048_576);

/** The indices of a bucket of `bucketKey` are at least `-KEY_RANGE` and less than `KEY_RANGE`. */
const KEY_RANGE = 1_048_576;

/**
 * A binary min-heap of corners by key, with one entry for each corner. The corners come out by key, and equal keys by index, as in `MinHeap`.
 * The heap keeps the position of each corner, so the method `set` can give a lower key to a corner in the heap.
 */
class CornerHeap {
  #d = new Float64Array(64);
  #j = new Int32Array(64);
  // The position of each corner in the heap plus one, or 0 when the corner is not in the heap.
  #at = new Int32Array(0);
  size = 0;

  /** The smallest key. */
  get topKey(): number {
    return this.#d[0]!;
  }

  /** This method removes each entry, and makes the heap ready for the corners 0 to `n` - 1. */
  reset(n: number): void {
    if (this.#at.length < n) this.#at = new Int32Array(n);
    for (let i = 0; i < this.size; i++) this.#at[this.#j[i]!] = 0;
    this.size = 0;
  }

  /** This method adds the corner `value` with `key`. When the corner is in the heap, `key` replaces its key. The new key must not be larger. */
  set(key: number, value: number): void {
    let i = this.#at[value]! - 1;
    if (i < 0) {
      if (this.size === this.#d.length) {
        const dd = new Float64Array(2 * this.size);
        dd.set(this.#d);
        this.#d = dd;
        const jj = new Int32Array(2 * this.size);
        jj.set(this.#j);
        this.#j = jj;
      }
      i = this.size++;
    }
    const d = this.#d;
    const jj = this.#j;
    const at = this.#at;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!(key < d[p]! || (key === d[p] && value < jj[p]!))) break;
      d[i] = d[p]!;
      jj[i] = jj[p]!;
      at[jj[i]!] = i + 1;
      i = p;
    }
    d[i] = key;
    jj[i] = value;
    at[value] = i + 1;
  }

  /** This method removes the corner with the smallest key and gives it. */
  pop(): number {
    const top = this.#j[0]!;
    this.#at[top] = 0;
    this.size--;
    if (this.size > 0) this.#down(this.#d[this.size]!, this.#j[this.size]!);
    return top;
  }

  // This method puts the pair (`di`, `ji`) at the root and moves it down to its place.
  #down(di: number, ji: number): void {
    const d = this.#d;
    const jj = this.#j;
    const at = this.#at;
    const n = this.size;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const r = l + 1;
      let m = l;
      if (r < n && (d[r]! < d[l]! || (d[r] === d[l] && jj[r]! < jj[l]!))) m = r;
      if (!(d[m]! < di || (d[m] === di && jj[m]! < ji))) break;
      d[i] = d[m]!;
      jj[i] = jj[m]!;
      at[jj[i]!] = i + 1;
      i = m;
    }
    d[i] = di;
    jj[i] = ji;
    at[ji] = i + 1;
  }
}

/**
 * A binary min-heap of (key, value) pairs in typed arrays. The pairs come out by key, and equal keys by value, so the order is deterministic.
 * The method `push` adds a pair to the heap. The method `add` only appends a pair, and the method `build` then makes the heap of all the pairs.
 */
export class MinHeap {
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
