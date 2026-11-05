// Untracked probe of GRAPH-SHIFT. It reads each moved route of `corners` under a shift: the first link that differs, and why.
import { writeFileSync } from "node:fs";
import { highwaysRegistry, HIGHWAYS_FAMILIES } from "../src/families/index.ts";
import { dist, type Point } from "../src/geom.ts";
import { edgePlugs } from "../src/highways/stretches.ts";
import { resolvePorts, splitFrames, type Graph, type Node } from "../src/model.ts";
import { ROUTERS } from "../src/routers/index.ts";
import { WayFinder } from "../src/ways.ts";

const out = process.argv[2]!;
const SEEDS = 3;
const MOVE = 1e-6;
const PAD = 2.5;
const VECTORS: readonly (readonly [number, number])[] = [
  [1e-12, 0],
  [0, 1e-12],
  [1e-12, 1e-12],
  [-1e-12, 3e-13],
  [7e-13, -9e-13],
];
const corners = ROUTERS.find((r) => r.name === "corners")!;
const reg = highwaysRegistry();

const moveBoard = (board: Graph, dx: number, dy: number): Graph => ({
  ...board,
  nodes: board.nodes.map((n) => ({ ...n, box: { ...n.box, x: n.box.x + dx, y: n.box.y + dy } })),
});

interface Read {
  readonly ways: WayFinder;
  readonly raw: Map<string, readonly Point[] | null>;
  readonly nodes: readonly Node[];
}
const readOf = (board: Graph): Read => {
  const { graph } = splitFrames(resolvePorts(board));
  const ways = new WayFinder(graph.nodes);
  const raw = new Map<string, readonly Point[] | null>();
  for (const { edge, ps, pt } of edgePlugs(graph)) raw.set(edge.id, ways.corners.path(ways.out(ps!), ways.out(pt!)) ?? null);
  return { ways, raw, nodes: graph.nodes };
};
const linesOf = (board: Graph): Map<string, readonly Point[]> => new Map(corners.route(board).routes.map((r) => [r.edge, r.points]));
const samePoints = (p: readonly Point[] | null | undefined, q: readonly Point[] | null | undefined): boolean => {
  if (!p || !q) return p === q || (!p && !q);
  return p.length === q.length && p.every((v, i) => Math.abs(v.x - q[i]!.x) <= MOVE && Math.abs(v.y - q[i]!.y) <= MOVE);
};
const lengthOf = (p: readonly Point[] | null | undefined): number => {
  let s = 0;
  for (let i = 1; i < (p?.length ?? 0); i++) s += dist(p![i - 1]!, p![i]!);
  return s;
};

/** The length of the part of the segment inside the box of a node with the pad, with no threshold. */
function chord(a: Point, b: Point, n: Node): number {
  const x0 = n.box.x - PAD;
  const y0 = n.box.y - PAD;
  const x1 = n.box.x + n.box.w + PAD;
  const y1 = n.box.y + n.box.h + PAD;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [d, lo, hi] of [
    [dx, x0 - a.x, x1 - a.x],
    [dy, y0 - a.y, y1 - a.y],
  ] as const) {
    if (d === 0) {
      if (lo >= 0 || hi <= 0) return 0;
      continue;
    }
    const u = lo / d;
    const v = hi / d;
    t0 = Math.max(t0, Math.min(u, v));
    t1 = Math.min(t1, Math.max(u, v));
  }
  return t1 <= t0 ? 0 : (t1 - t0) * Math.hypot(dx, dy);
}

const adjacency = (read: Read): Set<number>[] => read.ways.corners.points.map((_, i) => new Set(read.ways.corners.neighbours(i)));
const indexOf = (read: Read): Map<string, number> => new Map(read.ways.corners.points.map((p, i) => [`${p.x},${p.y}`, i]));

/** The first link of a path that the other graph does not hold. */
function offPath(path: readonly Point[] | null | undefined, index: Map<string, number>, other: Set<number>[]): readonly [number, number] | undefined {
  for (let i = 1; i < (path?.length ?? 0); i++) {
    const a = index.get(`${path![i - 1]!.x},${path![i - 1]!.y}`);
    const b = index.get(`${path![i]!.x},${path![i]!.y}`);
    if (a !== undefined && b !== undefined && !other[a]!.has(b)) return [a, b];
  }
  return undefined;
}

/** The read of one link on one run: its distance, its sight and the chord in the node that stops it. */
function linkRead(read: Read, i: number, j: number, blocker?: string): { d: number; clear: boolean; by?: string; chord: number } {
  const points = read.ways.corners.points;
  const hit = read.ways.obstacles.hit(points[i]!, points[j]!, PAD);
  const named = hit ?? (blocker === undefined ? undefined : read.nodes.find((n) => n.id === blocker));
  return { d: dist(points[i]!, points[j]!), clear: hit === undefined, ...(hit ? { by: hit.id } : {}), chord: named ? chord(points[i]!, points[j]!, named) : 0 };
}

const rows: unknown[] = [];
const counts: Record<string, number> = {};
const bump = (name: string): void => {
  counts[name] = (counts[name] ?? 0) + 1;
};
let moves = 0;
for (const family of HIGHWAYS_FAMILIES.map((f) => f.name)) {
  for (let seed = 0; seed < SEEDS; seed++) {
    const board = reg.generate(family, seed).graph;
    const base = linesOf(board);
    let a: Read | undefined;
    for (let v = 0; v < VECTORS.length; v++) {
      const [dx, dy] = VECTORS[v]!;
      const shifted = moveBoard(board, dx, dy);
      const lines = linesOf(shifted);
      const moved = [...base].filter(([edge, points]) => !samePoints(points, lines.get(edge))).map(([edge]) => edge);
      if (moved.length === 0) continue;
      a ??= readOf(board);
      const b = readOf(shifted);
      const pa = a.ways.corners.points;
      const pb = b.ways.corners.points;
      const aligned = pa.length === pb.length && pa.every((p, i) => Math.abs(p.x - pb[i]!.x) <= MOVE && Math.abs(p.y - pb[i]!.y) <= MOVE);
      const countsDiffer = pa.length !== pb.length || a.ways.corners.linkCount !== b.ways.corners.linkCount;
      const adjA = adjacency(a);
      const adjB = aligned ? adjacency(b) : [];
      const onlyA: [number, number][] = [];
      const onlyB: [number, number][] = [];
      if (aligned) {
        for (let i = 0; i < pa.length; i++) {
          for (const j of adjA[i]!) if (i < j && !adjB[i]!.has(j)) onlyA.push([i, j]);
          for (const j of adjB[i]!) if (i < j && !adjA[i]!.has(j)) onlyB.push([i, j]);
        }
      }
      const indexA = indexOf(a);
      const indexB = indexOf(b);
      for (const edge of moved) {
        moves++;
        const rawA = a.raw.get(edge);
        const rawB = b.raw.get(edge);
        const row: Record<string, unknown> = {
          family,
          seed,
          vector: v,
          edge,
          group: countsDiffer ? "graph" : samePoints(rawA, rawB) ? "other" : "search",
          aligned,
          points: [pa.length, pb.length],
          linksCount: [a.ways.corners.linkCount, b.ways.corners.linkCount],
          differing: [onlyA.length, onlyB.length],
          rawMoved: !samePoints(rawA, rawB),
          rawLength: [lengthOf(rawA), lengthOf(rawB)],
        };
        let cls: string;
        if (!aligned) {
          cls = "neither:points-differ";
          const first = pa.findIndex((p, i) => pb[i] === undefined || Math.abs(p.x - pb[i]!.x) > MOVE || Math.abs(p.y - pb[i]!.y) > MOVE);
          row["firstPoint"] = first;
        } else if (onlyA.length + onlyB.length === 0) {
          cls = samePoints(rawA, rawB) ? "neither:same-links-same-path" : "neither:same-links-path-differs";
          row["rawGap"] = Math.abs(lengthOf(rawA) - lengthOf(rawB));
        } else {
          // The subject link: on a path of the route when a path holds one, or else the first that differs on the board.
          const pathA = offPath(rawA, indexA, adjB);
          const pathB = offPath(rawB, indexB, adjA);
          const inA = pathA !== undefined || (pathB === undefined && onlyA.length > 0);
          const link = pathA ?? pathB ?? onlyA[0] ?? onlyB[0]!;
          const [i, j] = link;
          const x = inA ? a : b;
          const y = inA ? b : a;
          const adjX = inA ? adjA : adjB;
          const adjY = inA ? adjB : adjA;
          row["onPath"] = pathA !== undefined || pathB !== undefined;
          row["holdsIt"] = inA ? "base" : "shifted";
          row["link"] = link;
          const rx = linkRead(x, i, j);
          const ry = linkRead(y, i, j, rx.by);
          row["sight"] = { holder: rx.clear, other: ry.clear, chordHolder: rx.chord, chordOther: linkRead(x, i, j, ry.by).chord, by: rx.by ?? ry.by, d: [rx.d, ry.d] };
          // The partners: a corner that the other run links to an end of the link, and the holder does not.
          let bestGap = Infinity;
          let flipPartner = false;
          const partners: unknown[] = [];
          for (const [e, o] of [
            [i, j],
            [j, i],
          ] as const) {
            for (const m of adjY[e]!) {
              if (adjX[e]!.has(m)) continue;
              const d0 = dist(y.ways.corners.points[e]!, y.ways.corners.points[o]!);
              const dm = dist(y.ways.corners.points[e]!, y.ways.corners.points[m]!);
              const cx = linkRead(x, e, m);
              const cy = linkRead(y, e, m);
              const gap = Math.abs(dm - d0);
              if (cx.clear !== cy.clear) flipPartner = true;
              if (cx.clear && cy.clear && gap < bestGap) bestGap = gap;
              partners.push({ end: e, partner: m, gap, clear: [cx.clear, cy.clear], chord: [cx.chord, cy.chord] });
            }
          }
          row["partners"] = partners.slice(0, 6);
          row["bestGap"] = bestGap === Infinity ? null : bestGap;
          if (rx.clear !== ry.clear) cls = "flip";
          else if (flipPartner) cls = "flip:partner";
          else if (!rx.clear) cls = "neither:blocked-in-both";
          else if (bestGap <= 1e-9) cls = "tie";
          else if (bestGap <= 1e-6) cls = "tie:over-1e-9";
          else cls = partners.length === 0 ? "neither:no-partner" : "neither:far-partner";
        }
        row["cls"] = cls;
        bump(`${String(row["group"])} ${cls}${row["onPath"] === false ? " (off the path)" : ""}`);
        rows.push(row);
      }
    }
  }
}
writeFileSync(out, JSON.stringify({ moves, counts, rows }, null, 1));
console.log(`moves ${moves}`);
for (const [name, n] of Object.entries(counts).sort()) console.log(`${n}\t${name}`);
