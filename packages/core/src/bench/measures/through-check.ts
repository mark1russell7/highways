import type { Box, Point } from "../../geom.ts";
import type { Graph, Node, Route } from "../../model.ts";

/**
 * This module is an independent check of the field `through` of a route (THROUGH-CHECK).
 * It shares no code with the test behind that field. It imports types only, and it has its own loop over each box, with no grid.
 * Each route and each box is a closed shape, so a touch is a contact, and two boxes that touch make a wall.
 * The check has no tolerance. The constant `BAND` only names a class of a contact that the check already found.
 *
 * The limit is the float error. The result is exact for a line along an axis, and for each stop.
 * A slanted line that meets a box at one inner point can read a tiny gap. The constant `HAIRLINE` counts such cases apart.
 */

/** The classes of a contact, with the class that decides for a route first. */
export const THROUGH_CLASSES = ["deep", "band", "seam", "wall", "corner", "plug-seam", "plug-wall", "end-overlap"] as const;

/**
 * The class of a contact with a box that is not an end of the edge.
 *
 * - `deep`: the route goes more than `BAND` into the box.
 * - `band`: the route goes into the box, by `BAND` or less.
 * - `seam`: the route goes between two boxes that touch, and no end of the route lies on the box.
 * - `wall`: the route goes along a wall of the box, or has a stop on a wall.
 * - `corner`: the route meets the box at one corner.
 * - `plug-seam`: the route goes between two boxes that touch, from a plug on the wall of the box.
 * - `plug-wall`: an end of the route lies on a wall of the box, and the route goes along no seam of the box.
 * - `end-overlap`: the box overlaps an end box of the edge and is not its child. The route goes `BAND` or less into the box.
 */
export type ThroughClass = (typeof THROUGH_CLASSES)[number];

/** The depth that separates the classes `band` and `deep`. It is the band of the test behind `through`. It widens no contact. */
const BAND = 0.5;

/** A gap of this size or less, above 0, can be a contact that the float error hides. The count reports it. It widens no contact. */
export const HAIRLINE = 1e-9;

/** One box that a route meets: its id, the depth of the deepest point of the route in it, and its class. */
export interface ThroughContact {
  readonly box: string;
  readonly depth: number;
  readonly class: ThroughClass;
}

/** The check of one route. */
export interface RouteCheck {
  readonly edge: string;
  /** This flag tells that the route has a frame. */
  readonly inner: boolean;
  /** This flag tells that the route has the field `through`. */
  readonly marked: boolean;
  /** These contacts are with the boxes that are not ends of the edge, sorted by class and then by id. */
  readonly contacts: readonly ThroughContact[];
  /** These boxes of the field `through` have no contact with the route. */
  readonly falseNames: readonly string[];
  /** This count is the number of boxes of the field `through` that have a contact with the route. */
  readonly namesMet: number;
  /** These contacts are with boxes that the field `through` does not name. */
  readonly unnamed: readonly string[];
  /** This flag tells that a box has a gap from the route above 0 and at most `HAIRLINE`. */
  readonly hairline: boolean;
  /** This flag tells that an end of the edge has a frame, so the check skips that frame. */
  readonly skipsFrame: boolean;
}

/** What one route does to one box. */
interface Meeting {
  depth: number;
  along: boolean;
  seam: boolean;
  stopOnWall: boolean;
  endOn: boolean;
}

/** A stretch of a line along an axis on a wall of a box. The field `side` is +1 when the box lies on the high side of the line. */
interface WallStretch {
  readonly box: string;
  readonly upright: boolean;
  readonly side: number;
  readonly lo: number;
  readonly hi: number;
}

/** This function gives the depth of the point in the closed box: the distance to the nearest wall. A point outside gives a negative value. */
function pointDepth(p: Point, box: Box): number {
  return Math.min(p.x - box.x, box.x + box.w - p.x, p.y - box.y, box.y + box.h - p.y);
}

/**
 * This function gives the depth of the deepest point of the closed segment `ab` in the closed box.
 * The value is 0 for a touch. A negative value is the gap: the least distance on one axis from the segment to the box.
 *
 * The depth at a point of the segment is the least of four straight lines, one for each wall. So its peak is at an end or where two lines cross.
 */
export function closedDepth(a: Point, b: Point, box: Box): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const start = [a.x - box.x, box.x + box.w - a.x, a.y - box.y, box.y + box.h - a.y] as const;
  const slope = [dx, -dx, dy, -dy] as const;
  let best = Math.max(pointDepth(a, box), pointDepth(b, box));
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++) {
      const rate = slope[i]! - slope[j]!;
      if (rate === 0) continue;
      const t = (start[j]! - start[i]!) / rate;
      if (t > 0 && t < 1) best = Math.max(best, pointDepth({ x: a.x + dx * t, y: a.y + dy * t }, box));
    }
  return best;
}

/** This function gives the stretch of the segment `ab` on a wall of the box. A segment that stays off each wall gives `undefined`. */
function wallStretch(a: Point, b: Point, box: string, shape: Box): WallStretch | undefined {
  const upright = a.x === b.x && a.y !== b.y;
  if (!upright && !(a.y === b.y && a.x !== b.x)) return undefined;
  const line = upright ? a.x : a.y;
  const low = upright ? shape.x : shape.y;
  const size = upright ? shape.w : shape.h;
  const side = line === low ? 1 : line === low + size ? -1 : 0;
  if (side === 0) return undefined;
  const from = upright ? shape.y : shape.x;
  const lo = Math.max(Math.min(upright ? a.y : a.x, upright ? b.y : b.x), from);
  const hi = Math.min(Math.max(upright ? a.y : a.x, upright ? b.y : b.x), from + (upright ? shape.h : shape.w));
  return lo < hi ? { box, upright, side, lo, hi } : undefined;
}

/** This function tells if the inside of two boxes share a point. */
function overlaps(p: Box, q: Box): boolean {
  return p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
}

/** This function tells if the point is a corner of the box. */
function onCorner(p: Point, box: Box): boolean {
  return (p.x === box.x || p.x === box.x + box.w) && (p.y === box.y || p.y === box.y + box.h);
}

/** This function gives the least gap on one axis from the bounds of the segment `ab` to the box. It is a floor of the gap of `closedDepth`. */
function boundsGap(a: Point, b: Point, box: Box): number {
  return Math.max(box.x - Math.max(a.x, b.x), Math.min(a.x, b.x) - box.x - box.w, box.y - Math.max(a.y, b.y), Math.min(a.y, b.y) - box.y - box.h);
}

/** This function gives what the route does to each box that it meets, by id, and tells if a box lies within `HAIRLINE`. */
function meetings(points: readonly Point[], nodes: readonly Node[]): { readonly met: Map<string, Meeting>; readonly hairline: boolean } {
  const met = new Map<string, Meeting>();
  let hairline = false;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const stretches: WallStretch[] = [];
    for (const n of nodes) {
      if (boundsGap(a, b, n.box) > HAIRLINE) continue;
      const depth = closedDepth(a, b, n.box);
      if (depth < 0) {
        if (-depth <= HAIRLINE) hairline = true;
        continue;
      }
      const stretch = depth === 0 ? wallStretch(a, b, n.id, n.box) : undefined;
      if (stretch) stretches.push(stretch);
      const stopOnWall = [a, b].some((p) => pointDepth(p, n.box) === 0 && !onCorner(p, n.box));
      const seen = met.get(n.id);
      const endOn = pointDepth(first, n.box) >= 0 || pointDepth(last, n.box) >= 0;
      if (seen) {
        seen.depth = Math.max(seen.depth, depth);
        seen.along ||= stretch !== undefined;
        seen.stopOnWall ||= stopOnWall;
      } else met.set(n.id, { depth, along: stretch !== undefined, seam: false, stopOnWall, endOn });
    }
    // Two boxes on the two sides of one stretch of a line make a seam.
    for (const p of stretches)
      for (const q of stretches)
        if (p.upright === q.upright && p.side === 1 && q.side === -1 && Math.max(p.lo, q.lo) < Math.min(p.hi, q.hi)) {
          met.get(p.box)!.seam = true;
          met.get(q.box)!.seam = true;
        }
  }
  return { met, hairline };
}

/** This function gives the class of one contact. A box that overlaps an end box of the edge takes the class `end-overlap`, up to the depth `BAND`. */
function classOf(meeting: Meeting, endOverlap: boolean): ThroughClass {
  if (meeting.depth > BAND) return "deep";
  if (endOverlap) return "end-overlap";
  if (meeting.depth > 0) return "band";
  if (meeting.seam) return meeting.endOn ? "plug-seam" : "seam";
  if (meeting.endOn) return "plug-wall";
  return meeting.along || meeting.stopOnWall ? "wall" : "corner";
}

/** This function gives the ids of the frames that hold the node, at any depth. */
function framesOf(id: string, byId: ReadonlyMap<string, Node>): readonly string[] {
  const out: string[] = [];
  for (let p = byId.get(id)?.parent; p !== undefined && !out.includes(p); p = byId.get(p)?.parent) out.push(p);
  return out;
}

/**
 * This function checks each route of `routes` against each box of the graph, as closed shapes. A route whose edge is not in the graph gives no row.
 *
 * The two end boxes of the edge do not count. The frames that hold an end do not count either.
 * The plug of a node in a frame lies inside that frame. So each route of that node has a contact with the frame, and the contact tells nothing.
 * Each other frame counts. A child of an end box counts too, because an inner route must go around the other children of its frame.
 */
export function checkRoutes(graph: Graph, routes: readonly Route[]): RouteCheck[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const edges = new Map(graph.edges.map((e) => [e.id, e] as const));
  const out: RouteCheck[] = [];
  for (const route of routes) {
    const edge = edges.get(route.edge);
    if (!edge) continue;
    const ends = new Set([edge.source.node, edge.target.node]);
    const frames = new Set([...framesOf(edge.source.node, byId), ...framesOf(edge.target.node, byId)]);
    const skipped = new Set([...ends, ...frames]);
    const endBoxes = [...ends].flatMap((id) => byId.get(id)?.box ?? []);
    const { met, hairline } = meetings(route.points, graph.nodes);
    const contacts: ThroughContact[] = [];
    for (const [id, meeting] of met) {
      if (skipped.has(id)) continue;
      const box = byId.get(id)!.box;
      const childOfEnd = framesOf(id, byId).some((f) => ends.has(f));
      contacts.push({ box: id, depth: meeting.depth, class: classOf(meeting, !childOfEnd && endBoxes.some((e) => overlaps(e, box))) });
    }
    contacts.sort((p, q) => THROUGH_CLASSES.indexOf(p.class) - THROUGH_CLASSES.indexOf(q.class) || (p.box < q.box ? -1 : 1));
    const names = route.through ?? [];
    out.push({
      edge: route.edge,
      inner: route.frame !== undefined,
      marked: route.through !== undefined,
      contacts,
      falseNames: names.filter((id) => !met.has(id)),
      namesMet: names.filter((id) => met.has(id)).length,
      unnamed: contacts.map((c) => c.box).filter((id) => route.through !== undefined && !names.includes(id)),
      hairline,
      skipsFrame: frames.size > 0,
    });
  }
  return out;
}

/** This function gives the contact that decides the class of a route, or `undefined` for a route with no contact. */
export function deciding(check: RouteCheck): ThroughContact | undefined {
  return check.contacts[0];
}

/** This function tells if a route has no field `through` and has a contact: the check does not agree with the route. */
export function flagged(check: RouteCheck): boolean {
  return !check.marked && check.contacts.length > 0;
}

/** This function tells if a route has the field `through` and meets no box that the field names. */
export function falseThrough(check: RouteCheck): boolean {
  return check.marked && check.namesMet === 0;
}
