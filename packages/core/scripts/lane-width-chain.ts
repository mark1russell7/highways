// This script compares the arms of LANE-WIDTH-CHAIN and writes their record. It only reports, and it is not a gate.
// A width rule sets the room of each way. A jog rule sets the length of each S curve. Each arm is one pair of those rules.
// The arm `none lane` is the base of each rise. The painted crossing points and pairs are the measure, and the bundle counts are report rows.
// The rules `even-*` narrow each way by one scale, so they measure the part of the cost that comes from narrowness alone.
// `node packages/core/scripts/lane-width-chain.ts <out.json>` writes the record.
import { writeFileSync } from "node:fs";
import { measureHighways } from "../src/bench/curves.ts";
import { crossingPairs, type EdgeLine } from "../src/bench/measures/crossing-pairs.ts";
import { curveSpace, sampleCurve, type JogSpan } from "../src/curves/index.ts";
import { highwayCurves } from "../src/curves/highway/index.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { dist, polylineLength, segmentsCross, type Point } from "../src/geom.ts";
import { LANE_CLEAR } from "../src/lane-room.ts";
import type { Graph } from "../src/model.ts";
import { ROUTERS, sectionsRouter } from "../src/routers/index.ts";
import { laneOffset, laneRoutes, runKey, segmentsOf, type Segment, type SegmentGraph } from "../src/segments.ts";

const LANES = { width: 5, maxWidth: 30 };
const PAINT = { radius: 12, minRadius: 4 };
const SAMPLE = 0.02;
const SEEDS = [0, 1, 2];
/** A crossing this near to the end of a line counts as a crossing at a plug. */
const PLUG_REACH = 12;
/** A crossing this near to a change of offset counts as a crossing at a width step. */
const STEP_REACH = 30;

const spacingOf = (s: Segment): number => Math.min(LANES.width, LANES.maxWidth / (s.count - 1));
const widestOf = (s: Segment): number => ((s.count - 1) / 2) * spacingOf(s);
const sideScale = (s: Segment, room: number): number => Math.min(1, Math.max((room - LANE_CLEAR) / widestOf(s), 1 / spacingOf(s)));
const scaleOf = (s: Segment): number => (s.room === undefined ? 1 : Math.min(sideScale(s, s.room.left), sideScale(s, s.room.right)));

const bare = (g: SegmentGraph): SegmentGraph => ({
  ...g,
  segments: g.segments.map((s) => {
    const { room: _room, ...rest } = s;
    return rest;
  }),
});

/** This function narrows each way by one scale. A scale of 0 gives the smallest distance. */
const even = (g: SegmentGraph, scale: number): SegmentGraph => ({
  ...g,
  segments: bare(g).segments.map((s) => {
    if (s.count <= 1) return s;
    const room = scale === 0 ? 0 : LANE_CLEAR + scale * widestOf(s);
    return { ...s, room: { left: room, right: room } };
  }),
});

/** This function gives the open ways that an edge takes next, with no private part between them. */
function neighbors(g: SegmentGraph): Map<string, Set<string>> {
  const byId = new Map(g.segments.map((s) => [s.id, s]));
  const out = new Map(g.segments.filter((s) => s.count > 1).map((s) => [s.id, new Set<string>()]));
  for (const path of g.paths) {
    for (let i = 1; i < path.segments.length; i++) {
      const [a, b] = [byId.get(path.segments[i - 1]!.segment), byId.get(path.segments[i]!.segment)];
      if (a && b && a.count > 1 && b.count > 1) {
        out.get(a.id)!.add(b.id);
        out.get(b.id)!.add(a.id);
      }
    }
  }
  return out;
}

/**
 * This function carries the narrowest value of a way to its neighbors, over `hops` rounds.
 * A value is a scale, or the distance of two lanes when `gap` is true. The factor `ease` lets the value grow at each hop.
 */
function chain(g: SegmentGraph, hops: number, gap: boolean, ease: number): SegmentGraph {
  const near = neighbors(g);
  const value = new Map<string, number>();
  for (const s of g.segments) if (s.count > 1) value.set(s.id, gap ? scaleOf(s) * spacingOf(s) : scaleOf(s));
  for (let h = 0; h < hops; h++) {
    const next = new Map(value);
    let moved = false;
    for (const [id, set] of near) {
      for (const other of set) {
        const v = value.get(other)! * ease;
        if (v < next.get(id)! - 1e-9) {
          next.set(id, v);
          moved = true;
        }
      }
    }
    for (const [k, v] of next) value.set(k, v);
    if (!moved) break;
  }
  const segments = g.segments.map((s) => {
    if (s.count <= 1 || s.room === undefined) return s;
    const v = value.get(s.id)!;
    const scale = gap ? v / spacingOf(s) : v;
    if (scale >= 1) return s;
    const room = LANE_CLEAR + scale * widestOf(s);
    return { ...s, room: { left: Math.min(s.room.left, room), right: Math.min(s.room.right, room) } };
  });
  return { ...g, segments };
}

const WIDTHS: Record<string, (g: SegmentGraph) => SegmentGraph> = {
  none: bare,
  room: (g) => g,
  "even-0.75": (g) => even(g, 0.75),
  "even-0.5": (g) => even(g, 0.5),
  "even-least": (g) => even(g, 0),
  "scale-1": (g) => chain(g, 1, false, 1),
  "scale-2": (g) => chain(g, 2, false, 1),
  "scale-all": (g) => chain(g, 99, false, 1),
  "scale-ease": (g) => chain(g, 99, false, 1.5),
  "gap-1": (g) => chain(g, 1, true, 1),
  "gap-all": (g) => chain(g, 99, true, 1),
  "gap-ease": (g) => chain(g, 99, true, 1.5),
};
const ARMS: readonly { readonly width: string; readonly jog: JogSpan }[] = [
  ...Object.keys(WIDTHS).map((width) => ({ width, jog: "lane" as const })),
  ...["none", "room", "even-0.75", "scale-all", "gap-all"].map((width) => ({ width, jog: "step" as const })),
];

/** This function gives the places where the lane of each edge changes its offset, from one open way to the next. */
function stepsOf(g: SegmentGraph): Map<string, Point[]> {
  const byId = new Map(g.segments.map((s) => [s.id, s]));
  const out = new Map<string, Point[]>();
  for (const path of g.paths) {
    const steps: Point[] = [];
    for (let i = 1; i < path.segments.length; i++) {
      const [ra, rb] = [path.segments[i - 1]!, path.segments[i]!];
      const [a, b] = [byId.get(ra.segment)!, byId.get(rb.segment)!];
      if (a.count <= 1 || b.count <= 1) continue;
      const offset = (s: Segment, lane: number, reverse: boolean): number => (reverse ? -1 : 1) * laneOffset(s, lane, spacingOf(s)).offset;
      if (Math.abs(offset(a, ra.lane, ra.reverse) - offset(b, rb.lane, rb.reverse)) > 1e-6) steps.push(ra.reverse ? a.points[0]! : a.points[a.points.length - 1]!);
    }
    out.set(path.edge, steps);
  }
  return out;
}

/** This function gives the places where two lines cross. */
function crossingsOf(A: readonly Point[], B: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < A.length; i++) {
    const [a, b] = [A[i - 1]!, A[i]!];
    const [x0, x1, y0, y1] = [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.y, b.y), Math.max(a.y, b.y)];
    for (let j = 1; j < B.length; j++) {
      const [c, d] = [B[j - 1]!, B[j]!];
      if (Math.max(c.x, d.x) < x0 || Math.min(c.x, d.x) > x1 || Math.max(c.y, d.y) < y0 || Math.min(c.y, d.y) > y1) continue;
      if (segmentsCross(a, b, c, d)) out.push(a);
    }
  }
  return out;
}

interface Painted {
  readonly lines: readonly EdgeLine[];
  readonly pairs: ReadonlyMap<string, number>;
  readonly body: number;
  readonly ends: number;
}

function paint(board: Graph, g: SegmentGraph, open: ReadonlySet<string>, jogSpan: JogSpan): Painted {
  const space = curveSpace(board.nodes.map((n) => n.box));
  const curves = highwayCurves(g, open, LANES.width, { maxWidth: LANES.maxWidth, space, jogSpan });
  const bundle = measureHighways(g, open, LANES.width, curves, { maxWidth: LANES.maxWidth, minRadius: PAINT.minRadius, ends: PAINT.radius });
  const lines = curves.map((c) => ({ edge: c.edge, points: sampleCurve(c.segments, SAMPLE) }));
  return { lines, pairs: crossingPairs(lines), body: bundle.crossings, ends: bundle.endCrossings };
}

interface Rise {
  rise: number;
  fall: number;
  /** The crossings of pairs that did not cross before, and the count of those pairs that cross at least twice. */
  newPairs: number;
  zeroToTwo: number;
  /** The crossings of pairs that crossed before and cross more. */
  rose: number;
  step: number;
  plug: number;
  both: number;
  other: number;
}
const noRise = (): Rise => ({ rise: 0, fall: 0, newPairs: 0, zeroToTwo: 0, rose: 0, step: 0, plug: 0, both: 0, other: 0 });

/** This function adds the change from `before` to `after`, and the class of the place of each pair that rises. */
function addRise(total: Rise, before: Painted, after: Painted, steps: ReadonlyMap<string, readonly Point[]>): void {
  const lineOf = new Map(after.lines.map((l) => [l.edge, l.points]));
  const near = (p: Point, list: readonly Point[], reach: number): boolean => list.some((q) => dist(p, q) <= reach);
  for (const key of new Set([...before.pairs.keys(), ...after.pairs.keys()])) {
    const [b, a] = [before.pairs.get(key) ?? 0, after.pairs.get(key) ?? 0];
    if (a < b) total.fall += b - a;
    if (a <= b) continue;
    total.rise += a - b;
    if (b === 0) {
      total.newPairs += a;
      if (a >= 2) total.zeroToTwo++;
    } else total.rose += a - b;
    const [e, f] = key.split("|") as [string, string];
    const [A, B] = [lineOf.get(e)!, lineOf.get(f)!];
    const ends = [A[0]!, A[A.length - 1]!, B[0]!, B[B.length - 1]!];
    const allSteps = [...(steps.get(e) ?? []), ...(steps.get(f) ?? [])];
    // A pair with more crossings than the arm before has no mark for the new crossing, so each crossing of the pair adds one share of the rise.
    const places = crossingsOf(A, B);
    for (const p of places) {
      const [atStep, atPlug] = [near(p, allSteps, STEP_REACH), near(p, ends, PLUG_REACH)];
      const share = (a - b) / places.length;
      if (atStep && atPlug) total.both += share;
      else if (atStep) total.step += share;
      else if (atPlug) total.plug += share;
      else total.other += share;
    }
  }
}

const site = sectionsRouter({ name: "sections-site", margin: 20, stretch: 3, cap: 6 });
const routers = [...["shared", "shared-all", "sections"].map((n) => ROUTERS.find((r) => r.name === n)!), site];
const registry = highwaysRegistry();
const boards = HIGHWAYS_FAMILIES.flatMap((f) => SEEDS.map((seed) => ({ family: f.name, seed })));
const rows: unknown[] = [];
for (const router of routers) {
  const totals = ARMS.map(() => ({ points: 0, pairs: 0, body: 0, ends: 0, length: 0, boardsFall: 0, against: noRise(), jog: noRise(), byBoard: [] as (readonly [number, number])[] }));
  for (const { family, seed } of boards) {
    const board = registry.generate(family, seed).graph;
    const g = segmentsOf(router.route(board));
    const open = new Set(g.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
    const widths = new Map(Object.entries(WIDTHS).map(([name, make]) => [name, make(g)]));
    const painted = ARMS.map((arm) => paint(board, widths.get(arm.width)!, open, arm.jog));
    const base = painted[0]!;
    const sum = (p: Painted): number => [...p.pairs.values()].reduce((s, n) => s + n, 0);
    ARMS.forEach((arm, i) => {
      const [t, p, c] = [totals[i]!, painted[i]!, widths.get(arm.width)!];
      const points = sum(p);
      t.points += points;
      t.pairs += p.pairs.size;
      t.body += p.body;
      t.ends += p.ends;
      if (points < sum(base)) t.boardsFall++;
      t.byBoard.push([points, p.pairs.size]);
      for (const r of laneRoutes(c, open, LANES.width, LANES.maxWidth)) t.length += polylineLength(r.points);
      const steps = stepsOf(c);
      addRise(t.against, base, p, steps);
      if (arm.jog === "step") addRise(t.jog, painted[ARMS.findIndex((o) => o.width === arm.width && o.jog === "lane")]!, p, steps);
    });
    console.log(router.name, family, seed);
  }
  ARMS.forEach((arm, i) => rows.push({ router: router.name, width: arm.width, jog: arm.jog, ...totals[i]! }));
  writeFileSync(process.argv[2]!, `${JSON.stringify({ schema: "lane-width-chain/1", lanes: LANES, paint: PAINT, sample: SAMPLE, seeds: SEEDS, stepReach: STEP_REACH, plugReach: PLUG_REACH, bundleCounter: 1, boards, rows }, null, 1)}\n`);
}
