import { mulberry32 as seeded } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { dist } from "../../geom.ts";
import type { Graph, Result } from "../../model.ts";
import { ROUTERS } from "../../routers/index.ts";
import { listStrategies, STRATEGIES } from "../../strategies/index.ts";
import { fixPorts } from "../fix.ts";
import { rangeInterval } from "../range.ts";
import { tallCardsBoard } from "../row-cards.ts";
import { assignWall, type WallEnd } from "./index.ts";

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

/** A wall of `n` ends with mixed ranges, each a few plugs wide. The room has space for all the plugs. */
function mixedWall(n: number, rand: () => number): { ends: WallEnd[]; room: [number, number] } {
  const room: [number, number] = [0, n * 12];
  const ends: WallEnd[] = [];
  for (let i = 0; i < n; i++) {
    const lo = Math.round(rand() * (room[1] - 24));
    const len = 8 + Math.round(rand() * 24);
    ends.push({ lo, hi: Math.min(room[1], lo + len), ideal: lo + rand() * len, key: rand() });
  }
  return { ends, room };
}

describe("the limit of work of assignWall (ASSIGN-BOUND)", () => {
  for (const n of [16, 32, 128]) {
    it(`gives a valid plan on 20 seeded walls of ${n} ends with mixed ranges`, { timeout: 5000 }, () => {
      const rand = seeded(20261103 + n);
      let got = 0;
      const t0 = performance.now();
      for (let w = 0; w < 20; w++) {
        const { ends, room } = mixedWall(n, rand);
        const plan = assignWall(ends, room, 8);
        got += plan.anchored.filter(Boolean).length;
        const at = [...plan.at].sort((a, b) => a - b);
        expect(at).toHaveLength(n);
        for (let i = 1; i < n; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(plan.gap - 1e-6);
        for (const v of at) {
          expect(v).toBeGreaterThanOrEqual(room[0] - 1e-6);
          expect(v).toBeLessThanOrEqual(room[1] + 1e-6);
        }
      }
      // CI reads these two lines for the time of a wall and the share of the ends in their ranges.
      const ms = (performance.now() - t0) / 20;
      console.info(`ASSIGN-BOUND n=${n}: ${ms.toFixed(2)} ms for each wall, ${(got / (20 * n)).toFixed(3)} of the ends in their ranges`);
      expect(got / (20 * n)).toBeGreaterThan(0.7);
    });
  }

  it("keeps the gap on a tight wall: the first sweep leaves no free place for the last end", () => {
    // These ten ranges come from a seeded wall. The first sweep places nine ends with no free place, so the last end needs a new place.
    const spans = [[48, 63], [7, 19], [24, 36], [37, 52], [84, 90], [54, 69], [68, 77], [4, 16], [90, 90], [75, 90]] as const;
    const ends: WallEnd[] = spans.map(([lo, hi], i) => ({ lo, hi, ideal: (lo + hi) / 2, key: i }));
    for (const planner of ["sweep", "exact"] as const) {
      const plan = assignWall(ends, [0, 90], 8, [], planner);
      const at = [...plan.at].sort((a, b) => a - b);
      expect(plan.gap).toBe(8);
      for (let i = 1; i < 10; i++) expect(at[i]! - at[i - 1]!, planner).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(plan.anchored.filter(Boolean).length, planner).toBe(9);
    }
  });

  it("never passes the exact count: a sweep above the exact plan is a fault", () => {
    // The first sweep broke the gap, and thus passed the exact count on this wall (10 against 9) and on 11 of 480 seeded walls.
    const spans = [[48, 63], [7, 19], [24, 36], [37, 52], [84, 90], [54, 69], [68, 77], [4, 16], [90, 90], [75, 90]] as const;
    const pinned: WallEnd[] = spans.map(([lo, hi], i) => ({ lo, hi, ideal: (lo + hi) / 2, key: i }));
    const count = (ends: WallEnd[], room: [number, number], planner: "sweep" | "exact"): number => assignWall(ends, room, 8, [], planner).anchored.filter(Boolean).length;
    expect(count(pinned, [0, 90], "sweep")).toBeLessThanOrEqual(count(pinned, [0, 90], "exact"));
    const rand = seeded(20261105);
    for (const n of [10, 12, 14, 16]) {
      for (let w = 0; w < 40; w++) {
        const room: [number, number] = [0, n * 9];
        const ends: WallEnd[] = Array.from({ length: n }, () => {
          const lo = Math.round(rand() * room[1]);
          const hi = Math.min(room[1], lo + 8 + Math.round(rand() * 8));
          return { lo, hi, ideal: lo + rand() * (hi - lo), key: rand() };
        });
        expect(count(ends, room, "sweep"), `${n} ends, wall ${w}`).toBeLessThanOrEqual(count(ends, room, "exact"));
      }
    }
  }, 30_000);

  it("stays at or under the exact count, and loses at most 1 end on 30 seeded walls of 10 ends", () => {
    const rand = seeded(20261104);
    for (let w = 0; w < 30; w++) {
      const { ends, room } = mixedWall(10, rand);
      const best = assignWall(ends, room, 8, [], "exact").anchored.filter(Boolean).length;
      const sweep = assignWall(ends, room, 8, [], "sweep").anchored.filter(Boolean).length;
      expect(sweep, `wall ${w}`).toBeLessThanOrEqual(best);
      expect(best - sweep, `wall ${w}`).toBeLessThanOrEqual(1);
    }
  });

  it("anchors each end on a wall of 32 ends when a tight order exists, with keys in another order", () => {
    // Each range is a little wider than the gap, so only the order of the ranges anchors all the ends.
    const ends: WallEnd[] = Array.from({ length: 32 }, (_, i) => ({ lo: i * 10, hi: i * 10 + 12, ideal: i * 10, key: (i * 7) % 32 }));
    const plan = assignWall(ends, [0, 320], 10);
    expect(plan.anchored.filter(Boolean)).toHaveLength(32);
  });
});

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

describe("the gap of a short range of assignWall (ASSIGN-BOUND)", () => {
  /** Six ends in a range of 20, and two free ends. The range has room for 3 plugs with the gap 8. */
  const crowded = (): { ends: WallEnd[]; room: [number, number] } => ({
    room: [0, 100],
    ends: [...Array.from({ length: 6 }, (_, i) => ({ lo: 40, hi: 60, ideal: 42 + i, key: i })), { lo: 0, hi: 100, ideal: 10, key: 6 }, { lo: 0, hi: 100, ideal: 90, key: 7 }],
  });

  it("keeps the gap and the plan by default", () => {
    const { ends, room } = crowded();
    const plain = assignWall(ends, room, 8);
    expect(plain.gap).toBe(8);
    expect(plain.anchored.filter(Boolean).length).toBe(5);
    expect(assignWall(ends, room, 8, [], "auto", 8)).toEqual(plain);
  });

  it("takes the largest gap that keeps each end in its range", () => {
    const { ends, room } = crowded();
    const plan = assignWall(ends, room, 8, [], "auto", 0);
    expect(plan.anchored.every(Boolean)).toBe(true);
    expect(plan.gap).toBeCloseTo(4, 2);
    expect(plan.gap).toBeLessThanOrEqual(4 + 1e-9);
    const sorted = [...plan.at].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(plan.gap - 1e-6);
  });

  it("stops at the least gap", () => {
    const { ends, room } = crowded();
    const plan = assignWall(ends, room, 8, [], "auto", 6);
    expect(plan.gap).toBeGreaterThanOrEqual(6);
    expect(plan.anchored.filter(Boolean).length).toBeLessThan(ends.length);
    expect(plan.anchored.filter(Boolean).length).toBeGreaterThanOrEqual(assignWall(ends, room, 8).anchored.filter(Boolean).length);
  });

  it("keeps the gap on a wall where the shrink gains no end", () => {
    const room: [number, number] = [0, 100];
    const ends = [{ lo: 0, hi: 100, ideal: 50, key: 0 }, { lo: 0, hi: 100, ideal: 51, key: 1 }, { lo: 200, hi: 210, ideal: 205, key: 2 }];
    const plan = assignWall(ends, room, 8, [], "auto", 0);
    expect(plan).toEqual(assignWall(ends, room, 8));
  });

  it("holds its rules on 300 seeded walls of up to 8 ends", () => {
    const rand = seeded(5150);
    for (let t = 0; t < 300; t++) {
      const { ends, room, gap, fixed } = randomWall(rand);
      const plain = assignWall(ends, room, gap, fixed);
      expect(assignWall(ends, room, gap, fixed, "auto", gap)).toEqual(plain);
      const floor = rand() < 0.5 ? 0 : gap / 2;
      const plan = assignWall(ends, room, gap, fixed, "auto", floor);
      expect(plan.anchored.filter(Boolean).length).toBeGreaterThanOrEqual(plain.anchored.filter(Boolean).length);
      expect(plan.gap).toBeGreaterThanOrEqual(Math.min(floor, plain.gap) - 1e-9);
      expect(plan.gap).toBeLessThanOrEqual(plain.gap);
      const sorted = [...plan.at, ...fixed].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(plan.gap - 1e-6);
    }
  });

  it("gives a plan of 32 ends with short ranges", { timeout: 5000 }, () => {
    const rand = seeded(3232);
    let got = 0;
    const t0 = performance.now();
    for (let t = 0; t < 20; t++) {
      const ends = Array.from({ length: 32 }, (_, i): WallEnd => {
        const lo = Math.round(rand() * 80) * 4;
        return { lo, hi: lo + 4 + rand() * 12, ideal: lo + 2, key: i };
      });
      const plan = assignWall(ends, [0, 340], 8, [], "auto", 0);
      got += plan.anchored.filter(Boolean).length;
    }
    const ms = (performance.now() - t0) / 20;
    // CI reads this line for the time of a wall with the search of the gap.
    console.info(`ASSIGN-BOUND shrink n=32: ${ms.toFixed(2)} ms for each wall, ${(got / (20 * 32)).toFixed(3)} of the ends in their ranges`);
    expect(got).toBeGreaterThan(0);
  });
});

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

  it("puts more ends in their ranges with the option rangeShrink", () => {
    const reach = tallCardsBoard();
    const rowOf = (rangeShrink: number): ReturnType<typeof measure> => {
      const fixed = fixPorts(reach, "assign", { plugOptions: { rangeShrink } });
      return measure(reach, fixed, ROUTERS.find((r) => r.name === "sections")!.route(fixed), 8);
    };
    const ends = reach.edges.length * 2;
    const plain = rowOf(1);
    const half = rowOf(0.5);
    const none = rowOf(0);
    for (const [share, row] of [[1, plain], [0.5, half], [0, none]] as const) {
      console.log(`ASSIGN-BOUND tall cards, share ${share}: anchored ${row.anchored}, clean ${row.clean}, overlaps ${row.overlaps}, of ${ends} ends`);
    }
    expect(none.anchored).toBe(ends);
    expect(half.anchored).toBeGreaterThanOrEqual(plain.anchored);
  });
});
