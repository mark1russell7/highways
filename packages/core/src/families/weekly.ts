// The families of FAMILIES-WEEKLY. Each batch adds worst cases that the families of the screen sets do not cover.
// These families are in no screen set. Each family uses only the stream of the registry, whole numbers, `Math.floor` and `Math.min`. Thus each family is `exact`.
import type { CorpusDimension } from "@mark1russell7/layout-contract";
import type { Graph } from "../model.ts";
import { caseFamily, count } from "./cases.ts";
import { Builder, ceilSqrt, choose, int, SEEDING, shuffle } from "./coverage.ts";
import { numberDimension, type HighwaysFamily } from "./model.ts";

/** The dimensions of `bottleneck`. */
const BOTTLENECK_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("left", 2, 120, 24, "The number of nodes west of the wall."),
  count("right", 2, 120, 24, "The number of nodes east of the wall."),
  count("edges", 0, 240, 48, "The number of tries for an edge from a west node to an east node. Each edge crosses the wall."),
  count("door", 4, 240, 24, "The width of the one door of the wall, in units."),
  count("wall", 8, 320, 40, "The thickness of the wall, in units. A thick wall makes the door a long tunnel."),
  count("overhang", 0, 2000, 600, "The length of the wall past the two regions at each end, in units. A long wall makes the way around it far."),
  count("gap", 8, 120, 32, "The free space between two nodes, in units."),
]);

/**
 * The family `bottleneck`: two regions of nodes with a wall between them, and one narrow door in the wall. Each edge goes from the west region to the east region.
 * Thus each edge wants the same few units of free space. The nodes of the wall have no edges.
 */
export const BOTTLENECK: HighwaysFamily = caseFamily({
  name: "bottleneck",
  meaning: "One narrow door in a long wall, and each edge goes through it.",
  dimensions: BOTTLENECK_DIMENSIONS,
  generator: "family.bottleneck",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const left = v["left"]!;
    const right = v["right"]!;
    const door = v["door"]!;
    const wall = v["wall"]!;
    const overhang = v["overhang"]!;
    const gap = v["gap"]!;
    const cw = 80 + gap;
    const ch = 36 + gap;
    const shape = (n: number): readonly [number, number] => {
      const cells = n + Math.floor(n / 4);
      const cols = ceilSqrt(cells);
      return [cols, Math.floor((cells + cols - 1) / cols)];
    };
    const [leftCols, leftRows] = shape(left);
    const [rightCols, rightRows] = shape(right);
    // The wall starts after the last cell of the west region. The door has one cell of wall or more above it and below it, inside the height of the regions.
    const height = Math.max(Math.max(leftRows, rightRows) * ch - gap, door + 2 * ch);
    const wallX = leftCols * cw;
    const place = (prefix: string, x: number, cols: number, rows: number, n: number): void => {
      choose(random, cols * rows, n).forEach((c, i) => b.node(`${prefix}${i}`, x + (c % cols) * cw, overhang + Math.floor(c / cols) * ch, int(random, 56, 80), int(random, 24, 36)));
    };
    place("a", 0, leftCols, leftRows, left);
    place("b", wallX + wall + gap, rightCols, rightRows, right);
    const doorY = overhang + ch + int(random, 0, height - door - 2 * ch);
    b.node("wall-n", wallX, 0, wall, doorY);
    b.node("wall-s", wallX, doorY + door, wall, 2 * overhang + height - doorY - door);
    for (let n = 0; n < v["edges"]!; n++) b.link({ node: `a${int(random, 0, left - 1)}` }, { node: `b${int(random, 0, right - 1)}` });
    return b.graph();
  },
});

/** The dimensions of `parallel-edges`. */
const PARALLEL_EDGES_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("pairs", 1, 60, 12, "The number of pairs of boxes with parallel edges."),
  count("copies", 2, 24, 6, "The number of edges between the two boxes of each pair."),
  numberDimension({ name: "back", kind: "real", min: 0, max: 1, default: 0.25, meaning: "The share of the parallel edges that go from the second box of a pair to its first box." }),
  count("others", 0, 120, 24, "The number of other boxes. Each one takes a random cell, so it can stand between the two boxes of a pair."),
  count("extra", 0, 160, 12, "The number of tries for a single edge between two boxes of the board."),
  count("gap", 8, 120, 40, "The free space between two boxes, in units."),
]);

/**
 * The family `parallel-edges`: many edges with the same two ends and no fixed plug. No other family has a second edge between two ends.
 * Some edges go the other way, and the edges of a pair are not next to each other in the list of edges.
 */
export const PARALLEL_EDGES: HighwaysFamily = caseFamily({
  name: "parallel-edges",
  meaning: "Many edges between the same two boxes, in both directions, with no fixed plug.",
  dimensions: PARALLEL_EDGES_DIMENSIONS,
  generator: "family.parallel-edges",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const pairs = v["pairs"]!;
    const copies = v["copies"]!;
    const others = v["others"]!;
    const gap = v["gap"]!;
    const cw = 96 + gap;
    const ch = 40 + gap;
    const ids = [...Array.from({ length: pairs }, (_, i) => [`a${i}`, `b${i}`]).flat(), ...Array.from({ length: others }, (_, k) => `n${k}`)];
    const cols = ceilSqrt(ids.length + Math.floor(ids.length / 4));
    const cells = choose(random, cols * cols, ids.length);
    const order = shuffle(random, ids.length);
    ids.forEach((id, i) => {
      const c = cells[order[i]!]!;
      b.node(id, (c % cols) * cw, Math.floor(c / cols) * ch, int(random, 64, 96), int(random, 28, 40));
    });
    const ends: (readonly [string, string])[] = [];
    for (let i = 0; i < pairs; i++) for (let k = 0; k < copies; k++) ends.push(random() < v["back"]! ? [`b${i}`, `a${i}`] : [`a${i}`, `b${i}`]);
    for (const i of shuffle(random, ends.length)) {
      const [s, t] = ends[i]!;
      b.copy({ node: s }, { node: t });
    }
    for (let n = 0; n < v["extra"]!; n++) b.link({ node: ids[int(random, 0, ids.length - 1)]! }, { node: ids[int(random, 0, ids.length - 1)]! });
    return b.graph();
  },
});

/** The dimensions of `maze`. */
const MAZE_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("cols", 2, 24, 8, "The number of columns of maze cells."),
  count("rows", 2, 16, 6, "The number of rows of maze cells."),
  count("nodes", 2, 60, 12, "The number of nodes. Each node takes its own maze cell, so the board has no more nodes than cells."),
  count("edges", 0, 120, 16, "The number of tries for an edge between two nodes."),
  count("corridor", 24, 240, 96, "The width of a corridor, in units. A node takes the middle of its cell, and it leaves a way past it."),
  count("wall", 4, 32, 12, "The thickness of a wall, in units."),
  count("loops", 0, 60, 0, "The number of tries for one more door in a wall. With 0 doors, one way joins each two cells."),
]);

/** The four steps from a maze cell to the cell next to it. */
const STEPS: readonly (readonly [number, number])[] = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]);

/**
 * This function cuts a maze of `cols` by `rows` cells with a random walk and a stack. It gives a table with `2 × rows + 1` rows and `2 × cols + 1` columns.
 * The cells of the maze have odd indices. A true value of the table is wall. A wall between two cells is false when the walk or a try of `loops` opened it.
 */
export function cutMaze(random: () => number, cols: number, rows: number, loops: number): boolean[][] {
  const solid = Array.from({ length: 2 * rows + 1 }, (_, y) => Array.from({ length: 2 * cols + 1 }, (_, x) => !(x % 2 === 1 && y % 2 === 1)));
  const inside = (x: number, y: number): boolean => x >= 0 && x < cols && y >= 0 && y < rows;
  const seen = new Set<number>();
  const first = int(random, 0, cols * rows - 1);
  seen.add(first);
  const stack = [first];
  while (stack.length > 0) {
    const cell = stack[stack.length - 1]!;
    const x = cell % cols;
    const y = Math.floor(cell / cols);
    const free = STEPS.filter(([dx, dy]) => inside(x + dx, y + dy) && !seen.has((y + dy) * cols + x + dx));
    if (free.length === 0) {
      stack.pop();
      continue;
    }
    const [dx, dy] = free[int(random, 0, free.length - 1)]!;
    solid[2 * y + 1 + dy]![2 * x + 1 + dx] = false;
    const next = (y + dy) * cols + x + dx;
    seen.add(next);
    stack.push(next);
  }
  for (let n = 0; n < loops; n++) {
    const x = int(random, 0, cols - 1);
    const y = int(random, 0, rows - 1);
    const [dx, dy] = STEPS[int(random, 0, STEPS.length - 1)]!;
    if (inside(x + dx, y + dy)) solid[2 * y + 1 + dy]![2 * x + 1 + dx] = false;
  }
  return solid;
}

/**
 * This function adds the boxes of the walls of a maze table. The rows with even indices give the long horizontal walls first. Each other wall piece gets a vertical box.
 * Thus the boxes can touch, but they do not overlap.
 */
function addWalls(b: Builder, solid: readonly (readonly boolean[])[], corridor: number, wall: number): void {
  const start = (i: number): number => Math.floor(i / 2) * (wall + corridor) + (i % 2) * wall;
  const end = (i: number): number => start(i) + (i % 2 === 0 ? wall : corridor);
  const used = solid.map((row) => row.map(() => false));
  let walls = 0;
  const put = (x0: number, y0: number, x1: number, y1: number): void => {
    b.node(`w${walls++}`, start(x0), start(y0), end(x1) - start(x0), end(y1) - start(y0));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) used[y]![x] = true;
  };
  const rows = solid.length;
  const cols = solid[0]!.length;
  for (let y = 0; y < rows; y += 2)
    for (let x = 0; x < cols; x++) {
      let last = x;
      while (last < cols && solid[y]![last]!) last++;
      if (last - x >= 2) put(x, y, last - 1, y);
      x = Math.max(x, last - 1);
    }
  for (let x = 0; x < cols; x++)
    for (let y = 0; y < rows; y++) {
      let last = y;
      while (last < rows && solid[last]![x]! && !used[last]![x]!) last++;
      if (last > y) put(x, y, x, last - 1);
      y = Math.max(y, last - 1);
    }
}

/**
 * The family `maze`: a closed maze of wall boxes, with nodes in its cells. A random walk with a stack cuts the maze, so the corridors are long.
 * At `loops` 0, one way joins each two cells. Thus the straight line between two nodes is far from the real way, and no route can go around the walls.
 */
export const MAZE: HighwaysFamily = caseFamily({
  name: "maze",
  meaning: "A closed maze: walls force long detours, and the straight line is far from the real way.",
  dimensions: MAZE_DIMENSIONS,
  generator: "family.maze",
  seeding: SEEDING,
  make: (v, _seed, random): Graph => {
    const b = new Builder();
    const cols = v["cols"]!;
    const rows = v["rows"]!;
    const corridor = v["corridor"]!;
    const wall = v["wall"]!;
    addWalls(b, cutMaze(random, cols, rows, v["loops"]!), corridor, wall);
    const places = choose(random, cols * rows, v["nodes"]!);
    const w = Math.floor(corridor / 2);
    const h = Math.floor(corridor / 3);
    places.forEach((c, i) => b.node(`n${i}`, wall + (c % cols) * (wall + corridor) + Math.floor((corridor - w) / 2), wall + Math.floor(c / cols) * (wall + corridor) + Math.floor((corridor - h) / 2), w, h));
    for (let n = 0; n < v["edges"]!; n++) b.link({ node: `n${int(random, 0, places.length - 1)}` }, { node: `n${int(random, 0, places.length - 1)}` });
    return b.graph();
  },
});

/** The families of FAMILIES-WEEKLY, in the order of their batches. */
export const WEEKLY_FAMILIES: readonly HighwaysFamily[] = Object.freeze([BOTTLENECK, PARALLEL_EDGES, MAZE]);
