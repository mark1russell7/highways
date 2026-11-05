/**
 * This module makes the record `paint-tie/1` (PAINT-TIE).
 * `crossingPairs` reads each point on the grid `EPS_STEPS`. The record tells what that grid removes from the count of floats, and how far a small shift still moves the count.
 * A flip needs an end of a segment that rounds to another place of the grid. So the record compares the rate of flips with 2 x move / grid, and a float count is the control of each shift.
 */
import { EPS, pointSegmentDistance } from "@mark1russell7/layout-contract";
import { classifySegments } from "@mark1russell7/predicates";
import { deriveSeed, mulberry32, seedOf } from "@mark1russell7/rigor-generators";
import { wilson } from "@mark1russell7/rigor-statistics";
import { crossingPairs, eachCrossing, PAINT_COUNTER, snapLines, type EdgeLine, type LineSegment } from "../src/bench/measures/crossing-pairs.ts";
import { laneCrossings } from "../src/bench/measures/lanes.ts";
import { dist, snapToEps, type Point } from "../src/geom.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import type { Graph, Result } from "../src/model.ts";
import { laneRoutes, runKey, segmentsOf } from "../src/segments.ts";
import { routerOf } from "./route-pairs-rows.ts";
import { LANES, painted } from "./through-check-rows.ts";

/** The command that writes the record again. */
export const REGENERATE = "node packages/core/scripts/paint-tie.ts packages/core/scripts/data/paint-tie/record.json";
/** The version of the record. */
export const SCHEMA = "paint-tie/1";
/** The routers of the record. */
export const NAMES = ["shared-all", "sections", "sections-site"] as const;
/** The largest move of each shift of the record. */
export const MOVES = [1e-12, 1e-10, 1e-8, 1e-7] as const;
/**
 * The largest moves of the arms of a translation. A host can move a whole board by any amount. The rooms do not change, so these arms have only the form `lines`.
 * The move 0.5 gives a dyadic shift with at most 34 fraction bits, so float addition is exact and float reads no rounding. The move 0.3 gives a shift that float addition rounds. The move 7 gives a whole number on each axis.
 */
export const TRANSLATIONS = [0.5, 0.3, 7] as const;
/** The size of the arm `corner`: one more line that crosses nothing moves the low corner of the lines by a fraction. An edit of a board can do this. */
export const CORNER_MOVE = 0.3;
/** The named seeds of the shifts. */
export const VECTORS = ["shift-a", "shift-b", "shift-c", "shift-d", "shift-e"] as const;
/** The seeds of each family. */
export const SEEDS = 3;

/** The shift of one seed at one size. The size of each axis is between half of the move and the move, with its own sign. */
export function shiftOf(name: string, move: number): { readonly dx: number; readonly dy: number } {
  const next = mulberry32(deriveSeed(seedOf(name), String(move)));
  const axis = (): number => (next() < 0.5 ? -1 : 1) * move * (0.5 + 0.5 * next());
  return { dx: axis(), dy: axis() };
}

/** The shift of one seed for one translation. A whole move gives a whole number on each axis. */
export function translationOf(name: string, move: number): { readonly dx: number; readonly dy: number } {
  const shift = shiftOf(name, move);
  return Number.isInteger(move) ? { dx: Math.round(shift.dx), dy: Math.round(shift.dy) } : shift;
}

/** This function moves each point of the lines by one shift. */
function shiftLines(lines: readonly EdgeLine[], shift: { readonly dx: number; readonly dy: number }): EdgeLine[] {
  return lines.map((line) => ({ edge: line.edge, points: line.points.map((p) => ({ x: p.x + shift.dx, y: p.y + shift.dy })) }));
}

/** This function adds one short line under and to the left of each point. The line crosses nothing, so each change of a count comes from the grid. */
function withCornerLine(lines: readonly EdgeLine[], shift: { readonly dx: number; readonly dy: number }): EdgeLine[] {
  const points = lines.flatMap((line) => line.points);
  const x = points.reduce((low, p) => Math.min(low, p.x), Infinity) - 1 - Math.abs(shift.dx);
  const y = points.reduce((low, p) => Math.min(low, p.y), Infinity) - 1 - Math.abs(shift.dy);
  return [...lines, { edge: "corner-line", points: [{ x, y }, { x: x - 1, y }] }];
}

/** This function moves each side of each room by the move, with a sign from the seed. A room stays at 0 or over 0. */
function shiftRooms(result: Result, name: string, move: number): Result {
  if (!result.runs) return result;
  const next = mulberry32(deriveSeed(seedOf(name), `rooms-${move}`));
  const by = (): number => (next() < 0.5 ? -move : move);
  return { ...result, runs: result.runs.map((run) => (run.room ? { ...run, room: { left: Math.max(0, run.room.left + by()), right: Math.max(0, run.room.right + by()) } } : run)) };
}

/** This function gives the sum of the absolute changes of the count of each pair. */
export function moved(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
  let sum = 0;
  for (const key of new Set([...a.keys(), ...b.keys()])) sum += Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0));
  return sum;
}

/** This function gives the distance from the nearest end of a segment to the other segment. A crossing with a touch of 0 has an end on the other segment. */
export function touchOf(s: LineSegment, o: LineSegment): number {
  return Math.min(pointSegmentDistance(s.a, o.a, o.b), pointSegmentDistance(s.b, o.a, o.b), pointSegmentDistance(o.a, s.a, s.b), pointSegmentDistance(o.b, s.a, s.b));
}

/** This function gives the distance from the crossing point of the lines of two segments to the nearest end of a segment. */
function crossToEnd(s: LineSegment, o: LineSegment): number {
  const [rx, ry, qx, qy] = [s.b.x - s.a.x, s.b.y - s.a.y, o.b.x - o.a.x, o.b.y - o.a.y];
  const denominator = rx * qy - ry * qx;
  if (denominator === 0) return 0;
  const t = ((o.a.x - s.a.x) * qy - (o.a.y - s.a.y) * qx) / denominator;
  const at: Point = { x: s.a.x + t * rx, y: s.a.y + t * ry };
  return Math.min(dist(at, s.a), dist(at, s.b), dist(at, o.a), dist(at, o.b));
}

/** The form of a shift of the record. */
export type ShiftForm = "lines" | "rooms" | "corner" | "frame";

/** One far crossing, so that a reader can examine it by hand. */
export interface FarCrossing {
  readonly points: readonly [Point, Point, Point, Point];
  readonly touch: number;
  readonly toEnd: number;
  readonly sine: number;
}

/** The record keeps this count of far crossings for each read. These have the widest angles. */
export const FAR_KEPT = 3;

/** The crossings that one count has and another count does not have. */
export interface OnlyIn {
  readonly count: number;
  /** The largest touch of these crossings on the float points, and the largest distance from a crossing point to an end. */
  readonly widest: number;
  readonly widestToEnd: number;
  /** The crossings with a touch at the grid or over it. A count over 0 on the lost crossings of the grid is a real crossing lost. */
  readonly overGrid: number;
  /** The crossings by the size of the touch. */
  readonly under1e9: number;
  readonly under1e6: number;
  /** The crossings with a crossing point at the grid or over it from each end. A small touch and a far point give a pair that lies on one line. */
  readonly farFromEnd: number;
  /** The largest sine of the angle of the pair, over the far crossings. */
  readonly widestFarSine: number;
  /** The far crossings with a sine at 1e-6 or over it. A count over 0 is a pair with an angle that is not rounding. */
  readonly farWithAngle: number;
  /** The far crossings with the widest angles. */
  readonly farWidest: readonly FarCrossing[];
}

const NONE: OnlyIn = { count: 0, widest: 0, widestToEnd: 0, overGrid: 0, under1e9: 0, under1e6: 0, farFromEnd: 0, widestFarSine: 0, farWithAngle: 0, farWidest: [] };

/** This function adds two reads of crossings. */
function addOnly(a: OnlyIn, b: OnlyIn): OnlyIn {
  return {
    count: a.count + b.count,
    widest: Math.max(a.widest, b.widest),
    widestToEnd: Math.max(a.widestToEnd, b.widestToEnd),
    overGrid: a.overGrid + b.overGrid,
    under1e9: a.under1e9 + b.under1e9,
    under1e6: a.under1e6 + b.under1e6,
    farFromEnd: a.farFromEnd + b.farFromEnd,
    widestFarSine: Math.max(a.widestFarSine, b.widestFarSine),
    farWithAngle: a.farWithAngle + b.farWithAngle,
    farWidest: [...a.farWidest, ...b.farWidest].sort((x, y) => y.sine - x.sine).slice(0, FAR_KEPT),
  };
}

/** This function gives the sine of the angle of two segments. */
function sineOf(s: LineSegment, o: LineSegment): number {
  const [ax, ay, bx, by] = [s.b.x - s.a.x, s.b.y - s.a.y, o.b.x - o.a.x, o.b.y - o.a.y];
  const size = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return size === 0 ? 0 : Math.abs(ax * by - ay * bx) / size;
}

/** The crossings of one count, by the numbers of their segments. */
type Crossings = Map<string, { readonly s: LineSegment; readonly o: LineSegment }>;

/** This function gives the crossings of the lines under one test. */
function crossings(lines: readonly EdgeLine[], test?: (a: Point, b: Point, c: Point, d: Point) => boolean): Crossings {
  const out: Crossings = new Map();
  eachCrossing(lines, (s, o) => out.set(`${s.line}:${s.index}:${o.line}:${o.index}`, { s, o }), test);
  return out;
}

/** This function reads the crossings of `a` that `b` does not have. The touch reads the float points of `floats`. */
function onlyIn(a: Crossings, b: Crossings, floats: Crossings, lines: readonly EdgeLine[]): OnlyIn {
  let read = NONE;
  for (const [key, { s, o }] of a) {
    if (b.has(key)) continue;
    const own = floats.get(key);
    const at = (x: LineSegment): LineSegment => ({ ...x, a: lines[x.line]!.points[x.index]!, b: lines[x.line]!.points[x.index + 1]! });
    const [fs, fo] = own ? [own.s, own.o] : [at(s), at(o)];
    const touch = touchOf(fs, fo);
    const toEnd = crossToEnd(fs, fo);
    const far = toEnd >= EPS;
    const sine = far ? sineOf(fs, fo) : 0;
    read = addOnly(read, {
      count: 1,
      widest: touch,
      widestToEnd: toEnd,
      overGrid: touch >= EPS ? 1 : 0,
      under1e9: touch < 1e-9 ? 1 : 0,
      under1e6: touch < 1e-6 ? 1 : 0,
      farFromEnd: far ? 1 : 0,
      widestFarSine: sine,
      farWithAngle: sine >= 1e-6 ? 1 : 0,
      farWidest: far ? [{ points: [fs.a, fs.b, fo.a, fo.b], touch, toEnd, sine }] : [],
    });
  }
  return read;
}

/** This function counts the pairs of segments of two edges that come closer than the grid and do not meet, and the crossings among them. */
function nearPairs(lines: readonly EdgeLine[], floats: Crossings): { readonly near: number; readonly nearCrossings: number } {
  let near = 0;
  let nearCrossings = 0;
  const box = (s: LineSegment, o: LineSegment): boolean =>
    Math.max(o.a.x, o.b.x) >= Math.min(s.a.x, s.b.x) - EPS &&
    Math.min(o.a.x, o.b.x) <= Math.max(s.a.x, s.b.x) + EPS &&
    Math.max(o.a.y, o.b.y) >= Math.min(s.a.y, s.b.y) - EPS &&
    Math.min(o.a.y, o.b.y) <= Math.max(s.a.y, s.b.y) + EPS;
  const inside = (touch: number): boolean => touch > 0 && touch < EPS;
  eachCrossing(
    lines,
    (s, o) => {
      near++;
      if (floats.has(`${s.line}:${s.index}:${o.line}:${o.index}`)) nearCrossings++;
    },
    (a, b, c, d) => {
      const [s, o]: readonly [LineSegment, LineSegment] = [{ line: 0, index: 0, a, b }, { line: 0, index: 0, a: c, b: d }];
      return box(s, o) && inside(touchOf(s, o));
    },
  );
  return { near, nearCrossings };
}

/** The read of one router and one kind of line at one shift. */
export interface ShiftRow {
  readonly move: number;
  readonly vector: string;
  /**
   * The form of the shift: `lines` moves each point of the board by one vector, and the frame of the boxes with it. `rooms` moves each room, and the lines follow.
   * `corner` moves no line and adds one line at a new low corner. `frame` moves no line and moves the frame of the boxes, as a box that a host adds at a new low corner does.
   */
  readonly form: ShiftForm;
  /** The largest size of the shift on an axis, and its mean over the two axes for the form `lines`. */
  readonly meanMove: number;
  readonly floatMoved: number;
  readonly snapMoved: number;
  /** The moved pairs on a grid that starts at the low corner of the board. */
  readonly anchoredMoved: number;
  /** The moved pairs on a grid that starts at the low corner of the input boxes. */
  readonly framedMoved: number;
}

/** The read of one router and one kind of line over the boards. */
export interface KindRow {
  readonly router: string;
  readonly kind: "painted" | "polyline";
  readonly floatPoints: number;
  readonly snapPoints: number;
  readonly exactPoints: number;
  /** The crossing points on a grid that starts at the low corner of the board. */
  readonly anchoredPoints: number;
  /** The crossing points on a grid that starts at the low corner of the input boxes. */
  readonly framedPoints: number;
  readonly floatPairs: number;
  readonly snapPairs: number;
  readonly exactPairs: number;
  readonly anchoredPairs: number;
  readonly framedPairs: number;
  /** The crossings of the floats that the grid removes, and the crossings that the grid adds. */
  readonly lost: OnlyIn;
  readonly added: OnlyIn;
  /** The crossings that the exact test adds to the floats, and the crossings of the floats that it removes. */
  readonly exactAdded: OnlyIn;
  readonly exactLost: OnlyIn;
  /** The pairs of segments with a touch over 0 and under the grid, and the crossings among them. */
  readonly near: number;
  readonly nearCrossings: number;
  readonly shifts: readonly ShiftRow[];
}

/** The lines of a board with the lanes open. */
function linesOf(board: Graph, result: Result): { readonly painted: readonly EdgeLine[]; readonly polyline: readonly EdgeLine[] } {
  const graph = segmentsOf(result);
  const open = new Set(graph.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
  return { painted: painted(board, graph, open).lines, polyline: laneRoutes(graph, open, LANES.width, LANES.maxWidth).map((r) => ({ edge: r.edge, points: r.points })) };
}

/** This function gives the float count of the pairs, the control of the snap. */
function floatPairs(lines: readonly EdgeLine[]): ReadonlyMap<string, number> {
  const pairs = new Map<string, number>();
  eachCrossing(lines, (s, o) => {
    const key = [lines[s.line]!.edge, lines[o.line]!.edge].sort().join("|");
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  });
  return pairs;
}

/** This function rounds each point on a grid that starts at the low corner of the lines, so a rigid shift keeps each rounding. */
function anchored(lines: readonly EdgeLine[]): EdgeLine[] {
  let [x0, y0] = [Infinity, Infinity];
  for (const line of lines) {
    for (const p of line.points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
    }
  }
  return lines.map((line) => ({ edge: line.edge, points: line.points.map((p) => snapToEps({ x: p.x - x0, y: p.y - y0 })) }));
}

/** The origin of a grid. */
interface Frame {
  readonly x: number;
  readonly y: number;
}

/** This function gives the low corner of the input boxes. Each router on one board reads this one origin. */
function frameOf(board: Graph): Frame {
  let [x, y] = [Infinity, Infinity];
  for (const node of board.nodes) {
    x = Math.min(x, node.box.x);
    y = Math.min(y, node.box.y);
  }
  return { x, y };
}

/** This function rounds each point on a grid that starts at the frame. */
function framed(lines: readonly EdgeLine[], frame: Frame): EdgeLine[] {
  return lines.map((line) => ({ edge: line.edge, points: line.points.map((p) => snapToEps({ x: p.x - frame.x, y: p.y - frame.y })) }));
}

const exact = (a: Point, b: Point, c: Point, d: Point): boolean => classifySegments(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y).relation === "cross";

/** One sum of a kind over the boards. */
type Sum = { -readonly [K in keyof Omit<KindRow, "router" | "kind" | "shifts">]: KindRow[K] } & { readonly shifts: Map<string, { -readonly [K in keyof ShiftRow]: ShiftRow[K] }> };

const emptySum = (): Sum => ({
  floatPoints: 0,
  snapPoints: 0,
  exactPoints: 0,
  anchoredPoints: 0,
  framedPoints: 0,
  floatPairs: 0,
  snapPairs: 0,
  exactPairs: 0,
  anchoredPairs: 0,
  framedPairs: 0,
  lost: NONE,
  added: NONE,
  exactAdded: NONE,
  exactLost: NONE,
  near: 0,
  nearCrossings: 0,
  shifts: new Map(),
});

const total = (pairs: ReadonlyMap<string, number>): number => [...pairs.values()].reduce((sum, n) => sum + n, 0);

/** This function adds one set of lines of a board to a sum. */
function addLines(sum: Sum, lines: readonly EdgeLine[], frame: Frame): void {
  const snapped = snapLines(lines);
  const [floats, snaps, exacts] = [crossings(lines), crossings(snapped), crossings(lines, exact)];
  const [fp, sp, ep] = [floatPairs(lines), crossingPairs(lines), new Set([...exacts.values()].map(({ s, o }) => [lines[s.line]!.edge, lines[o.line]!.edge].sort().join("|")))];
  sum.floatPoints += floats.size;
  sum.snapPoints += snaps.size;
  sum.exactPoints += exacts.size;
  const fixedLines = anchored(lines);
  sum.anchoredPoints += crossings(fixedLines).size;
  sum.anchoredPairs += floatPairs(fixedLines).size;
  const framedLines = framed(lines, frame);
  sum.framedPoints += crossings(framedLines).size;
  sum.framedPairs += floatPairs(framedLines).size;
  sum.floatPairs += fp.size;
  sum.snapPairs += sp.size;
  sum.exactPairs += ep.size;
  sum.lost = addOnly(sum.lost, onlyIn(floats, snaps, floats, lines));
  sum.added = addOnly(sum.added, onlyIn(snaps, floats, floats, lines));
  sum.exactAdded = addOnly(sum.exactAdded, onlyIn(exacts, floats, floats, lines));
  sum.exactLost = addOnly(sum.exactLost, onlyIn(floats, exacts, floats, lines));
  const { near, nearCrossings } = nearPairs(lines, floats);
  sum.near += near;
  sum.nearCrossings += nearCrossings;
}

/** This function adds one shift of one board to a sum. */
function addShift(sum: Sum, form: ShiftForm, move: number, vector: string, meanMove: number, base: readonly EdgeLine[], other: readonly EdgeLine[], frame: Frame, otherFrame: Frame): void {
  const key = `${form}/${move}/${vector}`;
  const row = sum.shifts.get(key) ?? { move, vector, form, meanMove, floatMoved: 0, snapMoved: 0, anchoredMoved: 0, framedMoved: 0 };
  row.floatMoved += moved(floatPairs(base), floatPairs(other));
  row.snapMoved += moved(crossingPairs(base), crossingPairs(other));
  row.anchoredMoved += moved(floatPairs(anchored(base)), floatPairs(anchored(other)));
  row.framedMoved += moved(floatPairs(framed(base, frame)), floatPairs(framed(other, otherFrame)));
  sum.shifts.set(key, row);
}

/** This function reads each router on the boards of the families. */
export function kindRows(families?: readonly string[], seeds: number = SEEDS, log?: (line: string) => void): KindRow[] {
  const registry = highwaysRegistry();
  const sums = new Map<string, Sum>();
  const of = (router: string, kind: string): Sum => {
    const key = `${router}/${kind}`;
    const found = sums.get(key);
    if (found) return found;
    const fresh = emptySum();
    sums.set(key, fresh);
    return fresh;
  };
  for (const family of HIGHWAYS_FAMILIES) {
    if (families && !families.includes(family.name)) continue;
    for (let seed = 0; seed < seeds; seed++) {
      const board = registry.generate(family.name, seed).graph;
      const frame = frameOf(board);
      const moveFrame = (shift: { readonly dx: number; readonly dy: number }): Frame => ({ x: frame.x + shift.dx, y: frame.y + shift.dy });
      for (const name of NAMES) {
        const result = routerOf(name).route(board);
        const base = linesOf(board, result);
        addLines(of(name, "painted"), base.painted, frame);
        addLines(of(name, "polyline"), base.polyline, frame);
        for (const move of MOVES) {
          for (const vector of VECTORS) {
            const shift = shiftOf(vector, move);
            const mean = (Math.abs(shift.dx) + Math.abs(shift.dy)) / 2;
            addShift(of(name, "painted"), "lines", move, vector, mean, base.painted, shiftLines(base.painted, shift), frame, moveFrame(shift));
            addShift(of(name, "polyline"), "lines", move, vector, mean, base.polyline, shiftLines(base.polyline, shift), frame, moveFrame(shift));
            const rooms = linesOf(board, shiftRooms(result, vector, move));
            addShift(of(name, "painted"), "rooms", move, vector, move, base.painted, rooms.painted, frame, frame);
            addShift(of(name, "polyline"), "rooms", move, vector, move, base.polyline, rooms.polyline, frame, frame);
          }
        }
        for (const move of TRANSLATIONS) {
          for (const vector of VECTORS) {
            const shift = translationOf(vector, move);
            const mean = (Math.abs(shift.dx) + Math.abs(shift.dy)) / 2;
            addShift(of(name, "painted"), "lines", move, vector, mean, base.painted, shiftLines(base.painted, shift), frame, moveFrame(shift));
            addShift(of(name, "polyline"), "lines", move, vector, mean, base.polyline, shiftLines(base.polyline, shift), frame, moveFrame(shift));
          }
        }
        for (const vector of VECTORS) {
          const shift = shiftOf(vector, CORNER_MOVE);
          const mean = (Math.abs(shift.dx) + Math.abs(shift.dy)) / 2;
          addShift(of(name, "painted"), "corner", CORNER_MOVE, vector, mean, base.painted, withCornerLine(base.painted, shift), frame, frame);
          addShift(of(name, "polyline"), "corner", CORNER_MOVE, vector, mean, base.polyline, withCornerLine(base.polyline, shift), frame, frame);
          addShift(of(name, "painted"), "frame", CORNER_MOVE, vector, mean, base.painted, base.painted, frame, moveFrame(shift));
          addShift(of(name, "polyline"), "frame", CORNER_MOVE, vector, mean, base.polyline, base.polyline, frame, moveFrame(shift));
        }
      }
    }
    log?.(family.name);
  }
  return [...sums].map(([key, sum]) => {
    const [router, kind] = key.split("/") as [string, "painted" | "polyline"];
    return { router, kind, ...sum, shifts: [...sum.shifts.values()] };
  });
}

/** The direct read of two routers on one board: each router on its own low corner, and each router on the frame of the boxes. */
export interface PairOnBoardRow {
  readonly routers: readonly [string, string];
  readonly kind: "painted" | "polyline";
  readonly boards: number;
  /** The boards where the low corners of the lines of the two routers differ. */
  readonly cornersDiffer: number;
  /** The moved pairs of each router, from the frame to its own corner, and the crossing pairs of each router on the frame. */
  readonly moved: readonly [number, number];
  readonly pairs: readonly [number, number];
  /** The boards where the sign of the difference of the two counts changes from the frame to the own corners. */
  readonly signFlips: number;
  /** The sum over the boards of the change of the difference of the two counts. */
  readonly gapChange: number;
}

/** The pairs of routers of the direct read. */
export const BOARD_PAIRS: readonly (readonly [string, string])[] = [
  ["shared-all", "sections"],
  ["sections", "sections-site"],
  ["shared-all", "sections-site"],
];

/** This function reads two routers on one board with one grid for each router, and with one grid for both. */
export function pairOnBoardRows(families?: readonly string[], seeds: number = SEEDS): PairOnBoardRow[] {
  const registry = highwaysRegistry();
  const rows = new Map<string, { -readonly [K in keyof PairOnBoardRow]: PairOnBoardRow[K] }>();
  const lowCorner = (lines: readonly EdgeLine[]): string => {
    let [x, y] = [Infinity, Infinity];
    for (const line of lines) {
      for (const p of line.points) {
        x = Math.min(x, p.x);
        y = Math.min(y, p.y);
      }
    }
    return `${x},${y}`;
  };
  for (const family of HIGHWAYS_FAMILIES) {
    if (families && !families.includes(family.name)) continue;
    for (let seed = 0; seed < seeds; seed++) {
      const board = registry.generate(family.name, seed).graph;
      const frame = frameOf(board);
      const lines = new Map(NAMES.map((name) => [name as string, linesOf(board, routerOf(name).route(board))]));
      for (const pair of BOARD_PAIRS) {
        for (const kind of ["painted", "polyline"] as const) {
          const [a, b] = [lines.get(pair[0])![kind], lines.get(pair[1])![kind]];
          const [aFrame, bFrame] = [floatPairs(framed(a, frame)), floatPairs(framed(b, frame))];
          const [aOwn, bOwn] = [floatPairs(anchored(a)), floatPairs(anchored(b))];
          const key = `${pair.join("+")}/${kind}`;
          const row = rows.get(key) ?? { routers: pair as readonly [string, string], kind, boards: 0, cornersDiffer: 0, moved: [0, 0] as const, pairs: [0, 0] as const, signFlips: 0, gapChange: 0 };
          const [gapFrame, gapOwn] = [aFrame.size - bFrame.size, aOwn.size - bOwn.size];
          row.boards++;
          if (lowCorner(a) !== lowCorner(b)) row.cornersDiffer++;
          row.moved = [row.moved[0] + moved(aFrame, aOwn), row.moved[1] + moved(bFrame, bOwn)];
          row.pairs = [row.pairs[0] + aFrame.size, row.pairs[1] + bFrame.size];
          if (Math.sign(gapFrame) !== Math.sign(gapOwn)) row.signFlips++;
          row.gapChange += Math.abs(gapFrame - gapOwn);
          rows.set(key, row);
        }
      }
    }
  }
  return [...rows.values()];
}

/** The rate of flips at one size of the form `lines`, against the rate of the formula. */
export interface RateRow {
  readonly kind: "painted" | "polyline";
  readonly move: number;
  /** The moved points over the crossings under the grid, and over each pair under the grid. The sums run over the routers and the seeds. */
  readonly moved: number;
  readonly crossingsUnderGrid: number;
  readonly pairsUnderGrid: number;
  readonly rateOfCrossings: number;
  readonly rateOfPairs: number;
  readonly low: number;
  readonly high: number;
  /** The formula: 2 x mean move / grid. */
  readonly formula: number;
}

/** This function gives the rate of flips of each kind at each size. */
export function rateRows(rows: readonly KindRow[]): RateRow[] {
  return (["painted", "polyline"] as const).flatMap((kind) => {
    const ofKind = rows.filter((r) => r.kind === kind);
    return MOVES.map((move) => {
      const shifts = ofKind.flatMap((r) => r.shifts.filter((s) => s.form === "lines" && s.move === move));
      const count = shifts.reduce((sum, s) => sum + s.snapMoved, 0);
      const crossingsUnderGrid = ofKind.reduce((sum, r) => sum + r.nearCrossings, 0) * VECTORS.length;
      const pairsUnderGrid = ofKind.reduce((sum, r) => sum + r.near, 0) * VECTORS.length;
      const meanMove = shifts.reduce((sum, s) => sum + s.meanMove, 0) / shifts.length;
      const interval = wilson(Math.min(count, crossingsUnderGrid), crossingsUnderGrid);
      return {
        kind,
        move,
        moved: count,
        crossingsUnderGrid,
        pairsUnderGrid,
        rateOfCrossings: crossingsUnderGrid === 0 ? 0 : count / crossingsUnderGrid,
        rateOfPairs: pairsUnderGrid === 0 ? 0 : count / pairsUnderGrid,
        low: interval.low,
        high: interval.high,
        formula: (2 * meanMove) / EPS,
      };
    });
  });
}

/** This function gives the sum of `laneCrossings` (B5) of each router, to read beside the painted count. */
export function laneOrderRows(families?: readonly string[], seeds: number = SEEDS): readonly { readonly router: string; readonly laneOrderFlips: number }[] {
  const registry = highwaysRegistry();
  return NAMES.map((name) => {
    let sum = 0;
    for (const family of HIGHWAYS_FAMILIES) {
      if (families && !families.includes(family.name)) continue;
      for (let seed = 0; seed < seeds; seed++) sum += laneCrossings(segmentsOf(routerOf(name).route(registry.generate(family.name, seed).graph)));
    }
    return { router: name, laneOrderFlips: sum };
  });
}

/** The part of the record that the test reads again. */
export const SLICE = { families: ["small-clustered", "bottleneck"], seeds: 1 } as const;

/** This function gives the record. */
/** The unit of the floors, in the record so that a reader does not divide them into a value for `resolution`. */
export const FLOOR_UNIT =
  "A floor is a sum of moved pairs over the boards, and it counts both directions. The field resolution of checkMeasures reads a median net change on one board. So a floor divided by the boards is not a resolution. Read the net change of the count on each board for that.";

/** The move of the floors. It is the fair control of the float count, because float addition rounds a shift of this size. */
export const FLOOR_MOVE = 0.3;

/** The floor of a claim for one router, one kind of line and one vector. */
export interface FloorRow {
  readonly router: string;
  readonly kind: "painted" | "polyline";
  readonly vector: string;
  /** The moved pairs over the boards. A crossing gone and a crossing added both count, so this is a sum of both directions and not a change of the count. */
  readonly moved: number;
  /** The crossing points on the grid over the boards. */
  readonly points: number;
  readonly share: number;
}

/** This function reads the floors from the rows. A gain on this count that is smaller than the share of a vector is no gain. */
export function floorRows(rows: readonly KindRow[]): FloorRow[] {
  return rows.flatMap((row) =>
    row.shifts
      .filter((shift) => shift.form === "lines" && shift.move === FLOOR_MOVE)
      .map((shift) => ({
        router: row.router,
        kind: row.kind,
        vector: shift.vector,
        moved: shift.snapMoved,
        points: row.snapPoints,
        share: shift.snapMoved / row.snapPoints,
      })),
  );
}

export function paintRecord(rows: readonly KindRow[], slice: readonly KindRow[], laneOrder: ReturnType<typeof laneOrderRows>, boards: number, pairsOnBoard: readonly PairOnBoardRow[]) {
  return { schema: SCHEMA, regenerate: REGENERATE, paintCounter: PAINT_COUNTER, grid: EPS, boards, seeds: SEEDS, pairsOnBoard, moves: MOVES, translations: TRANSLATIONS, vectors: VECTORS, floorMove: FLOOR_MOVE, floorUnit: FLOOR_UNIT, floors: floorRows(rows), rates: rateRows(rows), laneOrder, rows, slice };
}
