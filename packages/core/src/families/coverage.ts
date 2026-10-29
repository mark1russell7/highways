// The 9 families of CORPUS-FAMILIES. They cover regions of the input space that the 6 families of `screen-v2` do not cover.
// Each family uses only the stream of the registry, whole numbers, `Math.floor` and `Math.min`. Thus each family is `exact`.
import { enumDimension, numberDimension, type HighwaysFamily } from "./model.ts";
import { caseFamily, count } from "./cases.ts";
import type { CorpusDimension } from "@mark1russell7/layout-contract";
import type { Edge, End, Graph, Node, Port } from "../model.ts";

/** A board while it grows. It adds no loop, and no second edge between the same two ends. */
class Builder {
  readonly nodes: Node[] = [];
  readonly edges: Edge[] = [];
  readonly #keys = new Set<string>();

  node(id: string, x: number, y: number, w: number, h: number, extra: { readonly parent?: string; readonly ports?: readonly Port[] } = {}): string {
    this.nodes.push({ id, box: { x, y, w, h }, ...(extra.parent !== undefined ? { parent: extra.parent } : {}), ...(extra.ports ? { ports: extra.ports } : {}) });
    return id;
  }

  /** This method adds an edge. The key of an end is its node and its plug. It adds nothing for a loop or a second edge between the same two ends. */
  link(source: End, target: End): void {
    if (source.node === target.node) return;
    const a = `${source.node}:${source.port ?? ""}`;
    const b = `${target.node}:${target.port ?? ""}`;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (this.#keys.has(key)) return;
    this.#keys.add(key);
    this.edges.push({ id: `e${this.edges.length}`, source, target });
  }

  graph(): Graph {
    return { nodes: this.nodes, edges: this.edges };
  }
}

/** This function gives a whole number from `lo` to `hi`, both included. */
const int = (random: () => number, lo: number, hi: number): number => lo + Math.floor(random() * (hi - lo + 1));

/** This function gives the least whole number `s` with `s × s` equal to `v` or more. It uses no square root, so each engine gives the same value. */
function ceilSqrt(v: number): number {
  let lo = 0;
  let hi = Math.max(1, v);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (mid * mid >= v) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** This function gives `k` of the indices 0 to `n - 1` at random, in increasing order. It uses a part of the shuffle of Fisher and Yates. */
function choose(random: () => number, n: number, k: number): number[] {
  const list = Array.from({ length: n }, (_, i) => i);
  const take = Math.min(k, n);
  for (let i = 0; i < take; i++) {
    const j = int(random, i, n - 1);
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list.slice(0, take).sort((a, b) => a - b);
}

/** This function gives the indices 0 to `n - 1` in a random order, with the shuffle of Fisher and Yates. */
function shuffle(random: () => number, n: number): number[] {
  const list = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = int(random, 0, i);
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

/** The rule of the random numbers of each family of this file. */
const SEEDING = "mulberry32 of the input seed. One stream gives the sizes and the places of the boxes, then the edges, in a fixed order.";

/** The dimensions of `frame-rows`. */
const FRAME_ROWS_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("cards", 1, 24, 9, "The number of cards. Each card is a frame."),
  count("rows", 1, 12, 5, "The number of full-width rows in each card."),
  count("links", 0, 8, 4, "The number of tries for a link from a wall plug of a card to a wall plug of another card, for each card."),
  count("inner", 0, 12, 0, "The number of tries for an inner edge from a row to a wall plug of its card, for each card."),
  count("gap", 24, 240, 96, "The free space between two cards, in units."),
]);

/**
 * The family `frame-rows`: cards with full-width rows, as INTERIOR-ROUTE takes them. Each row has a fixed plug on the east wall and on the west wall of its card.
 * The links join a plug of a card to a plug of another card. An inner edge joins a row to a plug of its own card. The default has no inner edge.
 */
export const FRAME_ROWS: HighwaysFamily = caseFamily({
  name: "frame-rows",
  meaning: "Cards with full-width rows and fixed plugs on their walls, as tables of a schema diagram.",
  dimensions: FRAME_ROWS_DIMENSIONS,
  generator: "family.frame-rows",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const cards = v["cards"]!;
    const rows = v["rows"]!;
    const gap = v["gap"]!;
    const cols = ceilSqrt(cards);
    const w = 220;
    const header = 28;
    const pitch = 30;
    const h = header + rows * pitch + 4;
    const ports: Port[] = [];
    for (let j = 0; j < rows; j++) {
      const along = (header + j * pitch + 12) / h;
      ports.push({ id: `e${j}`, side: "east", along }, { id: `w${j}`, side: "west", along });
    }
    const colOf = (i: number): number => i % cols;
    for (let i = 0; i < cards; i++) {
      const x = colOf(i) * (w + gap);
      const y = Math.floor(i / cols) * (h + gap);
      const card = b.node(`f${i}`, x, y, w, h, { ports });
      for (let j = 0; j < rows; j++) b.node(`f${i}r${j}`, x + 10, y + header + j * pitch, w - 20, 24, { parent: card });
    }
    for (let n = 0; n < cards * v["links"]!; n++) {
      const a = int(random, 0, cards - 1);
      const c = int(random, 0, cards - 1);
      const ra = int(random, 0, rows - 1);
      const rc = int(random, 0, rows - 1);
      // A link leaves its card on the wall that faces the other card.
      const east = colOf(a) <= colOf(c);
      b.link({ node: `f${a}`, port: `${east ? "e" : "w"}${ra}` }, { node: `f${c}`, port: `${east ? "w" : "e"}${rc}` });
    }
    for (let i = 0; i < cards; i++)
      for (let t = 0; t < v["inner"]!; t++) {
        const row = int(random, 0, rows - 1);
        const side = random() < 0.5 ? "e" : "w";
        b.link({ node: `f${i}r${row}` }, { node: `f${i}`, port: `${side}${int(random, 0, rows - 1)}` });
      }
    return b.graph();
  },
});

/** The dimensions of `pipeline`. */
const PIPELINE_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("stages", 4, 240, 72, "The number of stages of the chain."),
  count("perRow", 2, 40, 12, "The number of stages in each row. The chain turns at the end of each row."),
  count("skips", 0, 80, 8, "The number of tries for a link that skips 1 to 3 stages."),
  count("gap", 16, 160, 56, "The free space between two stages, in units."),
]);

/** The family `pipeline`: a long chain of stages in rows that turn at each end, with some links that skip stages. */
export const PIPELINE: HighwaysFamily = caseFamily({
  name: "pipeline",
  meaning: "A long chain of stages in rows that turn at each end, with a few links that skip stages.",
  dimensions: PIPELINE_DIMENSIONS,
  generator: "family.pipeline",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const stages = v["stages"]!;
    const perRow = v["perRow"]!;
    const gap = v["gap"]!;
    const cell = 120;
    for (let i = 0; i < stages; i++) {
      const r = Math.floor(i / perRow);
      const p = i % perRow;
      const col = r % 2 === 0 ? p : perRow - 1 - p;
      const w = int(random, 72, cell);
      b.node(`s${i}`, col * (cell + gap) + Math.floor((cell - w) / 2), r * (40 + gap), w, 40);
    }
    for (let i = 0; i + 1 < stages; i++) b.link({ node: `s${i}` }, { node: `s${i + 1}` });
    for (let n = 0; n < v["skips"]!; n++) {
      const s = int(random, 0, stages - 1);
      const d = int(random, 2, 4);
      if (s + d < stages) b.link({ node: `s${s}` }, { node: `s${s + d}` });
    }
    return b.graph();
  },
});

/** This function gives the cells of the square ring `r` around the cell (0, 0), in a fixed order. */
function ring(r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) out.push([dx, dy]);
  return out;
}

/** The dimensions of `fan-out`. */
const FAN_OUT_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("leaves", 4, 240, 96, "The number of leaves. The hub links to each leaf."),
  count("cross", 0, 120, 8, "The number of tries for a link between two leaves."),
  count("gap", 8, 120, 36, "The free space between two leaves, in units."),
]);

/** The family `fan-out`: one large hub in the middle, with a link to each leaf on the square rings around it. */
export const FAN_OUT: HighwaysFamily = caseFamily({
  name: "fan-out",
  meaning: "A wide fan-out: one hub in the middle links to each leaf on the rings around it.",
  dimensions: FAN_OUT_DIMENSIONS,
  generator: "family.fan-out",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const leaves = v["leaves"]!;
    const gap = v["gap"]!;
    const cw = 80 + gap;
    const ch = 32 + gap;
    // The hub covers the cells from -1 to 1. The leaves take cells of the rings 2 and more, with a quarter of the cells free.
    const cells: [number, number][] = [];
    let r = 2;
    while (cells.length < leaves + Math.floor(leaves / 4)) cells.push(...ring(r++));
    const reach = r - 1;
    const at = (dx: number, dy: number): [number, number] => [(dx + reach) * cw, (dy + reach) * ch];
    const [hx, hy] = at(-1, -1);
    const hub = b.node("hub", hx, hy, 2 * cw + 80, 2 * ch + 32);
    const ids: string[] = [];
    for (const i of choose(random, cells.length, leaves)) {
      const [x, y] = at(...cells[i]!);
      const w = int(random, 48, 80);
      const h = int(random, 20, 32);
      ids.push(b.node(`l${ids.length}`, x, y, w, h));
    }
    for (const id of ids) b.link({ node: hub }, { node: id });
    for (let n = 0; n < v["cross"]!; n++) b.link({ node: ids[int(random, 0, ids.length - 1)]! }, { node: ids[int(random, 0, ids.length - 1)]! });
    return b.graph();
  },
});

/** The dimensions of `two-hubs`. */
const TWO_HUBS_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("shared", 0, 160, 48, "The number of nodes between the hubs. Each of them has a link from each hub."),
  count("own", 0, 80, 12, "The number of nodes on the far side of each hub, with a link from that hub only."),
  count("span", 1, 12, 5, "The number of columns of nodes between the two hubs."),
  count("gap", 8, 120, 36, "The free space between two nodes, in units."),
]);

/** The family `two-hubs`: two tall hubs with many nodes between them. Each such node has a link from each hub. A few nodes of one hub are on its far side. */
export const TWO_HUBS: HighwaysFamily = caseFamily({
  name: "two-hubs",
  meaning: "Two hubs that share many targets between them: two fans that overlap.",
  dimensions: TWO_HUBS_DIMENSIONS,
  generator: "family.two-hubs",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const shared = v["shared"]!;
    const own = v["own"]!;
    const span = v["span"]!;
    const gap = v["gap"]!;
    const cw = 64 + gap;
    const ch = 28 + gap;
    const ceilDiv = (a: number, d: number): number => Math.floor((a + d - 1) / d);
    const rows = Math.max(1, ceilDiv(shared + Math.floor(shared / 4), span), ceilDiv(own + Math.floor(own / 4), 2));
    // The columns 0 and 1 are on the far side of hub A, at the column 2. The shared nodes take the columns 3 to span + 2.
    // Hub B is at the column span + 3, and its far side has the next 2 columns.
    const hubH = rows * ch - gap;
    const a = b.node("A", 2 * cw, 0, 64, hubH);
    const z = b.node("B", (span + 3) * cw, 0, 64, hubH);
    const place = (prefix: string, first: number, cols: number, n: number): string[] =>
      choose(random, cols * rows, n).map((c, i) => b.node(`${prefix}${i}`, (first + (c % cols)) * cw, Math.floor(c / cols) * ch, 64, 28));
    const mid = place("m", 3, span, shared);
    const left = place("a", 0, 2, own);
    const right = place("b", span + 4, 2, own);
    for (const id of mid) {
      b.link({ node: a }, { node: id });
      b.link({ node: z }, { node: id });
    }
    for (const id of left) b.link({ node: a }, { node: id });
    for (const id of right) b.link({ node: z }, { node: id });
    b.link({ node: a }, { node: z });
    return b.graph();
  },
});

/** The dimensions of `uneven-sizes`. */
const UNEVEN_SIZES_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("small", 4, 300, 90, "The number of small boxes."),
  count("large", 1, 16, 4, "The number of large boxes."),
  count("ratio", 2, 10, 5, "The size of a large box, divided by the size of a small box."),
  numberDimension({ name: "edgesPerNode", kind: "real", min: 0.5, max: 4, default: 1.5, meaning: "The number of tries for an edge, divided by the number of boxes." }),
  numberDimension({ name: "toLarge", kind: "real", min: 0, max: 1, default: 0.5, meaning: "The share of the edges with a large box at one end." }),
  count("gap", 8, 120, 30, "The free space between two boxes, in units."),
]);

/** The family `uneven-sizes`: a few large boxes and many small boxes in shelves, in a random order. Many edges end on a large box. */
export const UNEVEN_SIZES: HighwaysFamily = caseFamily({
  name: "uneven-sizes",
  meaning: "Very uneven box sizes: a few large boxes among many small boxes.",
  dimensions: UNEVEN_SIZES_DIMENSIONS,
  generator: "family.uneven-sizes",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const ratio = v["ratio"]!;
    const gap = v["gap"]!;
    const boxes: { id: string; w: number; h: number }[] = [];
    for (let i = 0; i < v["large"]!; i++) boxes.push({ id: `L${i}`, w: ratio * int(random, 48, 72), h: ratio * int(random, 24, 36) });
    for (let i = 0; i < v["small"]!; i++) boxes.push({ id: `s${i}`, w: int(random, 40, 80), h: int(random, 20, 40) });
    const order = shuffle(random, boxes.length);
    // The shelves: each box goes to the right of the last box, or on a new shelf below when the shelf is full.
    const area = boxes.reduce((s, x) => s + (x.w + gap) * (x.h + gap), 0);
    const width = Math.max(...boxes.map((x) => x.w), Math.floor((3 * ceilSqrt(area)) / 2));
    const places = new Map<string, [number, number]>();
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (const i of order) {
      const box = boxes[i]!;
      if (x > 0 && x + box.w > width) {
        x = 0;
        y += shelf + gap;
        shelf = 0;
      }
      places.set(box.id, [x, y]);
      x += box.w + gap + int(random, 0, gap);
      shelf = Math.max(shelf, box.h);
    }
    for (const box of boxes) {
      const [px, py] = places.get(box.id)!;
      b.node(box.id, px, py, box.w, box.h);
    }
    const ids = boxes.map((x) => x.id);
    const large = ids.slice(0, v["large"]!);
    const tries = Math.round(v["edgesPerNode"]! * ids.length);
    for (let n = 0; n < tries; n++) {
      const s = ids[int(random, 0, ids.length - 1)]!;
      const t = random() < v["toLarge"]! ? large[int(random, 0, large.length - 1)]! : ids[int(random, 0, ids.length - 1)]!;
      b.link({ node: s }, { node: t });
    }
    return b.graph();
  },
});

/** The dimensions of `thin-bars`. */
const THIN_BARS_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("lanes", 2, 40, 16, "The number of lanes. Each lane is a row of a timeline."),
  count("bars", 1, 12, 5, "The number of bars in each lane."),
  count("links", 0, 240, 64, "The number of tries for a link between two bars of lanes near each other."),
  count("thick", 4, 32, 12, "The height of each bar, in units."),
  count("gap", 4, 80, 16, "The free space between two lanes, in units."),
]);

/** The family `thin-bars`: long thin bars in lanes, as a timeline or the rows of a table. The links join bars of lanes near each other. */
export const THIN_BARS: HighwaysFamily = caseFamily({
  name: "thin-bars",
  meaning: "Long thin boxes in lanes, as a timeline or the rows of a table.",
  dimensions: THIN_BARS_DIMENSIONS,
  generator: "family.thin-bars",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const lanes = v["lanes"]!;
    const bars = v["bars"]!;
    const thick = v["thick"]!;
    for (let i = 0; i < lanes; i++) {
      let x = int(random, 0, 80);
      for (let j = 0; j < bars; j++) {
        const w = int(random, 120, 420);
        b.node(`t${i}-${j}`, x, i * (thick + v["gap"]!), w, thick);
        x += w + int(random, 24, 120);
      }
    }
    for (let n = 0; n < v["links"]!; n++) {
      const a = int(random, 0, lanes - 1);
      const c = Math.max(0, Math.min(lanes - 1, a + int(random, -3, 3)));
      b.link({ node: `t${a}-${int(random, 0, bars - 1)}` }, { node: `t${c}-${int(random, 0, bars - 1)}` });
    }
    return b.graph();
  },
});

/** The dimensions of `sparse-long`. */
const SPARSE_LONG_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("nodes", 4, 120, 36, "The number of nodes."),
  count("edges", 0, 160, 36, "The number of tries for a long edge."),
  count("spacing", 200, 1200, 480, "The size of the square cell of each node, in units."),
  count("far", 1, 8, 4, "The number of random targets of an edge. The edge takes the target farthest from its source."),
]);

/** The family `sparse-long`: few nodes far apart on a large board, and edges that go to far targets. */
export const SPARSE_LONG: HighwaysFamily = caseFamily({
  name: "sparse-long",
  meaning: "A sparse board: few nodes far apart, with long edges across the board.",
  dimensions: SPARSE_LONG_DIMENSIONS,
  generator: "family.sparse-long",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const n = v["nodes"]!;
    const spacing = v["spacing"]!;
    const cols = ceilSqrt(n);
    for (let i = 0; i < n; i++) {
      const w = int(random, 80, 120);
      const h = int(random, 32, 56);
      b.node(`n${i}`, (i % cols) * spacing + int(random, 0, spacing - w - 40), Math.floor(i / cols) * spacing + int(random, 0, spacing - h - 40), w, h);
    }
    const dist = (i: number, j: number): number => Math.abs((i % cols) - (j % cols)) + Math.abs(Math.floor(i / cols) - Math.floor(j / cols));
    for (let e = 0; e < v["edges"]!; e++) {
      const s = int(random, 0, n - 1);
      let best = -1;
      let far = -1;
      for (let f = 0; f < v["far"]!; f++) {
        const t = int(random, 0, n - 1);
        if (t !== s && dist(s, t) > far) {
          best = t;
          far = dist(s, t);
        }
      }
      if (best >= 0) b.link({ node: `n${s}` }, { node: `n${best}` });
    }
    return b.graph();
  },
});

/** The dimensions of `local-mesh`. */
const LOCAL_MESH_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("cols", 2, 40, 12, "The number of columns of nodes."),
  count("rows", 2, 30, 9, "The number of rows of nodes."),
  count("degree", 1, 6, 3, "The number of tries for an edge to one of the 8 nodes around a node, for each node."),
  count("gap", 8, 80, 20, "The free space between two nodes, in units."),
  count("jitter", 0, 40, 8, "The largest random move of a node in its cell, in units. The move stays 8 units or more below the gap."),
]);

/** The family `local-mesh`: a grid of small nodes with many short edges, each to a node of the 8 nodes around it. */
export const LOCAL_MESH: HighwaysFamily = caseFamily({
  name: "local-mesh",
  meaning: "Many short local edges: each node links to nodes next to it in a grid.",
  dimensions: LOCAL_MESH_DIMENSIONS,
  generator: "family.local-mesh",
  seeding: SEEDING,
  make: (v, _seed, random) => {
    const b = new Builder();
    const cols = v["cols"]!;
    const rows = v["rows"]!;
    const gap = v["gap"]!;
    const move = Math.min(v["jitter"]!, gap - 8);
    const id = (r: number, c: number): string => `m${r}-${c}`;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) b.node(id(r, c), c * (48 + gap) + int(random, 0, move), r * (28 + gap) + int(random, 0, move), 48, 28);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        for (let t = 0; t < v["degree"]!; t++) {
          const rr = r + int(random, -1, 1);
          const cc = c + int(random, -1, 1);
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) b.link({ node: id(r, c) }, { node: id(rr, cc) });
        }
    return b.graph();
  },
});

/** The values of the dimension `layout` of `bipartite`. */
export const BIPARTITE_LAYOUTS: readonly string[] = Object.freeze(["rows", "mixed"]);

/** The dimensions of `bipartite`. */
const BIPARTITE_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("left", 2, 16, 6, "The number of nodes of the first side of the complete bipartite part."),
  count("right", 2, 16, 6, "The number of nodes of the second side. Each node of the first side links to each node of the second side."),
  count("noise", 0, 120, 24, "The number of other nodes, in a band below the bipartite part."),
  count("extra", 0, 160, 24, "The number of tries for a random link between two nodes of the board."),
  enumDimension(
    "layout",
    BIPARTITE_LAYOUTS,
    "rows",
    "The places of the bipartite part. `rows`: each side in one row, one row above the other. `mixed`: all the nodes at random cells of one grid.",
  ),
  count("gap", 16, 160, 64, "The free space between two nodes, in units."),
]);

/**
 * The family `bipartite`: a complete bipartite part, with dense crossings that no plan can remove, and other nodes with random links.
 * At 3 nodes or more on each side, the part has no drawing without crossings.
 */
export const BIPARTITE: HighwaysFamily = caseFamily({
  name: "bipartite",
  meaning: "An adversarial board: a complete bipartite part whose crossings no plan can remove.",
  dimensions: BIPARTITE_DIMENSIONS,
  generator: "family.bipartite",
  seeding: SEEDING,
  make: (v, _seed, random, dims) => {
    const b = new Builder();
    const left = v["left"]!;
    const right = v["right"]!;
    const noise = v["noise"]!;
    const gap = v["gap"]!;
    const cw = 80 + gap;
    const ch = 36 + gap;
    const ids = [...Array.from({ length: left }, (_, i) => `a${i}`), ...Array.from({ length: right }, (_, j) => `b${j}`), ...Array.from({ length: noise }, (_, k) => `n${k}`)];
    if (dims["layout"] === "mixed") {
      const cols = ceilSqrt(ids.length + Math.floor(ids.length / 4));
      const cells = choose(random, cols * cols, ids.length);
      const order = shuffle(random, ids.length);
      ids.forEach((id, i) => {
        const c = cells[order[i]!]!;
        b.node(id, (c % cols) * cw, Math.floor(c / cols) * ch, 80, 36);
      });
    } else {
      // The first side is in the row 0, and the second side is in the row 3. The other nodes take random cells of the rows 5 and more.
      const cols = Math.max(left, right, ceilSqrt(noise));
      for (let i = 0; i < left; i++) b.node(`a${i}`, (i + Math.floor((cols - left) / 2)) * cw, 0, 80, 36);
      for (let j = 0; j < right; j++) b.node(`b${j}`, (j + Math.floor((cols - right) / 2)) * cw, 3 * ch, 80, 36);
      const band = Math.max(1, Math.floor((noise + Math.floor(noise / 4) + cols - 1) / cols));
      choose(random, cols * band, noise).forEach((c, k) => b.node(`n${k}`, (c % cols) * cw, (5 + Math.floor(c / cols)) * ch, 80, 36));
    }
    for (let i = 0; i < left; i++) for (let j = 0; j < right; j++) b.link({ node: `a${i}` }, { node: `b${j}` });
    for (let n = 0; n < v["extra"]!; n++) b.link({ node: ids[int(random, 0, ids.length - 1)]! }, { node: ids[int(random, 0, ids.length - 1)]! });
    return b.graph();
  },
});

/** The 9 families of CORPUS-FAMILIES, in the order of `screen-v3`. */
export const COVERAGE_FAMILIES: readonly HighwaysFamily[] = Object.freeze([FRAME_ROWS, PIPELINE, FAN_OUT, TWO_HUBS, UNEVEN_SIZES, THIN_BARS, SPARSE_LONG, LOCAL_MESH, BIPARTITE]);
