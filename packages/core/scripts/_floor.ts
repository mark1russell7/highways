// Throwaway. The noise floor of the painted counts: the same code, with a shift of 1e-12 on the rooms or on the board.
// It also reads where the old room and the new room make a painted curve differ, and where a pair flips.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { bootstrapMedian, quantile } from "@mark1russell7/rigor-statistics";
import { mulberry32 } from "@mark1russell7/rigor-generators";
import { crossingPairs } from "../src/bench/measures/crossing-pairs.ts";
import { curveSpace, sampleCurve } from "../src/curves/index.ts";
import { highwayCurves } from "../src/curves/highway/index.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import * as neu from "../src/lane-room.ts";
import * as old from "../src/lane-room-old.ts";
import type { Graph, Result } from "../src/model.ts";
import { ROUTERS, sectionsRouter } from "../src/routers/index.ts";
import { runKey, segmentsOf } from "../src/segments.ts";
import { Obstacles } from "../src/visibility.ts";

const LANES = { width: 5, maxWidth: 30 };
const SAMPLE = 0.02;
const SHIFT = 1e-12;
const SEEDS = [1, 2, 3, 4, 5];
mkdirSync("out", { recursive: true });
const LOG = "out/join-cost.floor.txt";
writeFileSync(LOG, `CPU ${cpus()[0]?.model}. Shift ${SHIFT}, seeds ${SEEDS.join(",")}.\n`);
const log = (s: string): void => appendFileSync(LOG, `${s}\n`);

const site = sectionsRouter({ name: "sections-site", margin: 20, stretch: 3, cap: 6 });
const routers = [...["corners", "shared", "sections", "shared-all"].map((n) => ROUTERS.find((r) => r.name === n)!), site];
const reg = highwaysRegistry();

interface Paint {
  points: number;
  pairs: ReadonlyMap<string, number>;
  lines: Map<string, { x: number; y: number }[]>;
}
function paint(board: Graph, result: Result): Paint {
  const g = segmentsOf(result);
  const open = new Set(g.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
  const space = curveSpace(board.nodes.map((n) => n.box));
  const curves = highwayCurves(g, open, LANES.width, { maxWidth: LANES.maxWidth, space });
  const lines = curves.map((c) => ({ edge: c.edge, points: sampleCurve(c.segments, SAMPLE) }));
  const pairs = crossingPairs(lines);
  let points = 0;
  for (const v of pairs.values()) points += v;
  return { points, pairs, lines: new Map(lines.map((l) => [l.edge, l.points])) };
}
const shiftRooms = (result: Result, seed: number): Result => {
  const r = mulberry32(seed);
  const by = (): number => (r() < 0.5 ? -SHIFT : SHIFT);
  if (!result.runs) return result;
  return { ...result, runs: result.runs.map((w) => (w.room ? { ...w, room: { left: Math.max(0, w.room.left + by()), right: Math.max(0, w.room.right + by()) } } : w)) };
};
const shiftBoard = (board: Graph, seed: number): Graph => {
  const r = mulberry32(seed);
  const dx = (r() < 0.5 ? -1 : 1) * SHIFT;
  const dy = (r() < 0.5 ? -1 : 1) * SHIFT;
  return { ...board, nodes: board.nodes.map((n) => ({ ...n, box: { ...n.box, x: n.box.x + dx, y: n.box.y + dy } })) };
};
const pairsMoved = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number => {
  let moved = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) if ((a.get(k) ?? 0) > 0 !== (b.get(k) ?? 0) > 0) moved++;
  return moved;
};
const pointsMoved = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number => {
  let moved = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) moved += Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0));
  return moved;
};
/** The largest distance between the samples of one lane in two paints, or -1 when the sample count differs. */
const laneGap = (a: readonly { x: number; y: number }[], b: readonly { x: number; y: number }[]): number => {
  if (a.length !== b.length) return -1;
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.hypot(a[i]!.x - b[i]!.x, a[i]!.y - b[i]!.y));
  return worst;
};

interface Row {
  router: string;
  family: string;
  seed: number;
  points: number;
  pairs: number;
  oldNew: number;
  oldNewNet: number;
  oldNewPairs: number;
  shiftNew: number[];
  shiftNewNet: number[];
  shiftOld: number[];
  shiftOldNet: number[];
  shiftBoard: number[];
  shiftBoardNet: number[];
  routesMoved: number[];
  lanes: number;
  lanesCount: number;
  lanes1e9: number;
  lanes1e6: number;
  lanes1e3: number;
}
const rows: Row[] = [];
for (const router of routers) {
  for (const f of HIGHWAYS_FAMILIES) {
    for (let seed = 0; seed < 3; seed++) {
      const board = reg.generate(f.name, seed).graph;
      const result = router.route(board);
      const obstacles = new Obstacles(board.nodes, 180);
      const neuResult = result.runs ? { ...result, runs: neu.withLaneRoom(result.runs, obstacles) } : result;
      const oldResult = result.runs ? { ...result, runs: old.withLaneRoom(result.runs, obstacles) } : result;
      const base = paint(board, neuResult);
      const oldPaint = paint(board, oldResult);
      const row: Row = {
        router: router.name, family: f.name, seed, points: base.points, pairs: base.pairs.size,
        oldNew: pointsMoved(base.pairs, oldPaint.pairs), oldNewNet: base.points - oldPaint.points, oldNewPairs: pairsMoved(base.pairs, oldPaint.pairs),
        shiftNew: [], shiftNewNet: [], shiftOld: [], shiftOldNet: [], shiftBoard: [], shiftBoardNet: [], routesMoved: [],
        lanes: base.lines.size, lanesCount: 0, lanes1e9: 0, lanes1e6: 0, lanes1e3: 0,
      };
      // Where a lane moves from the old room to the new room.
      const far: string[] = [];
      for (const [edge, line] of base.lines) {
        const gap = laneGap(line, oldPaint.lines.get(edge) ?? []);
        if (gap < 0) row.lanesCount++;
        if (gap > 1e-9) row.lanes1e9++;
        if (gap > 1e-6) row.lanes1e6++;
        if (gap > 1e-3) { row.lanes1e3++; far.push(`${edge}:${gap.toFixed(4)}`); }
      }
      if (row.oldNew > 0) log(`DIFF ${router.name} ${f.name} ${seed}: points ${row.oldNew} net ${row.oldNewNet} pairs ${row.oldNewPairs}; lanes count ${row.lanesCount} >1e-9 ${row.lanes1e9} >1e-6 ${row.lanes1e6} >1e-3 ${row.lanes1e3}; far ${far.slice(0, 6).join(" ")}`);
      for (const s of SEEDS) {
        const a = paint(board, shiftRooms(neuResult, s));
        row.shiftNew.push(pointsMoved(base.pairs, a.pairs));
        row.shiftNewNet.push(a.points - base.points);
        const b = paint(board, shiftRooms(oldResult, s));
        row.shiftOld.push(pointsMoved(oldPaint.pairs, b.pairs));
        row.shiftOldNet.push(b.points - oldPaint.points);
        const moved = shiftBoard(board, s);
        const r2 = router.route(moved);
        let routes = 0;
        const byEdge = new Map(result.routes.map((q) => [q.edge, q.points]));
        for (const q of r2.routes) {
          const p = byEdge.get(q.edge);
          if (!p || p.length !== q.points.length || p.some((pt, i) => Math.hypot(pt.x - q.points[i]!.x, pt.y - q.points[i]!.y) > 1e-6)) routes++;
        }
        row.routesMoved.push(routes);
        const c = paint(moved, r2);
        row.shiftBoard.push(pointsMoved(base.pairs, c.pairs));
        row.shiftBoardNet.push(c.points - base.points);
      }
      rows.push(row);
    }
    writeFileSync("out/join-cost.floor.json", JSON.stringify(rows));
  }
  // The floor of each router: the sum over its 75 boards, one sum for each seed. The interval of each board is over its 5 seeds.
  const mine = rows.filter((r) => r.router === router.name);
  const sum = (key: "shiftNew" | "shiftOld" | "shiftBoard" | "shiftNewNet" | "shiftOldNet" | "shiftBoardNet"): number[] => SEEDS.map((_, i) => mine.reduce((t, r) => t + r[key][i]!, 0));
  const perBoard = mine.map((r) => Math.max(...r.shiftNew));
  log(
    `ROUTER ${router.name}: points ${mine.reduce((t, r) => t + r.points, 0)}, pairs ${mine.reduce((t, r) => t + r.pairs, 0)}; old to new: moved ${mine.reduce((t, r) => t + r.oldNew, 0)}, net ${mine.reduce((t, r) => t + r.oldNewNet, 0)}, pairs ${mine.reduce((t, r) => t + r.oldNewPairs, 0)}, boards ${mine.filter((r) => r.oldNew > 0).length}; ` +
      `shift new moved ${sum("shiftNew").join(",")} net ${sum("shiftNewNet").join(",")}; shift old moved ${sum("shiftOld").join(",")} net ${sum("shiftOldNet").join(",")}; shift board moved ${sum("shiftBoard").join(",")} net ${sum("shiftBoardNet").join(",")}, routes moved ${SEEDS.map((_, i) => mine.reduce((t, r) => t + r.routesMoved[i]!, 0)).join(",")}; ` +
      `median-of-board interval ${JSON.stringify(bootstrapMedian(perBoard))}, board p95 ${quantile(perBoard, 0.95)}, max ${Math.max(...perBoard)}`,
  );
}
// The floor of each family, over all routers with ways, by the worst of 5 seeds on each board.
for (const f of HIGHWAYS_FAMILIES) {
  const mine = rows.filter((r) => r.family === f.name && r.router !== "corners");
  const worst = mine.map((r) => Math.max(...r.shiftNew));
  log(`FAMILY ${f.name}: points ${mine.reduce((t, r) => t + r.points, 0)}, old to new moved ${mine.reduce((t, r) => t + r.oldNew, 0)}, shift new worst ${Math.max(...worst)}, median interval ${JSON.stringify(bootstrapMedian(worst))}, shift board worst ${Math.max(...mine.map((r) => Math.max(...r.shiftBoard)))}`);
}
console.log("done");
