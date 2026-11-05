// Throwaway. Which comparison flips when a room moves by its last bits, and does a snap of the points to a grid hold the counts.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { mulberry32 } from "@mark1russell7/rigor-generators";
import { classifySegments } from "@mark1russell7/predicates";
import { crossingPairs, type EdgeLine } from "../src/bench/measures/crossing-pairs.ts";
import { dist } from "../src/geom.ts";
import { Grid } from "../src/grid.ts";
import { curveSpace, sampleCurve } from "../src/curves/index.ts";
import { highwayCurves } from "../src/curves/highway/index.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { segmentsCross, type Point } from "../src/geom.ts";
import * as neu from "../src/lane-room.ts";
import * as old from "../src/lane-room-old.ts";
import type { Graph, Result } from "../src/model.ts";
import { ROUTERS, sectionsRouter } from "../src/routers/index.ts";
import { laneRoutes, runKey, segmentsOf } from "../src/segments.ts";
import { Obstacles } from "../src/visibility.ts";

const LANES = { width: 5, maxWidth: 30 };
const SAMPLE = 0.02;
const SHIFT = 1e-12;
mkdirSync("out", { recursive: true });
const LOG = "out/join-cost.flip.txt";
writeFileSync(LOG, `CPU ${cpus()[0]?.model}.\n`);
const log = (s: string): void => appendFileSync(LOG, `${s}\n`);

const site = sectionsRouter({ name: "sections-site", margin: 20, stretch: 3, cap: 6 });
const routers = [...["shared-all", "sections"].map((n) => ROUTERS.find((r) => r.name === n)!), site];
const reg = highwaysRegistry();

const snap = (lines: readonly EdgeLine[], grid: number): EdgeLine[] =>
  lines.map((l) => ({ edge: l.edge, points: l.points.map((p) => ({ x: Math.round(p.x * grid) / grid, y: Math.round(p.y * grid) / grid })) }));
const shiftRooms = (result: Result, seed: number): Result => {
  const r = mulberry32(seed);
  const by = (): number => (r() < 0.5 ? -SHIFT : SHIFT);
  if (!result.runs) return result;
  return { ...result, runs: result.runs.map((w) => (w.room ? { ...w, room: { left: Math.max(0, w.room.left + by()), right: Math.max(0, w.room.right + by()) } } : w)) };
};
function linesOf(board: Graph, result: Result): { poly: EdgeLine[]; paint: EdgeLine[] } {
  const g = segmentsOf(result);
  const open = new Set(g.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
  const poly = laneRoutes(g, open, LANES.width, LANES.maxWidth).map((r) => ({ edge: r.edge, points: r.points }));
  const space = curveSpace(board.nodes.map((n) => n.box));
  const curves = highwayCurves(g, open, LANES.width, { maxWidth: LANES.maxWidth, space });
  return { poly, paint: curves.map((c) => ({ edge: c.edge, points: sampleCurve(c.segments, SAMPLE) })) };
}
const moved = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number => {
  let n = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) n += Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0));
  return n;
};
const toSegment = (p: Point, a: Point, b: Point): number => {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const l = dx * dx + dy * dy;
  const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
/** The crossings of two lines, with the distance from the crossing to the nearest end of a segment. */
const crossingsOf = (A: readonly Point[], B: readonly Point[]): { i: number; j: number; touch: number; at: Point }[] => {
  const out: { i: number; j: number; touch: number; at: Point }[] = [];
  for (let i = 1; i < A.length; i++) {
    const [a, b] = [A[i - 1]!, A[i]!];
    const [x0, x1, y0, y1] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
    for (let j = 1; j < B.length; j++) {
      const [c, d] = [B[j - 1]!, B[j]!];
      if (Math.max(c.x, d.x) < x0 || Math.min(c.x, d.x) > x1 || Math.max(c.y, d.y) < y0 || Math.min(c.y, d.y) > y1) continue;
      if (segmentsCross(a, b, c, d)) out.push({ i, j, touch: Math.min(toSegment(a, c, d), toSegment(b, c, d), toSegment(c, a, b), toSegment(d, a, b)), at: a });
    }
  }
  return out;
};
/** The nearest distance from any point of `A` to any segment of `B`, near one place. */
const nearest = (p: Point, B: readonly Point[]): number => {
  let best = Infinity;
  for (let j = 1; j < B.length; j++) {
    const [c, d] = [B[j - 1]!, B[j]!];
    if (Math.max(c.x, d.x) < p.x - 2 || Math.min(c.x, d.x) > p.x + 2 || Math.max(c.y, d.y) < p.y - 2 || Math.min(c.y, d.y) > p.y + 2) continue;
    best = Math.min(best, toSegment(p, c, d));
  }
  return best;
};

/** This function reads each pair that changes, and it counts the class of each crossing that only one arm has. */
function readFlips(tag: string, base: readonly EdgeLine[], other: readonly EdgeLine[], classes: Record<string, number>, note: string): void {
  const [p, q] = [crossingPairs(base), crossingPairs(other)];
  const [A, B] = [new Map(base.map((l) => [l.edge, l.points])), new Map(other.map((l) => [l.edge, l.points]))];
  let shown = 0;
  for (const key of new Set([...p.keys(), ...q.keys()])) {
    if ((p.get(key) ?? 0) === (q.get(key) ?? 0)) continue;
    const [e, f] = key.split("|") as [string, string];
    const [ae, af, be, bf] = [A.get(e)!, A.get(f)!, B.get(e)!, B.get(f)!];
    const [ca, cb] = [crossingsOf(ae, af), crossingsOf(be, bf)];
    const sameCount = ae.length === be.length && af.length === bf.length;
    classes[sameCount ? "sameSamples" : "otherSamples"] = (classes[sameCount ? "sameSamples" : "otherSamples"] ?? 0) + 1;
    const parity = Math.abs((p.get(key) ?? 0) - (q.get(key) ?? 0)) % 2 === 0 ? "evenMove" : "oddMove";
    classes[parity] = (classes[parity] ?? 0) + 1;
    const keyOf = (c: { i: number; j: number }): string => `${c.i},${c.j}`;
    const [ka, kb] = [new Set(ca.map(keyOf)), new Set(cb.map(keyOf))];
    const only = [...ca.filter((c) => !kb.has(keyOf(c))), ...cb.filter((c) => !ka.has(keyOf(c)))];
    let worst = 0;
    if (sameCount) {
      for (let i = 0; i < ae.length; i++) worst = Math.max(worst, Math.hypot(ae[i]!.x - be[i]!.x, ae[i]!.y - be[i]!.y));
      for (let i = 0; i < af.length; i++) worst = Math.max(worst, Math.hypot(af[i]!.x - bf[i]!.x, af[i]!.y - bf[i]!.y));
    }
    for (const c of only) {
      const name = c.touch < 1e-9 ? "touch<1e-9" : c.touch < 1e-6 ? "touch<1e-6" : c.touch < 1e-3 ? "touch<1e-3" : "touch>=1e-3";
      classes[name] = (classes[name] ?? 0) + 1;
    }
    if (shown++ < 3) {
      const first = only[0];
      log(`  ${tag} ${note} ${key}: ${p.get(key) ?? 0}->${q.get(key) ?? 0}; samples ${ae.length}/${be.length} ${af.length}/${bf.length}; line moves ${worst.toExponential(2)}; only ${only.length}; touch ${only.slice(0, 4).map((c) => c.touch.toExponential(1)).join(" ")}; at ${first ? `${first.at.x.toFixed(3)},${first.at.y.toFixed(3)} near ${nearest(first.at, af).toExponential(1)}` : "-"}`);
    }
  }
}

type Test = (a: Point, b: Point, c: Point, d: Point) => boolean;
/** This function is `crossingPairs` with its test as a parameter. */
function pairsBy(lines: readonly EdgeLine[], test: Test): ReadonlyMap<string, number> {
  const segments: { readonly line: number; readonly a: Point; readonly b: Point }[] = [];
  lines.forEach((line, index) => {
    for (let i = 1; i < line.points.length; i++) {
      const [a, b] = [line.points[i - 1]!, line.points[i]!];
      if (a.x !== b.x || a.y !== b.y) segments.push({ line: index, a, b });
    }
  });
  const pairs = new Map<string, number>();
  if (segments.length === 0) return pairs;
  const mean = segments.reduce((sum, q) => sum + dist(q.a, q.b), 0) / segments.length;
  const grid = new Grid<number>(Math.max(20, mean));
  segments.forEach((q, i) => grid.addSegment(i, q.a, q.b));
  segments.forEach((q, i) => {
    grid.querySegment(q.a, q.b, 0, (j) => {
      const other = segments[j]!;
      if (j <= i || lines[other.line]!.edge === lines[q.line]!.edge || !test(q.a, q.b, other.a, other.b)) return;
      const key = [lines[q.line]!.edge, lines[other.line]!.edge].sort().join("|");
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    });
  });
  return pairs;
}
/** The side of `p` from the line of `a` and `b`. A point within `tolerance` of the line is on the positive side, so a touch has one stable answer. */
const sideOf = (p: Point, a: Point, b: Point, tolerance: number): number => {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const d = (dx * (p.y - a.y) - dy * (p.x - a.x)) / Math.sqrt(dx * dx + dy * dy);
  return Math.abs(d) <= tolerance || d > 0 ? 1 : -1;
};
const halfOpen = (tolerance: number): Test => (a, b, c, d) => sideOf(c, a, b, tolerance) !== sideOf(d, a, b, tolerance) && sideOf(a, c, d, tolerance) !== sideOf(b, c, d, tolerance);
const exact: Test = (a, b, c, d) => classifySegments(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y).relation === "cross";
const asIs = (lines: readonly EdgeLine[]): readonly EdgeLine[] => lines;
const ARMS: readonly { readonly name: string; readonly lines: (l: readonly EdgeLine[]) => readonly EdgeLine[]; readonly test: Test }[] = [
  { name: "float", lines: asIs, test: segmentsCross },
  { name: "exact", lines: asIs, test: exact },
  { name: "snap-1e-9", lines: (l) => snap(l, 1e9), test: segmentsCross },
  { name: "snap-1e-6", lines: (l) => snap(l, 1e6), test: segmentsCross },
  { name: "half-open-1e-9", lines: asIs, test: halfOpen(1e-9) },
  { name: "half-open-1e-6", lines: asIs, test: halfOpen(1e-6) },
];

for (const router of routers) {
  const totals: Record<string, number> = {};
  const add = (k: string, n: number): void => void (totals[k] = (totals[k] ?? 0) + n);
  let boardIndex = 0;
  const classes: Record<string, Record<string, number>> = { polyOldNew: {}, paintOldNew: {}, polyShift: {}, paintShift: {} };
  for (const f of HIGHWAYS_FAMILIES) {
    for (let seed = 0; seed < 3; seed++) {
      const board = reg.generate(f.name, seed).graph;
      const result = router.route(board);
      const obstacles = new Obstacles(board.nodes, 180);
      const a = result.runs ? { ...result, runs: neu.withLaneRoom(result.runs, obstacles) } : result;
      const b = result.runs ? { ...result, runs: old.withLaneRoom(result.runs, obstacles) } : result;
      const [la, lb, ls] = [linesOf(board, a), linesOf(board, b), linesOf(board, shiftRooms(a, seed + 1))];
      const tag = `${router.name} ${f.name} ${seed}`;
      readFlips(tag, la.poly, lb.poly, classes.polyOldNew!, "poly old-new");
      readFlips(tag, la.paint, lb.paint, classes.paintOldNew!, "paint old-new");
      readFlips(tag, la.poly, ls.poly, classes.polyShift!, "poly shift");
      readFlips(tag, la.paint, ls.paint, classes.paintShift!, "paint shift");
      // Each arm counts the same lines. The order of the arms turns with each board, so that a time does not depend on its place.
      const turn = (boardIndex++) % ARMS.length;
      for (let k = 0; k < ARMS.length; k++) {
        const arm = ARMS[(k + turn) % ARMS.length]!;
        const t0 = performance.now();
        const qa = pairsBy(arm.lines(la.paint), arm.test);
        const t1 = performance.now();
        const pa = pairsBy(arm.lines(la.poly), arm.test);
        const t2 = performance.now();
        add(`${arm.name} paintMs`, t1 - t0);
        add(`${arm.name} polyMs`, t2 - t1);
        const of = (l: readonly EdgeLine[]): ReadonlyMap<string, number> => pairsBy(arm.lines(l), arm.test);
        const [pb, ps, qb, qs] = [of(lb.poly), of(ls.poly), of(lb.paint), of(ls.paint)];
        add(`${arm.name} polyOldNew`, moved(pa, pb));
        add(`${arm.name} polyShift`, moved(pa, ps));
        add(`${arm.name} paintOldNew`, moved(qa, qb));
        add(`${arm.name} paintShift`, moved(qa, qs));
        add(`${arm.name} polyPoints`, [...pa.values()].reduce((t, n) => t + n, 0));
        add(`${arm.name} paintPoints`, [...qa.values()].reduce((t, n) => t + n, 0));
        add(`${arm.name} polyPairs`, pa.size);
        add(`${arm.name} paintPairs`, qa.size);
      }
    }
    log(`DONE ${router.name} ${f.name}`);
  }
  log(`ROUTER ${router.name}: ${JSON.stringify(totals)}`);
  log(`CLASSES ${router.name}: ${JSON.stringify(classes)}`);
}
console.log("done");
