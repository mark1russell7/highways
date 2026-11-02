import { describe, expect, it } from "vitest";
import { dist } from "../../geom.ts";
import type { Graph, Result } from "../../model.ts";
import { ROUTERS } from "../../routers/index.ts";
import { listStrategies, STRATEGIES } from "../../strategies/index.ts";
import { fixPorts } from "../fix.ts";
import { rangeInterval } from "../range.ts";
import { tallCardsBoard } from "../row-cards.ts";
import { assignWall, type WallEnd } from "./index.ts";

/** A seeded random source (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** This function moves the place `p` up out of the zones of the fixed plugs. */
function pushOut(p: number, fixed: readonly number[], s: number): number {
  for (const f of fixed) if (p > f - s + 1e-9 && p < f + s - 1e-9) p = f + s;
  return p;
}

/**
 * The brute force of goal 1: for each order of the ends, the most ends in their intervals. In one order, each plug goes to its first free place.
 * A table keeps the least last place for each count of ends in their intervals.
 */
function bruteMost(ends: readonly WallEnd[], room: readonly [number, number], s: number, fixed: readonly number[]): number {
  const n = ends.length;
  const pins = [...fixed].sort((a, b) => a - b);
  const [lo, hi] = room;
  let most = -1;
  const perm = ends.map((_, i) => i);
  const used = new Array<boolean>(n).fill(false);
  const order: number[] = [];
  const run = (): void => {
    let best = new Array<number>(n + 1).fill(Infinity);
    best[0] = -Infinity;
    for (const e of order) {
      const next = new Array<number>(n + 1).fill(Infinity);
      const a = Math.max(lo, ends[e]!.lo);
      const b = Math.min(hi, ends[e]!.hi);
      for (let c = 0; c <= n; c++) {
        const last = best[c]!;
        if (last === Infinity) continue;
        const from = last === -Infinity ? -Infinity : last + s;
        const p = pushOut(Math.max(a, from), pins, s);
        if (a <= b && p <= b + 1e-9) next[c + 1] = Math.min(next[c + 1]!, p);
        const q = pushOut(Math.max(lo, from), pins, s);
        if (q <= hi + 1e-9) next[c] = Math.min(next[c]!, q);
      }
      best = next;
    }
    for (let c = n; c >= 0; c--)
      if (best[c] !== Infinity) {
        most = Math.max(most, c);
        break;
      }
  };
  const walk = (): void => {
    if (order.length === n) return run();
    for (const i of perm) {
      if (used[i]) continue;
      used[i] = true;
      order.push(i);
      walk();
      order.pop();
      used[i] = false;
    }
  };
  walk();
  return most;
}

/** This function gives a random wall: up to 8 ends with short intervals, and sometimes fixed plugs. */
function randomWall(rand: () => number): { ends: WallEnd[]; room: [number, number]; gap: number; fixed: number[] } {
  const n = 1 + Math.floor(rand() * 8);
  const room: [number, number] = [0, 20 + Math.floor(rand() * 60)];
  const gap = 4 + Math.floor(rand() * 8);
  const ends: WallEnd[] = [];
  for (let i = 0; i < n; i++) {
    const lo = Math.round(rand() * room[1]);
    const len = rand() < 0.2 ? room[1] : Math.round(rand() * 20);
    ends.push({ lo, hi: lo + len, ideal: lo + rand() * len, key: rand() });
  }
  const fixed: number[] = [];
  if (rand() < 0.3) fixed.push(Math.round(rand() * room[1]));
  return { ends, room, gap, fixed };
}

describe("assignWall (PLUG-ASSIGN)", () => {
  it("anchors the most ends: the count of a brute force over each order, on 300 seeded walls of up to 8 ends", () => {
    const rand = seeded(20261029);
    let cores = 0;
    for (let w = 0; w < 300; w++) {
      const { ends, room, gap, fixed } = randomWall(rand);
      const plan = assignWall(ends, room, gap, fixed);
      const s = plan.gap;
      const got = plan.anchored.filter(Boolean).length;
      expect(got, `wall ${w}`).toBe(bruteMost(ends, room, s, fixed));
      // The plan is valid: each plug in the room, the gap between two plugs and to each fixed plug, each anchored plug in its interval.
      const at = [...plan.at].sort((a, b) => a - b);
      for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!, `wall ${w}`).toBeGreaterThanOrEqual(s - 1e-6);
      for (const v of plan.at) {
        expect(v).toBeGreaterThanOrEqual(room[0] - 1e-6);
        expect(v).toBeLessThanOrEqual(room[1] + 1e-6);
        for (const f of fixed) expect(Math.abs(v - f), `wall ${w}`).toBeGreaterThanOrEqual(s - 1e-6);
      }
      plan.anchored.forEach((a, i) => {
        if (a) expect(plan.at[i]!).toBeGreaterThanOrEqual(ends[i]!.lo - 1e-6);
        if (a) expect(plan.at[i]!).toBeLessThanOrEqual(ends[i]!.hi + 1e-6);
      });
      if (got < ends.length) cores++;
    }
    // Many walls cannot anchor each end, so the test covers the exact core.
    expect(cores).toBeGreaterThan(30);
  });

  it("keeps the order of the keys when each interval is the room", () => {
    const rand = seeded(7);
    const ends: WallEnd[] = Array.from({ length: 12 }, () => ({ lo: 0, hi: 200, ideal: rand() * 200, key: rand() }));
    const plan = assignWall(ends, [0, 200], 8);
    const byKey = ends.map((_, i) => i).sort((a, b) => ends[a]!.key - ends[b]!.key);
    for (let i = 1; i < byKey.length; i++) expect(plan.at[byKey[i]!]!).toBeGreaterThan(plan.at[byKey[i - 1]!]!);
    expect(plan.anchored.every(Boolean)).toBe(true);
    expect(plan.gap).toBe(8);
  });

  it("gives a plug in the room to an end that its interval cannot hold, and counts it as not anchored", () => {
    const ends: WallEnd[] = [0, 1, 2].map((i) => ({ lo: 10, hi: 12, ideal: 11, key: i }));
    const plan = assignWall(ends, [0, 100], 8);
    expect(plan.at).toHaveLength(3);
    expect(plan.anchored.filter(Boolean)).toHaveLength(1);
  });
});

/** This function gives the measures of a board after `fixPorts`: the ends in their reach, the ends nearer than `gap` to a neighbour, and the route length. */
function measure(reach: Graph, fixed: Graph, result: Result, gap: number): { anchored: number; overlaps: number; clean: number; length: number } {
  let anchored = 0;
  let overlaps = 0;
  let clean = 0;
  fixed.nodes.forEach((node, k) => {
    const own = reach.nodes[k]!;
    for (const side of ["east", "west"] as const) {
      const ports = (node.ports ?? []).filter((p) => p.side === side);
      const at = ports.map((p) => node.box.y + p.at!.y);
      const sorted = [...at].sort((a, b) => a - b);
      at.forEach((v, i) => {
        const [lo, hi] = rangeInterval(own.box, side, own.ports!.find((p) => p.id === ports[i]!.id), 6)!;
        const inside = v >= lo - 1e-6 && v <= hi + 1e-6;
        const j = sorted.indexOf(v);
        const near = (j > 0 && v - sorted[j - 1]! < gap - 1e-6) || (j + 1 < sorted.length && sorted[j + 1]! - v < gap - 1e-6);
        if (inside) anchored++;
        if (near) overlaps++;
        if (inside && !near) clean++;
      });
    }
  });
  let length = 0;
  for (const r of result.routes) for (let i = 1; i < r.points.length; i++) length += dist(r.points[i - 1]!, r.points[i]!);
  return { anchored, overlaps, clean, length };
}

describe("the strategy assign on the tall cards (PLUG-ASSIGN)", () => {
  it("is a plug rule of the registry", () => {
    expect(listStrategies(STRATEGIES, "plugs").map((s) => s.name)).toContain("assign");
  });

  it("anchors more ends with no overlap than spread with ranges, and logs the measures of each rule", () => {
    const reach = tallCardsBoard();
    const plain = tallCardsBoard({ ranges: false });
    const sections = ROUTERS.find((r) => r.name === "sections")!;
    const rows: Record<string, ReturnType<typeof measure> & { ms?: number }> = {};
    for (const [name, rule, board] of [
      ["facing", "facing", plain],
      ["spread", "spread", plain],
      ["spread+range", "spread", reach],
      ["assign", "assign", reach],
    ] as const) {
      const t0 = performance.now();
      const fixed = fixPorts(board, rule);
      const ms = performance.now() - t0;
      rows[name] = { ...measure(reach, fixed, sections.route(fixed), 8), ms };
    }
    const ends = reach.edges.length * 2;
    console.log(
      "PLUG-ASSIGN measure (" + ends + " ends)\n" +
        Object.entries(rows)
          .map(([k, v]) => `${k}: anchored ${v.anchored} (${((100 * v.anchored) / ends).toFixed(1)}%), clean ${v.clean} (${((100 * v.clean) / ends).toFixed(1)}%), overlaps ${v.overlaps}, length ${v.length.toFixed(0)}, fixPorts ${v.ms!.toFixed(1)} ms`)
          .join("\n"),
    );
    expect(rows["spread+range"]!.anchored).toBe(ends);
    expect(rows["assign"]!.overlaps).toBe(0);
    expect(rows["assign"]!.clean).toBeGreaterThan(rows["spread+range"]!.clean);
    expect(rows["assign"]!.anchored).toBeGreaterThan(rows["spread"]!.anchored);
  });
});
