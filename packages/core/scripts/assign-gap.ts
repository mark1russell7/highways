// The count gap of the sweep of `assign` (ASSIGN-BOUND): the sweep and the exact plan run on the same seeded walls.
//
// - `node scripts/assign-gap.ts [--walls 20] [--cap 5] [--sizes 8,10,12] [--families ample,tight] [--out <file>]`
// - Each row is one family at one size: the mean count of each plan, the mean gap, and the worst wall.
// - The counts are the same on each machine. The time only ends a ladder: a family stops after the first size with a wall over `--cap` seconds.
// - The bound `anchorBound` needs no exact plan, so it also covers each size past the end of a ladder. A bound is not always reachable.
// - The rows of the sweep come first. Thus a stopped run keeps them. A later row of one family and size replaces an earlier row.
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { mulberry32 } from "@mark1russell7/rigor-generators";
import { anchorBound, assignWall, type WallEnd } from "../src/plugs/assign/index.ts";

/** One made-up wall. */
interface Wall {
  readonly ends: WallEnd[];
  readonly room: [number, number];
}

/** One row of the record. */
interface Row {
  readonly family: string;
  readonly ends: number;
  readonly walls: number;
  readonly exact: number | null;
  readonly sweep: number;
  readonly bound: number;
  readonly gap: number | null;
  readonly gapShare: number | null;
  readonly worstGap: number | null;
  readonly worstShare: number | null;
  readonly lostWalls: number | null;
  readonly slowestExactMs: number | null;
}

const GAP = 8;

/** This function gives one end. Its range starts at `lo` and has the length `len`, in a room with the end `top`. */
function end(lo: number, len: number, top: number, rand: () => number): WallEnd {
  const a = Math.min(lo, top);
  const b = Math.min(top, a + len);
  return { lo: a, hi: b, ideal: a + rand() * (b - a), key: rand() };
}

/** These generators give the walls of each family. Each family has a room for all the plugs. */
const FAMILIES: Readonly<Record<string, (n: number, rand: () => number) => Wall>> = {
  // A room with spare places, and integer ranges of 8 to 32.
  ample(n, rand) {
    const top = n * 12;
    return { room: [0, top], ends: Array.from({ length: n }, () => end(Math.round(rand() * (top - 24)), 8 + Math.round(rand() * 24), top, rand)) };
  },
  // A room that barely holds the plugs, and short ranges. Ends compete for places.
  tight(n, rand) {
    const top = n * 9;
    return { room: [0, top], ends: Array.from({ length: n }, () => end(Math.round(rand() * top), 8 + Math.round(rand() * 8), top, rand)) };
  },
  // Three hot spots on the wall. Most ends compete for the same short part.
  clustered(n, rand) {
    const top = n * 12;
    const hot = [rand() * top, rand() * top, rand() * top].map(Math.round);
    return { room: [0, top], ends: Array.from({ length: n }, () => end(Math.max(0, hot[Math.floor(rand() * 3)]! + Math.round((rand() - 0.5) * 24)), 16, top, rand)) };
  },
  // Ranges at places that are not whole numbers. So the exact plan has many more places.
  fractional(n, rand) {
    const top = n * 12;
    return { room: [0, top], ends: Array.from({ length: n }, () => end(rand() * (top - 24), 8 + rand() * 24, top, rand)) };
  },
};

/** This function gives the count of the ends in their ranges in a plan. */
const count = (anchored: readonly boolean[]): number => anchored.filter(Boolean).length;

/** This function gives one row. With `exact` false, the row has only the sweep and the bound. */
function rowOf(family: string, n: number, walls: number, exact: boolean): Row {
  const rand = mulberry32((Number.parseInt(family.slice(0, 4), 36) ^ (n * 2654435761)) >>> 0);
  const make = FAMILIES[family]!;
  let sumExact = 0;
  let sumSweep = 0;
  let sumBound = 0;
  let worstGap = 0;
  let worstShare = 0;
  let lost = 0;
  let slowest = 0;
  for (let w = 0; w < walls; w++) {
    const { ends, room } = make(n, rand);
    const sweep = assignWall(ends, room, GAP, [], "sweep");
    const got = count(sweep.anchored);
    // A count means nothing when the plan breaks its gap.
    const at = [...sweep.at].sort((a, b) => a - b);
    for (let i = 1; i < n; i++) if (at[i]! - at[i - 1]! < sweep.gap - 1e-6) throw new Error(`The sweep breaks the gap: ${family}, ${n} ends, wall ${w}.`);
    sumSweep += got;
    sumBound += anchorBound(ends, room, sweep.gap);
    if (!exact) continue;
    const t0 = performance.now();
    const best = count(assignWall(ends, room, GAP, [], "exact").anchored);
    slowest = Math.max(slowest, performance.now() - t0);
    // The exact plan is an upper limit, so a sweep above it is a fault of the exact plan or of this measure.
    if (got > best) throw new Error(`The sweep beats the exact plan: ${family}, ${n} ends, wall ${w}, ${got} against ${best}.`);
    sumExact += best;
    const gap = best - got;
    worstGap = Math.max(worstGap, gap);
    worstShare = Math.max(worstShare, best > 0 ? gap / best : 0);
    if (gap > 0) lost++;
  }
  const base = { family, ends: n, walls, sweep: sumSweep / walls, bound: sumBound / walls };
  if (!exact) return { ...base, exact: null, gap: null, gapShare: null, worstGap: null, worstShare: null, lostWalls: null, slowestExactMs: null };
  return { ...base, exact: sumExact / walls, gap: (sumExact - sumSweep) / walls, gapShare: sumExact > 0 ? (sumExact - sumSweep) / sumExact : 0, worstGap, worstShare, lostWalls: lost, slowestExactMs: slowest };
}

const { values } = parseArgs({
  options: {
    walls: { type: "string", default: "20" },
    cap: { type: "string", default: "5" },
    sizes: { type: "string", default: "8,10,12,14,16,20,24,32,48,64,128" },
    families: { type: "string", default: Object.keys(FAMILIES).join(",") },
    out: { type: "string" },
  },
});
const walls = Number(values.walls);
const capMs = Number(values.cap) * 1000;
const rows: Row[] = [];
const sizes = values.sizes.split(",").map(Number);
/** This function keeps one row, and writes the record again. */
function keep(row: Row): void {
  rows.push(row);
  console.log(JSON.stringify(row));
  if (values.out) writeFileSync(values.out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}
for (const family of values.families.split(",")) {
  for (const n of sizes) keep(rowOf(family, n, walls, false));
  for (const n of sizes) {
    if (n > 64) break;
    let row: Row;
    try {
      row = rowOf(family, n, walls, true);
    } catch (e) {
      // The memo of the exact plan has a limit of entries. So this size is past the reach of the exact plan.
      if (e instanceof RangeError) break;
      throw e;
    }
    keep(row);
    if (row.slowestExactMs! > capMs) break;
  }
}
