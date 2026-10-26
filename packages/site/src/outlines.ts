import type { Box, Level, Point } from "@mark1russell7/highways";

/** The outline of a group of a level: a polygon with legs parallel to the axes, and the boxes that fill it. */
export interface GroupShape {
  /** The corners of the outline, in order. */
  readonly outline: readonly Point[];
  /** The boxes whose union is the inside of the outline. */
  readonly boxes: readonly Box[];
  /** The space between the cards of the group and the outline. */
  readonly pad: number;
}

/** The space that the map keeps between two outlines, or between an outline and a card. */
const SPACE = 6;
const EPS = 1e-6;

/**
 * This function gives the outline of each group of a level. A group with free space around it gets a rectangle.
 * A group whose box overlaps another item, or comes near it, gets one band for each row of its cards.
 * Each band grows to the full width of the group on each side where it has space.
 * The pad of each outline is at most `pad`, and it is small enough that two outlines do not touch.
 * The pad also keeps the outline clear of the links that pass the group: it is at most half the space to such a link.
 */
export function groupShapes(level: Level, boxOf: (node: string) => Box | undefined, pad: number): Map<string, GroupShape> {
  const parts = new Map<string, Box[]>();
  const rowsOf = new Map<string, { rows: Box[]; joints: Box[] }>();
  for (const it of level.items) parts.set(it.id, [it.box]);
  const groups = level.items.filter((i) => i.nodes.length > 1);
  const need = 2 * pad + SPACE;
  for (const g of groups) {
    const near = level.items.some((o) => o !== g && gap(o.box, g.box) < need);
    if (!near) continue;
    const rows = cardRows(g.nodes.map(boxOf).filter((b): b is Box => b !== undefined));
    const joints = jointsOf(rows);
    if (!joints) continue;
    rowsOf.set(g.id, { rows, joints });
    parts.set(g.id, [...rows, ...joints]);
  }
  // A band grows to the left side or the right side of the group, where that keeps it clear of the other items and of the links.
  const room = (id: string, b: Box): boolean => {
    for (const [other, theirs] of parts) if (other !== id && theirs.some((t) => gap(b, t) < need)) return false;
    return level.links.every((l) => passes(l, id).every(([u, v]) => legGap(u, v, b) >= 2 * pad));
  };
  for (const [id, shape] of rowsOf) {
    const box = level.items.find((i) => i.id === id)!.box;
    const rows = shape.rows.map((r) => {
      let out = r;
      const left = { ...out, x: box.x, w: out.x + out.w - box.x };
      if (left.w > out.w && room(id, left)) out = left;
      const right = { ...out, w: box.x + box.w - out.x };
      if (right.w > out.w && room(id, right)) out = right;
      return out;
    });
    const joints = jointsOf(rows)!;
    rowsOf.set(id, { rows, joints });
    parts.set(id, [...rows, ...joints]);
  }
  const out = new Map<string, GroupShape>();
  for (const g of groups) {
    const mine = parts.get(g.id)!;
    let free = Infinity;
    for (const [id, theirs] of parts) {
      if (id === g.id) continue;
      for (const a of mine) for (const b of theirs) free = Math.min(free, gap(a, b));
    }
    let p = Math.max(0, Math.min(pad, (free - SPACE) / 2));
    for (const l of level.links) for (const [u, v] of passes(l, g.id)) for (const b of mine) p = Math.min(p, legGap(u, v, b) / 2);
    const rows = (rowsOf.get(g.id)?.rows ?? [g.box]).map((b) => inflate(b, p));
    out.set(g.id, { outline: outlineOf(rows), boxes: mine.map((b) => inflate(b, p)), pad: p });
  }
  return out;
}

/** This function gives the space between two boxes. It is negative when the boxes overlap. */
function gap(a: Box, b: Box): number {
  return Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
}

/**
 * This function gives the legs of a link that pass the group `id`.
 * The first leg of a link from the group and the last leg of a link to the group do not count. They go through the outline.
 */
function passes(l: Level["links"][number], id: string): [Point, Point][] {
  const p = l.points;
  const out: [Point, Point][] = [];
  const to = l.target === id ? p.length - 1 : p.length;
  for (let i = l.source === id ? 2 : 1; i < to; i++) out.push([p[i - 1]!, p[i]!]);
  return out;
}

/** This function gives the distance from a leg to a box. It is 0 when the leg touches the box. */
function legGap(a: Point, b: Point, r: Box): number {
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  // The leg goes through the box when the box holds a point of the leg. The test samples the leg at the sides of the box.
  const ts = [0, 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > EPS) ts.push((x0 - a.x) / dx, (x1 - a.x) / dx);
  if (Math.abs(dy) > EPS) ts.push((y0 - a.y) / dy, (y1 - a.y) / dy);
  let best = Infinity;
  for (const t of ts) {
    if (t < 0 || t > 1) continue;
    const p = { x: a.x + dx * t, y: a.y + dy * t };
    best = Math.min(best, pointGap(p, r));
  }
  for (const c of [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x0, y: y1 },
    { x: x1, y: y1 },
  ]) {
    const len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(a.x + dx * t - c.x, a.y + dy * t - c.y));
  }
  return best;
}

function pointGap(p: Point, r: Box): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

function inflate(b: Box, d: number): Box {
  return { x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d };
}

/** This function gives the rows of the cards, from top to bottom. Cards whose spans from top to bottom overlap are in one row. */
function cardRows(cards: readonly Box[]): Box[] {
  const rows: Box[] = [];
  for (const c of [...cards].sort((a, b) => a.y - b.y)) {
    const last = rows[rows.length - 1];
    if (last && c.y < last.y + last.h) {
      const x0 = Math.min(last.x, c.x);
      const x1 = Math.max(last.x + last.w, c.x + c.w);
      rows[rows.length - 1] = { x: x0, y: last.y, w: x1 - x0, h: Math.max(last.y + last.h, c.y + c.h) - last.y };
    } else rows.push({ ...c });
  }
  return rows;
}

/**
 * This function gives a joint between each two rows. A joint fills the space between two rows, where their spans overlap.
 * It gives `undefined` when there are no rows, or when the spans of two rows do not overlap.
 */
function jointsOf(rows: readonly Box[]): Box[] | undefined {
  if (rows.length === 0) return undefined;
  const joints: Box[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!;
    const b = rows[i]!;
    const x0 = Math.max(a.x, b.x);
    const x1 = Math.min(a.x + a.w, b.x + b.w);
    if (x1 <= x0) return undefined;
    joints.push({ x: x0, y: a.y + a.h, w: x1 - x0, h: Math.max(0, b.y - (a.y + a.h)) });
  }
  return joints;
}

/**
 * This function gives the corners of the outline of rows, from top to bottom, that are inflated by the same pad.
 * It goes down the left side and up the right side. Between two rows, the outline keeps to the narrower span.
 */
function outlineOf(rows: readonly Box[]): Point[] {
  const left: Point[] = [];
  const right: Point[] = [];
  rows.forEach((b, i) => {
    const next = rows[i + 1];
    left.push({ x: b.x, y: b.y }, { x: b.x, y: b.y + b.h });
    right.push({ x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h });
    if (!next) return;
    const ya = b.y + b.h;
    const yb = next.y;
    const l = Math.max(b.x, next.x);
    const r = Math.min(b.x + b.w, next.x + next.w);
    if (yb >= ya) {
      left.push({ x: l, y: ya }, { x: l, y: yb });
      right.push({ x: r, y: ya }, { x: r, y: yb });
    } else {
      // Two rows that overlap after the pad change their span at the middle of the overlap.
      const ym = (ya + yb) / 2;
      left.push({ x: b.x, y: ym }, { x: next.x, y: ym });
      right.push({ x: b.x + b.w, y: ym }, { x: next.x + next.w, y: ym });
    }
  });
  return corners([...left, ...right.reverse()]);
}

/** This function removes the repeated points and the points in the middle of a straight run of a closed polygon. */
function corners(p: readonly Point[]): Point[] {
  const prev = (i: number): Point => p[(i + p.length - 1) % p.length]!;
  let out = p.filter((q, i) => p.length < 2 || Math.abs(q.x - prev(i).x) > EPS || Math.abs(q.y - prev(i).y) > EPS);
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length]!;
      const b = out[i]!;
      const c = out[(i + 1) % out.length]!;
      const run = (Math.abs(a.x - b.x) < EPS && Math.abs(b.x - c.x) < EPS) || (Math.abs(a.y - b.y) < EPS && Math.abs(b.y - c.y) < EPS);
      if (run) {
        out = out.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * This function moves each end of a link to the outline of its group, along the first leg or the last leg.
 * An end on the box of a group goes out to the outline, or in to the outline where the outline has a step.
 */
export function endsOnOutlines(points: readonly Point[], from: GroupShape | undefined, to: GroupShape | undefined): Point[] {
  if (points.length < 2) return [...points];
  let out = [...points];
  if (from) out = moveStart(out, from);
  if (to) out = moveStart(out.reverse(), to).reverse();
  return out;
}

function moveStart(p: Point[], shape: GroupShape): Point[] {
  const a = p[0]!;
  const b = p[1]!;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < EPS) return p;
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const at = (s: number): Point => ({ x: a.x + d.x * s, y: a.y + d.y * s });
  let s = 0;
  if (shape.boxes.some((r) => holds(r, a))) {
    // The end is inside the outline: it goes out along the leg to the last exit of the boxes.
    for (let more = true; more; ) {
      more = false;
      for (const r of shape.boxes) {
        const hit = ray(at(s), d, r);
        if (hit && hit[0] <= EPS && hit[1] > EPS) {
          s += hit[1];
          more = true;
        }
      }
    }
    s = Math.min(s, len - Math.min(len, 1));
  } else {
    // The end is in a step of the outline: it goes back to the first box behind it.
    const back = { x: -d.x, y: -d.y };
    let t = Infinity;
    for (const r of shape.boxes) {
      const hit = ray(a, back, r);
      if (hit && hit[0] >= 0) t = Math.min(t, hit[0]);
    }
    if (t === Infinity) return p;
    s = -t;
  }
  return [at(s), ...p.slice(1)];
}

function holds(r: Box, p: Point): boolean {
  return p.x >= r.x - EPS && p.x <= r.x + r.w + EPS && p.y >= r.y - EPS && p.y <= r.y + r.h + EPS;
}

/** This function gives the distances along the ray where it goes into the box and out of it, or `undefined` when it misses the box. */
function ray(p: Point, d: Point, r: Box): [number, number] | undefined {
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [o, v, lo, hi] of [
    [p.x, d.x, r.x, r.x + r.w],
    [p.y, d.y, r.y, r.y + r.h],
  ] as const) {
    if (Math.abs(v) < EPS) {
      if (o < lo - EPS || o > hi + EPS) return undefined;
      continue;
    }
    const a = (lo - o) / v;
    const b = (hi - o) / v;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 <= t1 + EPS ? [t0, t1] : undefined;
}
