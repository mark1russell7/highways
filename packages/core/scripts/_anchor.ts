// Probe of ROUTE-TIE, kept on a measure branch. Usage: node --import ./_anchor-hook.ts _anchor.ts <out.json> <nodes|links|zero>...
// With ANCHOR_SOURCE, the arm runs another text of the search. It reads the law of the floor on jitter of nodes, on jitter of link costs, and the walk on links of no cost.
import { writeFileSync } from "node:fs";
import { deriveSeed, mulberry32, seedOf } from "@mark1russell7/rigor-generators";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { dist, type Point } from "../src/geom.ts";
import { edgePlugs } from "../src/highways/stretches.ts";
import { resolvePorts, splitFrames, type Graph, type Node } from "../src/model.ts";
import { WayFinder } from "../src/ways.ts";
import { MOVE, routerNamed } from "./route-tie-rows.ts";

const out = process.argv[2]!;
const parts = new Set(process.argv.slice(3));
const OLD = process.env["ANCHOR_SOURCE"] !== undefined;
const FLOORS = [1, 0.5, 0.25] as const;
const SEEDS = 3;
const DRAWS = 4;
const reg = highwaysRegistry();
const g = globalThis as any;
const result: Record<string, unknown> = { arm: OLD ? "present rule" : "budget form" };
const save = (): void => writeFileSync(out, JSON.stringify(result, null, 1));

const boards = (): { key: string; board: Graph }[] =>
  HIGHWAYS_FAMILIES.flatMap((f) => Array.from({ length: SEEDS }, (_, seed) => ({ key: `${f.name}/${seed}`, board: reg.generate(f.name, seed).graph })));
const jitter = (board: Graph, amp: number, name: string): Graph => {
  const next = mulberry32(deriveSeed(seedOf(name), String(amp)));
  return { ...board, nodes: board.nodes.map((n) => ({ ...n, box: { ...n.box, x: n.box.x + amp * (2 * next() - 1), y: n.box.y + amp * (2 * next() - 1) } })) };
};
const moved = (a: Map<string, readonly Point[]>, b: Map<string, readonly Point[]>): string[] =>
  [...a]
    .filter(([id, p]) => {
      const q = b.get(id);
      return !q || p.length !== q.length || p.some((v, i) => Math.abs(v.x - q[i]!.x) > MOVE || Math.abs(v.y - q[i]!.y) > MOVE);
    })
    .map(([id]) => id);

// The law on jitter of each node, on each router.
if (parts.has("nodes")) {
  const rows: unknown[] = [];
  for (const amp of [1e-11, 1e-10, 3e-10, 1e-9, 3e-9, 1e-8]) {
    for (const name of ["corners", "sections", "shared-all", "shared", "trunks", "sections-site"]) {
      const router = routerNamed(name);
      let routes = 0;
      let moves = 0;
      const where: string[] = [];
      for (let draw = 0; draw < DRAWS; draw++) {
        for (const { key, board } of boards()) {
          const b = jitter(board, amp, `${key}#${draw}`);
          const lines = FLOORS.map((floor) => {
            g.__FLOOR = floor;
            return new Map(router.route(b).routes.map((r) => [r.edge, r.points] as const));
          });
          routes += lines[0]!.size;
          for (const l of lines.slice(1)) {
            const m = moved(lines[0]!, l);
            moves += m.length;
            if (m.length) where.push(`${key}#${draw}:${m.length}`);
          }
        }
      }
      rows.push({ amp, router: name, routes, moves, where });
      console.log("nodes", amp, name, routes, moves, where.slice(0, 5).join(" "));
    }
    result["nodes"] = rows;
    save();
  }
  g.__FLOOR = 1;
}

/** The reads of the walk: a throw, a loop, a link that does not exist, and the cost over `best`. */
interface Walks {
  searches: number;
  none: number;
  throws: number;
  repeats: number;
  notLinks: number;
  fallbacks: number;
  zeroLinks: number;
  maxOver: number;
  first: string[];
}
const newWalks = (): Walks => ({ searches: 0, none: 0, throws: 0, repeats: 0, notLinks: 0, fallbacks: 0, zeroLinks: 0, maxOver: 0, first: [] });
function search(ways: WayFinder, a: Point, b: Point, cost: ((i: number, j: number, d: number) => number) | undefined, floor: number, walks: Walks, id: string): string {
  const pts = ways.corners.points;
  let best = NaN;
  let start: Int32Array | undefined;
  let next: Int32Array | undefined;
  let length: Float64Array | undefined;
  const walk: number[] = [];
  g.__FLOOR = 1;
  g.__LIMIT = (bb: number, s: Int32Array, n: Int32Array, l: Float64Array): void => {
    best = bb;
    start = s;
    next = n;
    length = l;
  };
  g.__WALK = (at: number): void => {
    walk.push(at);
  };
  g.__FALLBACK = (): void => {
    walks.fallbacks++;
  };
  walks.searches++;
  let found: Point[] | undefined;
  try {
    found = ways.corners.path(a, b, cost, floor);
  } catch (e) {
    walks.throws++;
    if (walks.first.length < 5) walks.first.push(`${id}: ${String(e)}`);
    return "throw";
  }
  if (!found) {
    walks.none++;
    return "null";
  }
  if (!OLD && walk.length > 0) {
    if (new Set(walk).size !== walk.length) walks.repeats++;
    let sum = dist(b, pts[walk[0]!]!) + dist(a, pts[walk[walk.length - 1]!]!);
    for (let w = 0; w + 1 < walk.length; w++) {
      const at = walk[w]!;
      const i = walk[w + 1]!;
      let d = -1;
      for (let m = start![at]!; m < start![at + 1]!; m++) if (next![m] === i) d = length![m]!;
      if (d < 0) {
        walks.notLinks++;
        continue;
      }
      if (d === 0) walks.zeroLinks++;
      sum += cost ? cost(i, at, d) : d;
    }
    walks.maxOver = Math.max(walks.maxOver, sum - best);
  }
  return JSON.stringify(found);
}
const costOf = (name: string, make: (u: number, d: number) => number): ((i: number, j: number, d: number) => number) => {
  const seed = seedOf(name);
  const memo = new Map<number, number>();
  return (i, j, d) => {
    const key = i * 1048576 + j;
    let u = memo.get(key);
    if (u === undefined) {
      u = mulberry32(deriveSeed(seed, String(key)))();
      memo.set(key, u);
    }
    return make(u, d);
  };
};

// The chained board, the flip: a jitter on the cost of each link, read in each direction.
if (parts.has("links")) {
  const rows: unknown[] = [];
  for (const amp of [3e-10, 1e-9, 3e-9]) {
    const walks = newWalks();
    let moves = 0;
    let paths = 0;
    const where: string[] = [];
    for (let draw = 0; draw < DRAWS; draw++) {
      for (const { key, board } of boards()) {
        const { graph } = splitFrames(resolvePorts(board));
        const ways = new WayFinder(graph.nodes);
        const cost = costOf(`${key}#${draw}#${amp}`, (u, d) => d + amp * u);
        for (const { edge, ps, pt } of edgePlugs(graph)) {
          const a = ways.out(ps!);
          const b = ways.out(pt!);
          const texts = FLOORS.map((floor) => search(ways, a, b, cost, floor, walks, `${key}#${draw} ${edge.id}`));
          paths++;
          if (texts[1] !== texts[0] || texts[2] !== texts[0]) {
            moves++;
            where.push(`${key}#${draw} ${edge.id}`);
          }
        }
      }
    }
    rows.push({ amp, paths, moves, where: where.slice(0, 30), walks });
    console.log("links", amp, paths, moves, JSON.stringify(walks));
    result["links"] = rows;
    save();
  }
}

// Links of no cost at floor 0 on the family boards, and boxes whose corners lie on one point at each floor.
if (parts.has("zero")) {
  const rows: unknown[] = [];
  for (const share of [0.1, 0.3, 0.6]) {
    const walks = newWalks();
    for (const { key, board } of boards()) {
      const { graph } = splitFrames(resolvePorts(board));
      const ways = new WayFinder(graph.nodes);
      const cost = costOf(`${key}#${share}`, (u, d) => (u < share ? 0 : d));
      for (const { edge, ps, pt } of edgePlugs(graph)) search(ways, ways.out(ps!), ways.out(pt!), cost, 0, walks, `${key} ${edge.id}`);
    }
    rows.push({ share, walks });
    console.log("zero cost", share, JSON.stringify(walks));
  }
  result["zeroCost"] = rows;
  const built: Node[] = [];
  for (let c = 0; c < 6; c++) for (let r = 0; r < 6; r++) built.push({ id: `n${c}-${r}`, box: { x: c * 50, y: r * 50, w: 40, h: 40 } } as Node);
  const ways = new WayFinder(built);
  const next = mulberry32(seedOf("zero-length"));
  const walks = newWalks();
  let moves = 0;
  let paths = 0;
  for (let t = 0; t < 400; t++) {
    const side = (k: number): Point => (k < 0.5 ? { x: -20, y: 300 * next() } : { x: 320, y: 300 * next() });
    const a = side(next());
    const b = side(next());
    const texts = FLOORS.map((floor) => search(ways, a, b, undefined, floor, walks, `built ${t}`));
    paths++;
    if (texts[1] !== texts[0] || texts[2] !== texts[0]) moves++;
  }
  const coincide = new Map<string, number>();
  for (const p of ways.corners.points) coincide.set(`${p.x},${p.y}`, (coincide.get(`${p.x},${p.y}`) ?? 0) + 1);
  result["zeroLength"] = { paths, moves, walks, corners: ways.corners.points.length, onOnePoint: [...coincide.values()].filter((v) => v > 1).length };
  console.log("zero length", paths, moves, JSON.stringify(result["zeroLength"]));
  save();
}
save();
