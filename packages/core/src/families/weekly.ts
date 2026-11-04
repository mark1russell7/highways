// The families of FAMILIES-WEEKLY. Each batch adds worst cases that the families of the screen sets do not cover.
// These families are in no screen set. Each family uses only the stream of the registry, whole numbers, `Math.floor` and `Math.min`. Thus each family is `exact`.
import type { CorpusDimension } from "@mark1russell7/layout-contract";
import type { Graph, Port, Side } from "../model.ts";
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

/** The dimensions of `channel`. */
const CHANNEL_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("cols", 2, 60, 16, "The number of nodes in each of the two rows."),
  count("nets", 0, 240, 24, "The number of tries for an edge from the north row to the south row."),
  count("pins", 1, 12, 4, "The number of fixed plugs on the channel side of each node. A full node takes no more edges."),
  count("span", 0, 60, 8, "The largest distance in columns between the two ends of an edge."),
  count("height", 8, 400, 96, "The height of the channel between the two rows, in units. A low channel has few tracks."),
  count("gap", 2, 60, 8, "The free space between two nodes of a row, in units."),
]);

/**
 * The family `channel`: the channel routing problem of the chip literature. Two rows of nodes face each other across a channel.
 * The plugs are fixed on the channel side.
 * Each edge goes from the north row to the south row, so all the routes share the tracks of the channel.
 * The plugs of a column can block each other.
 */
export const CHANNEL: HighwaysFamily = caseFamily({
  name: "channel",
  meaning: "Two rows of nodes across a narrow channel, with fixed plugs, as in channel routing of chips.",
  dimensions: CHANNEL_DIMENSIONS,
  generator: "family.channel",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const cols = v["cols"]!;
    const pins = v["pins"]!;
    const span = v["span"]!;
    const freePlugs = (): number[][] => Array.from({ length: cols }, () => shuffle(random, pins));
    const north = freePlugs();
    const south = freePlugs();
    const nets: (readonly [number, number, number, number])[] = [];
    for (let n = 0; n < v["nets"]!; n++) {
      const top = int(random, 0, cols - 1);
      const low = int(random, Math.max(0, top - span), Math.min(cols - 1, top + span));
      if (north[top]!.length === 0 || south[low]!.length === 0) continue;
      nets.push([top, north[top]!.pop()!, low, south[low]!.pop()!]);
    }
    const width = 80;
    const tall = 40;
    const portsOf = (side: "north" | "south", prefix: string): Port[] => Array.from({ length: pins }, (_, p) => ({ id: `${prefix}${p}`, side, along: (p + 1) / (pins + 1) }));
    for (let c = 0; c < cols; c++) {
      const x = c * (width + v["gap"]!);
      b.node(`n${c}`, x, 0, width, tall, { ports: portsOf("south", "p") });
      b.node(`s${c}`, x, tall + v["height"]!, width, tall, { ports: portsOf("north", "p") });
    }
    for (const [top, topPin, low, lowPin] of nets) b.link({ node: `n${top}`, port: `p${topPin}` }, { node: `s${low}`, port: `p${lowPin}` });
    return b.graph();
  },
});

/** The dimensions of `comb`. */
const COMB_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("teeth", 2, 30, 8, "The number of teeth of each of the two combs."),
  count("depth", 40, 800, 240, "The length of a tooth, in units."),
  count("slot", 24, 200, 72, "The width of the corridor between two teeth, in units."),
  count("tooth", 4, 80, 16, "The thickness of a tooth and of the back of a comb, in units."),
  count("clear", 8, 200, 48, "The free space past the tip of a tooth, in units. A corridor turns through this space."),
  count("nodes", 2, 120, 12, "The number of nodes, in the corridor between the combs."),
  count("edges", 0, 240, 16, "The number of tries for an edge between two nodes."),
]);

/**
 * The family `comb`: two combs that reach into each other, so one corridor goes up and down between the teeth.
 * The way between two nodes turns at each tooth between them. The straight line crosses each of those teeth.
 */
export const COMB: HighwaysFamily = caseFamily({
  name: "comb",
  meaning: "Two combs that reach into each other: one corridor turns at each tooth, and each way is long.",
  dimensions: COMB_DIMENSIONS,
  generator: "family.comb",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const teeth = v["teeth"]!;
    const depth = v["depth"]!;
    const slot = v["slot"]!;
    const tooth = v["tooth"]!;
    const clear = v["clear"]!;
    const pitch = tooth + slot;
    const inner = depth + clear;
    const width = 2 * teeth * pitch - slot;
    b.node("back-n", 0, 0, width, tooth);
    b.node("back-s", 0, tooth + inner, width, tooth);
    for (let k = 0; k < teeth; k++) {
      b.node(`up${k}`, 2 * k * pitch, tooth, tooth, depth);
      b.node(`low${k}`, (2 * k + 1) * pitch, tooth + clear, tooth, depth);
    }
    const slots = 2 * teeth - 1;
    const rows = Math.floor(inner / slot);
    const w = Math.floor(slot / 2);
    const h = Math.floor(slot / 3);
    const places = choose(random, slots * rows, v["nodes"]!);
    places.forEach((c, i) => b.node(`n${i}`, (c % slots) * pitch + tooth + Math.floor((slot - w) / 2), tooth + Math.floor(c / slots) * slot + Math.floor((slot - h) / 2), w, h));
    for (let n = 0; n < v["edges"]!; n++) b.link({ node: `n${int(random, 0, places.length - 1)}` }, { node: `n${int(random, 0, places.length - 1)}` });
    return b.graph();
  },
});

/** The dimensions of `spiral`. */
const SPIRAL_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("turns", 1, 16, 5, "The number of full turns of the wall."),
  count("corridor", 30, 200, 90, "The width of the corridor between two arms of the wall, in units."),
  count("wall", 4, 60, 12, "The thickness of the wall, in units."),
  count("nodes", 2, 120, 16, "The number of nodes in the corridor. A short corridor holds fewer nodes."),
  count("edges", 0, 240, 16, "The number of tries for an edge between two nodes."),
]);

/**
 * The family `spiral`: one wall in a square spiral, with nodes in the corridor. The way out from the middle grows with the square of the turns.
 * Each corner of the wall sees only a short part of the corridor. The way to a near node on the next arm goes around a full turn.
 */
export const SPIRAL: HighwaysFamily = caseFamily({
  name: "spiral",
  meaning: "One wall in a square spiral: a node on the next arm is near, and the way to it is a full turn.",
  dimensions: SPIRAL_DIMENSIONS,
  generator: "family.spiral",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const corridor = v["corridor"]!;
    const wall = v["wall"]!;
    const step = corridor + wall;
    const w = Math.floor(corridor / 2);
    const h = Math.floor(corridor / 3);
    const inX = Math.floor((corridor - w) / 2);
    const inY = Math.floor((corridor - h) / 2);
    // The wall starts at the middle and goes east, south, west and north. Each piece starts past the corner of the piece before it.
    // The cells of a piece are on its outer side.
    const pieces: (readonly [number, number, number, number])[] = [];
    const cells: (readonly [number, number])[] = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < 4 * v["turns"]!; i++) {
      const long = step * (Math.floor(i / 2) + 1);
      const inCells = Math.floor(long / corridor);
      const side = i % 4;
      if (side === 0) {
        pieces.push(i === 0 ? [x, y, long + wall, wall] : [x + wall, y, long, wall]);
        for (let c = 0; c < inCells; c++) cells.push([x + c * corridor + inX, y - corridor + inY]);
        x += long;
      } else if (side === 1) {
        pieces.push([x, y + wall, wall, long]);
        for (let c = 0; c < inCells; c++) cells.push([x + wall + inX, y + c * corridor + inY]);
        y += long;
      } else if (side === 2) {
        pieces.push([x - long, y, long, wall]);
        for (let c = 0; c < inCells; c++) cells.push([x - (c + 1) * corridor + inX, y + wall + inY]);
        x -= long;
      } else {
        pieces.push([x, y - long, wall, long]);
        for (let c = 0; c < inCells; c++) cells.push([x - corridor + inX, y - (c + 1) * corridor + inY]);
        y -= long;
      }
    }
    // The board moves so that each box is at or past the origin.
    const left = Math.min(...pieces.map((p) => p[0]), ...cells.map((c) => c[0]));
    const top = Math.min(...pieces.map((p) => p[1]), ...cells.map((c) => c[1]));
    pieces.forEach(([px, py, pw, ph], i) => b.node(`wall${i}`, px - left, py - top, pw, ph));
    const places = choose(random, cells.length, v["nodes"]!);
    places.forEach((c, i) => b.node(`n${i}`, cells[c]![0] - left, cells[c]![1] - top, w, h));
    for (let n = 0; n < v["edges"]!; n++) b.link({ node: `n${int(random, 0, places.length - 1)}` }, { node: `n${int(random, 0, places.length - 1)}` });
    return b.graph();
  },
});

/** The dimensions of `switchbox`. */
const SWITCHBOX_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("pins", 2, 40, 10, "The number of pin nodes on each of the four sides of the box."),
  count("pitch", 24, 120, 40, "The distance between two pins of a side, in units."),
  count("nets", 0, 80, 16, "The number of edges. Each pin takes one edge at most."),
  count("blocks", 0, 40, 4, "The number of boxes inside the switchbox. A board holds fewer when it has few cells."),
]);

/**
 * The family `switchbox`: the switchbox routing problem of the chip literature. The pins have fixed plugs on the four sides of an empty box.
 * Each edge joins two pins, and the plug of a pin faces into the box. Thus the routes share the tracks of the box in two directions.
 */
export const SWITCHBOX: HighwaysFamily = caseFamily({
  name: "switchbox",
  meaning: "Four rows of pins with fixed plugs around a box, as in switchbox routing of chips.",
  dimensions: SWITCHBOX_DIMENSIONS,
  generator: "family.switchbox",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const pins = v["pins"]!;
    const pitch = v["pitch"]!;
    const size = pins * pitch;
    const pin = 16;
    const off = 4;
    const at = (i: number): number => i * pitch + Math.floor((pitch - pin) / 2);
    const plug = (side: Side): Port[] => [{ id: "p", side, along: 0.5 }];
    for (let i = 0; i < pins; i++) {
      b.node(`n${i}`, at(i) + pin + off, 0, pin, pin, { ports: plug("south") });
      b.node(`s${i}`, at(i) + pin + off, size + pin + 2 * off, pin, pin, { ports: plug("north") });
      b.node(`w${i}`, 0, at(i) + pin + off, pin, pin, { ports: plug("east") });
      b.node(`e${i}`, size + pin + 2 * off, at(i) + pin + off, pin, pin, { ports: plug("west") });
    }
    const cell = 2 * pitch;
    const across = Math.floor(pins / 2);
    const cells = across * across;
    choose(random, cells, v["blocks"]!).forEach((c, i) => b.node(`b${i}`, (c % across) * cell + pitch + pin + off - Math.floor(pitch / 2), Math.floor(c / across) * cell + pitch + pin + off - Math.floor(pitch / 2), pitch, pitch));
    const order = shuffle(random, 4 * pins);
    const idOf = (k: number): string => `${"nswe"[k % 4]}${Math.floor(k / 4)}`;
    for (let n = 0; n < Math.min(v["nets"]!, 2 * pins); n++) b.link({ node: idOf(order[2 * n]!), port: "p" }, { node: idOf(order[2 * n + 1]!), port: "p" });
    return b.graph();
  },
});

/** The dimensions of `escape`. */
const ESCAPE_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("cols", 2, 40, 10, "The number of columns of pads."),
  count("rows", 2, 40, 10, "The number of rows of pads."),
  count("pad", 8, 60, 20, "The width and the height of a pad, in units."),
  count("gap", 4, 80, 16, "The free space between two pads, in units. A small gap holds few routes."),
  count("nets", 0, 400, 30, "The number of edges. Each edge joins one pad to its own terminal. A board holds no more edges than pads."),
  count("margin", 20, 400, 120, "The free space between the pads and the ring of terminals, in units."),
]);

/**
 * The family `escape`: the escape routing problem of chip packages. A dense grid of pads stands in a ring of terminals.
 * Each edge goes from a pad to a terminal, so a route from an inner pad goes out along the gaps between the other pads.
 */
export const ESCAPE: HighwaysFamily = caseFamily({
  name: "escape",
  meaning: "A dense grid of pads in a ring of terminals: each route leaves along the gaps between the pads.",
  dimensions: ESCAPE_DIMENSIONS,
  generator: "family.escape",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const cols = v["cols"]!;
    const rows = v["rows"]!;
    const pad = v["pad"]!;
    const pitch = pad + v["gap"]!;
    const margin = v["margin"]!;
    const term = 24;
    const from = term + margin;
    const pads = choose(random, rows * cols, v["nets"]!);
    const onSide = Math.ceil(pads.length / 4);
    // A side of the ring holds `onSide` terminals, so a small grid has a ring that is wider than the grid.
    const wide = Math.max(cols * pitch - v["gap"]!, onSide * (term + 4));
    const tall = Math.max(rows * pitch - v["gap"]!, onSide * (term + 4));
    const left = from + Math.floor((wide - (cols * pitch - v["gap"]!)) / 2);
    const top = from + Math.floor((tall - (rows * pitch - v["gap"]!)) / 2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) b.node(`p${r * cols + c}`, left + c * pitch, top + r * pitch, pad, pad);
    const along = (length: number, t: number): number => Math.floor((length * (2 * t + 1)) / (2 * onSide)) - Math.floor(term / 2);
    const place = (i: number): readonly [number, number] => {
      const t = Math.floor(i / 4);
      const side = i % 4;
      if (side === 0) return [from + along(wide, t), 0];
      if (side === 1) return [from + wide + margin, from + along(tall, t)];
      if (side === 2) return [from + along(wide, t), from + tall + margin];
      return [0, from + along(tall, t)];
    };
    const order = shuffle(random, pads.length);
    pads.forEach((p, i) => {
      const [x, y] = place(order[i]!);
      b.node(`t${i}`, x, y, term, term);
      b.link({ node: `p${p}` }, { node: `t${i}` });
    });
    return b.graph();
  },
});

/** The dimensions of `rings`. */
const RINGS_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("rings", 1, 12, 4, "The number of closed walls, each one inside the next."),
  count("corridor", 40, 200, 90, "The width of the corridor between two walls, in units."),
  count("wall", 4, 60, 12, "The thickness of a wall, in units."),
  count("door", 8, 200, 48, "The width of the one door of each wall, in units. A door is no wider than its side."),
  count("nodes", 2, 120, 16, "The number of nodes. The corridors hold fewer nodes when there are few rings."),
  count("edges", 0, 240, 16, "The number of tries for an edge between two nodes."),
]);

/**
 * The family `rings`: closed walls, each one inside the next, with one door on a random side of each wall.
 * A way from one corridor to the next goes around to the door, so the side of the door decides the length of the way.
 */
export const RINGS: HighwaysFamily = caseFamily({
  name: "rings",
  meaning: "Closed walls, each one inside the next, with one door on a random side of each wall.",
  dimensions: RINGS_DIMENSIONS,
  generator: "family.rings",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const rings = v["rings"]!;
    const corridor = v["corridor"]!;
    const wall = v["wall"]!;
    const pitch = corridor + wall;
    const mid = rings * pitch;
    let piece = 0;
    const bar = (x: number, y: number, w: number, h: number): void => {
      if (w > 0 && h > 0) b.node(`wall${piece++}`, x, y, w, h);
    };
    for (let k = 0; k < rings; k++) {
      const outer = (k + 1) * pitch;
      const inner = outer - wall;
      const lo = mid - outer;
      const hi = mid + inner;
      const open = int(random, 0, 3);
      const door = Math.min(v["door"]!, 2 * inner - 1);
      const start = int(random, 0, 2 * inner - door);
      // Each piece has this form: `from` and `length` run along a side of the wall, and `across` is the place of the side.
      const side = (index: number, across: number, from: number, length: number, flat: boolean): void => {
        const put = (at: number, run: number): void => (flat ? bar(at, across, run, wall) : bar(across, at, wall, run));
        if (index !== open) {
          put(from, length);
          return;
        }
        const skip = flat ? wall : 0;
        put(from, skip + start);
        put(from + skip + start + door, length - skip - start - door);
      };
      side(0, lo, lo, 2 * outer, true);
      side(1, hi, lo + wall, 2 * inner, false);
      side(2, hi, lo, 2 * outer, true);
      side(3, lo, lo + wall, 2 * inner, false);
    }
    const w = Math.floor(corridor / 2);
    const h = Math.floor(corridor / 3);
    const cells: (readonly [number, number])[] = [];
    for (let band = 0; band < rings; band++) {
      const reach = (band + 1) * pitch - wall - Math.floor(corridor / 2);
      const onSide = band + 1;
      for (let t = 0; t < onSide; t++) {
        const along = Math.floor((reach * (2 * t + 1)) / onSide) - reach;
        cells.push([mid + along, mid - reach], [mid + reach, mid + along], [mid - along, mid + reach], [mid - reach, mid - along]);
      }
    }
    const places = choose(random, cells.length, v["nodes"]!);
    places.forEach((c, i) => b.node(`n${i}`, cells[c]![0] - Math.floor(w / 2), cells[c]![1] - Math.floor(h / 2), w, h));
    for (let n = 0; n < v["edges"]!; n++) b.link({ node: `n${int(random, 0, places.length - 1)}` }, { node: `n${int(random, 0, places.length - 1)}` });
    return b.graph();
  },
});

/** The families of FAMILIES-WEEKLY, in the order of their batches. */
export const WEEKLY_FAMILIES: readonly HighwaysFamily[] = Object.freeze([BOTTLENECK, PARALLEL_EDGES, MAZE, CHANNEL, COMB, SPIRAL, SWITCHBOX, ESCAPE, RINGS]);
