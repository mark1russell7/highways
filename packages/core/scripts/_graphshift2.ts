// Untracked second read of GRAPH-SHIFT: the lists of the k nearest corners, the end lists, and the points that differ.
import { readFileSync, writeFileSync } from "node:fs";
import { highwaysRegistry } from "../src/families/index.ts";
import { dist, type Point } from "../src/geom.ts";
import { edgePlugs } from "../src/highways/stretches.ts";
import { resolvePorts, splitFrames, type Graph } from "../src/model.ts";
import { WayFinder } from "../src/ways.ts";

const [input, out] = [process.argv[2]!, process.argv[3]!];
const K = 8;
const PAD = 2.5;
const MOVE = 1e-6;
const VECTORS: readonly (readonly [number, number])[] = [[1e-12, 0], [0, 1e-12], [1e-12, 1e-12], [-1e-12, 3e-13], [7e-13, -9e-13]];
const reg = highwaysRegistry();
const moveBoard = (b: Graph, dx: number, dy: number): Graph => ({ ...b, nodes: b.nodes.map((n) => ({ ...n, box: { ...n.box, x: n.box.x + dx, y: n.box.y + dy } })) });
const read = (b: Graph) => {
  const { graph } = splitFrames(resolvePorts(b));
  const ways = new WayFinder(graph.nodes);
  const plugs = new Map(edgePlugs(graph).map((e) => [e.edge.id, e]));
  return { ways, plugs, nodes: graph.nodes };
};
type R = ReturnType<typeof read>;
const clear = (r: R, p: Point, q: Point): boolean => r.ways.obstacles.hit(p, q, PAD) === undefined;

/** The difference of two lists from one point, with the gap of each lost corner to the corner that took its place. */
function listDiff(a: R, b: R, pa: Point, pb: Point, count: number, self: number) {
  const la = a.ways.corners.nearestVisible(pa, count, self);
  const lb = b.ways.corners.nearestVisible(pb, count, self);
  const onlyA = la.filter((j) => !lb.includes(j));
  const onlyB = lb.filter((j) => !la.includes(j));
  const da = (j: number): number => dist(pa, a.ways.corners.points[j]!);
  const db = (j: number): number => dist(pb, b.ways.corners.points[j]!);
  const rows = onlyA.map((j) => {
    const gaps = onlyB.map((m) => Math.abs(da(j) - db(m)));
    return { j, d: da(j), bestGap: gaps.length === 0 ? null : Math.min(...gaps), clearA: clear(a, pa, a.ways.corners.points[j]!), clearB: clear(b, pb, b.ways.corners.points[j]!) };
  });
  const back = onlyB.map((m) => ({ m, d: db(m), clearA: clear(a, pa, a.ways.corners.points[m]!), clearB: clear(b, pb, b.ways.corners.points[m]!) }));
  return { sizes: [la.length, lb.length], lost: rows, gained: back };
}

const data = JSON.parse(readFileSync(input, "utf8")) as { rows: Record<string, unknown>[] };
const rows: unknown[] = [];
const counts: Record<string, number> = {};
for (const row of data.rows) {
  const cls = row["cls"] as string;
  if (!cls.startsWith("neither")) continue;
  const board = reg.generate(row["family"] as string, row["seed"] as number).graph;
  const [dx, dy] = VECTORS[row["vector"] as number]!;
  const a = read(board);
  const b = read(moveBoard(board, dx, dy));
  const edge = row["edge"] as string;
  const res: Record<string, unknown> = { family: row["family"], seed: row["seed"], vector: row["vector"], edge, cls };
  let verdict = "unread";
  if (cls === "neither:no-partner") {
    const [i, j] = row["link"] as [number, number];
    const x = row["holdsIt"] === "base" ? a : b;
    const y = row["holdsIt"] === "base" ? b : a;
    const ends = [[i, j], [j, i]].map(([e, o]) => {
      const lx = x.ways.corners.nearestVisible(x.ways.corners.points[e!]!, K, e!);
      const ly = y.ways.corners.nearestVisible(y.ways.corners.points[e!]!, K, e!);
      const inX = lx.includes(o!);
      const inY = ly.includes(o!);
      const took = ly.filter((m) => !lx.includes(m));
      const d0 = dist(x.ways.corners.points[e!]!, x.ways.corners.points[o!]!);
      const gaps = took.map((m) => ({ m, gap: Math.abs(dist(y.ways.corners.points[e!]!, y.ways.corners.points[m]!) - d0), clearX: clear(x, x.ways.corners.points[e!]!, x.ways.corners.points[m]!), clearY: clear(y, y.ways.corners.points[e!]!, y.ways.corners.points[m]!) }));
      return { end: e, inX, inY, sizes: [lx.length, ly.length], took: gaps };
    });
    res["ends"] = ends;
    const held = ends.filter((e) => e.inX && !e.inY);
    if (held.length === 0) verdict = ends.some((e) => e.inX) ? "both-lists-hold-it" : "in-no-list:join";
    else {
      const all = held.flatMap((e) => e.took);
      const flip = all.some((t) => t.clearX !== t.clearY);
      const best = Math.min(...all.map((t) => t.gap), Infinity);
      verdict = flip ? "list:flip" : best <= 1e-9 ? "list:tie" : best <= 1e-6 ? "list:tie-over-1e-9" : all.length === 0 ? "list:nothing-took-it" : "list:far";
    }
  } else if (cls === "neither:same-links-path-differs") {
    const pa = a.plugs.get(edge)!;
    const pb = b.plugs.get(edge)!;
    const ends = [[pa.ps!, pb.ps!], [pa.pt!, pb.pt!]].map(([p, q]) => {
      const oa = a.ways.out(p!);
      const ob = b.ways.out(q!);
      const stepA = a.ways.outStep(p!);
      const stepB = b.ways.outStep(q!);
      return { out: [oa, ob], steps: [stepA, stepB], far: dist(oa, ob), lists: listDiff(a, b, oa, ob, K * 2, -1) };
    });
    res["ends"] = ends;
    if (ends.some((e) => e.steps[0] !== e.steps[1])) verdict = "end:out-step";
    else if (ends.every((e) => e.lists.lost.length + e.lists.gained.length === 0)) verdict = "end:same-lists";
    else {
      const flip = ends.some((e) => [...e.lists.lost.map((l) => l.clearA !== l.clearB), ...e.lists.gained.map((l) => l.clearA !== l.clearB)].some(Boolean));
      const gaps = ends.flatMap((e) => e.lists.lost.map((l) => l.bestGap ?? Infinity));
      const best = Math.max(...gaps);
      verdict = flip ? "end:flip" : best <= 1e-9 ? "end:tie" : best <= 1e-6 ? "end:tie-over-1e-9" : "end:far";
    }
  } else if (cls === "neither:points-differ") {
    const pa = a.ways.corners.points;
    const pb = b.ways.corners.points;
    const has = (list: readonly Point[], p: Point): boolean => list.some((q) => Math.abs(p.x - q.x) <= MOVE && Math.abs(p.y - q.y) <= MOVE);
    const onlyA = pa.filter((p) => !has(pb, p));
    const onlyB = pb.filter((p) => !has(pa, p));
    const nodes = board.nodes;
    const x1 = Math.max(...nodes.map((n) => n.box.x + n.box.w));
    const y1 = Math.max(...nodes.map((n) => n.box.y + n.box.h));
    res["onlyA"] = onlyA;
    res["onlyB"] = onlyB;
    res["limit"] = { x1, y1 };
    // An inside test on the same point in each run.
    const inside = (r: R, p: Point, m: number): boolean => r.ways.obstacles.inside(p, m);
    res["inside"] = onlyA.map((p) => ({ p, a5: inside(a, p, 5), b5: inside(b, p, 5) }));
    verdict = "points";
  }
  res["verdict"] = verdict;
  counts[`${cls} -> ${verdict}`] = (counts[`${cls} -> ${verdict}`] ?? 0) + 1;
  rows.push(res);
}
writeFileSync(out, JSON.stringify({ counts, rows }, null, 1));
for (const [name, n] of Object.entries(counts).sort()) console.log(`${n}\t${name}`);
