import { describe, expect, it } from "vitest";
import { TOLERANCE } from "./bench/properties.ts";
import { highwaysRegistry } from "./families/index.ts";
import { dist, type Point } from "./geom.ts";
import { LANE_ROOM_LIMIT, withLaneRoom } from "./lane-room.ts";
import type { LaneRoom, SharedRun } from "./model.ts";
import { ROUTERS } from "./routers/index.ts";
import { Obstacles } from "./visibility.ts";

// The read of `lane-room.ts` skips a box from its bounds. This file holds a second read that clips each box near each leg, with no such test.
// So the test below holds the claim that the bounds change no room. Room values differ only by rounding, and `LIMIT` is that limit.
const LIMIT = 1e-9;
const TOUCH = 1e-6;
const MITER = 2;

interface HalfPlane {
  readonly at: Point;
  readonly normal: Point;
  readonly least: number;
}

const inside = (p: Point, h: HalfPlane): number => (p.x - h.at.x) * h.normal.x + (p.y - h.at.y) * h.normal.y - h.least;

function clip(polygon: readonly Point[], h: HalfPlane): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const [da, db] = [inside(a, h), inside(b, h)];
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) out.push({ x: a.x + (b.x - a.x) * (da / (da - db)), y: a.y + (b.y - a.y) * (da / (da - db)) });
  }
  return out;
}

const unit = (v: Point): Point | undefined => {
  const l = Math.sqrt(v.x * v.x + v.y * v.y);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l } : undefined;
};

const cornersOf = (box: { x: number; y: number; w: number; h: number }): Point[] => [
  { x: box.x, y: box.y },
  { x: box.x + box.w, y: box.y },
  { x: box.x + box.w, y: box.y + box.h },
  { x: box.x, y: box.y + box.h },
];

/** This function gives the room along a way. It clips each box near each leg. */
function alongRoom(points: readonly Point[], obstacles: Obstacles): LaneRoom {
  const room = { left: LANE_ROOM_LIMIT, right: LANE_ROOM_LIMIT };
  const along: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1]!, points[i]!];
    along.push(unit({ x: b.x - a.x, y: b.y - a.y }) ?? along[along.length - 1] ?? { x: 0, y: 0 });
  }
  for (let i = 0; i < along.length; i++) {
    const [a, b, dir] = [points[i]!, points[i + 1]!, along[i]!];
    if (dist(a, b) === 0) continue;
    const before = i > 0 ? unit({ x: along[i - 1]!.x + dir.x, y: along[i - 1]!.y + dir.y }) : undefined;
    const after = i + 1 < along.length ? unit({ x: along[i + 1]!.x + dir.x, y: along[i + 1]!.y + dir.y }) : undefined;
    const end = after ?? dir;
    const start: HalfPlane = { at: a, normal: before ?? dir, least: TOUCH };
    const stop: HalfPlane = { at: b, normal: { x: -end.x, y: -end.y }, least: TOUCH };
    const left = { x: dir.y, y: -dir.x };
    const reach = MITER * LANE_ROOM_LIMIT;
    const search = { x: Math.min(a.x, b.x) - reach, y: Math.min(a.y, b.y) - reach, w: Math.abs(b.x - a.x) + 2 * reach, h: Math.abs(b.y - a.y) + 2 * reach };
    obstacles.query(search, ({ box }) => {
      const part = clip(clip(cornersOf(box), start), stop);
      for (const [name, normal] of [["left", left], ["right", { x: -left.x, y: -left.y }]] as const) {
        const side: HalfPlane = { at: a, normal, least: TOLERANCE };
        const near = clip(part, side).map((p) => inside(p, side));
        if (near.length === 0) continue;
        const gap = Math.min(...near);
        room[name] = Math.min(room[name], gap <= 1e-9 ? 0 : gap + TOLERANCE);
      }
    });
  }
  return room;
}

/** This function gives the room in the wedge of one join. It clips each box near the join. */
function wedge(before: Point, at: Point, after: Point, obstacles: Obstacles): LaneRoom {
  const room = { left: LANE_ROOM_LIMIT, right: LANE_ROOM_LIMIT };
  const [dir, next] = [unit({ x: at.x - before.x, y: at.y - before.y }), unit({ x: after.x - at.x, y: after.y - at.y })];
  if (dir === undefined || next === undefined) return room;
  const turn = dir.x * next.y - dir.y * next.x;
  if (Math.abs(turn) <= 1e-9) return room;
  const outer = turn > 0 ? "left" : "right";
  const sign = outer === "left" ? 1 : -1;
  const normal = (d: Point): Point => ({ x: sign * d.y, y: -sign * d.x });
  const across = unit({ x: normal(dir).x + normal(next).x, y: normal(dir).y + normal(next).y });
  if (across === undefined) return room;
  const scale = normal(dir).x * across.x + normal(dir).y * across.y;
  const past: HalfPlane = { at, normal: dir, least: TOUCH };
  const ahead: HalfPlane = { at, normal: { x: -next.x, y: -next.y }, least: TOUCH };
  const reach = LANE_ROOM_LIMIT;
  obstacles.query({ x: at.x - reach, y: at.y - reach, w: 2 * reach, h: 2 * reach }, ({ box }) => {
    for (const p of clip(clip(cornersOf(box), past), ahead)) {
      const offset = ((p.x - at.x) * across.x + (p.y - at.y) * across.y) / scale;
      room[outer] = Math.min(room[outer], Math.max(0, offset));
    }
  });
  return room;
}

/** This function gives the room of each way, along the way and at its joins, with no test of the bounds of a box. */
function plainRooms(ways: readonly SharedRun[], obstacles: Obstacles): LaneRoom[] {
  const key = (p: Point): string => `${p.x},${p.y}`;
  const neighbors = new Map<string, { point: Point; way: number }[]>();
  ways.forEach((way, index) => {
    way.points.forEach((p, i) => {
      const list = neighbors.get(key(p)) ?? [];
      for (const point of [way.points[i - 1], way.points[i + 1]]) if (point !== undefined && dist(p, point) > 0) list.push({ point, way: index });
      neighbors.set(key(p), list);
    });
  });
  return ways.map((way, index) => {
    const [first, last] = [way.points[0]!, way.points[way.points.length - 1]!];
    const afterFirst = way.points.find((p) => dist(p, first) > 0);
    const beforeLast = [...way.points].reverse().find((p) => dist(p, last) > 0);
    const others = (p: Point): readonly Point[] => (neighbors.get(key(p)) ?? []).filter((n) => n.way !== index).map((n) => n.point);
    const joins =
      afterFirst === undefined || beforeLast === undefined
        ? []
        : [...others(first).map((exit) => wedge(exit, first, afterFirst, obstacles)), ...others(last).map((exit) => wedge(beforeLast, last, exit, obstacles))];
    const along = alongRoom(way.points, obstacles);
    return { left: Math.min(along.left, ...joins.map((r) => r.left)), right: Math.min(along.right, ...joins.map((r) => r.right)) };
  });
}

describe("the bounds test of the room read", () => {
  it("changes no room by more than the limit, on each side of each way", () => {
    const registry = highwaysRegistry();
    const router = ROUTERS.find((r) => r.name === "shared-all")!;
    let sides = 0;
    let worst = 0;
    for (const family of ["dense-groups", "many-groups", "hub-chain", "small-clustered"]) {
      for (const seed of [0, 1, 2]) {
        const board = registry.generate(family, seed).graph;
        const ways = router.route(board).runs ?? [];
        const obstacles = new Obstacles(board.nodes, 180);
        const plain = plainRooms(ways, obstacles);
        withLaneRoom(ways, obstacles).forEach((way, i) => {
          for (const side of ["left", "right"] as const) {
            sides++;
            worst = Math.max(worst, Math.abs(way.room![side] - plain[i]![side]));
          }
        });
      }
    }
    console.log("BOUNDS sides", sides, "worst", worst);
    expect(sides).toBeGreaterThan(100);
    expect(worst).toBeLessThanOrEqual(LIMIT);
  }, 60_000);
});
