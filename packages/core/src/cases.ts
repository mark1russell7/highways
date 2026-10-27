import { makeFixture, rng } from "./fixtures.ts";
import type { Edge, Graph, Node } from "./model.ts";

/**
 * A board of made-up data that shows one known defect of the routes or of the zoom levels.
 * The benchmark races the routers on each case, and the measures of `measureLinks` give a number for the defect.
 */
export interface CaseBoard {
  readonly name: string;
  /** The defect that the board shows, in a few words. */
  readonly defect: string;
  /** This function makes the graph. The same function always gives the same graph. */
  readonly make: () => Graph;
}

/** A board while it grows: the functions add nodes and edges in order. */
class Board {
  readonly nodes: Node[] = [];
  readonly edges: Edge[] = [];
  readonly #pairs = new Set<string>();

  node(id: string, x: number, y: number, w: number, h: number): string {
    this.nodes.push({ id, box: { x, y, w, h } });
    return id;
  }

  /** This method adds an edge. It adds nothing for a loop or for a second edge between the same two nodes. */
  link(source: string, target: string): void {
    const key = source < target ? `${source}|${target}` : `${target}|${source}`;
    if (source === target || this.#pairs.has(key)) return;
    this.#pairs.add(key);
    this.edges.push({ id: `e${this.edges.length}`, source: { node: source }, target: { node: target } });
  }

  graph(): Graph {
    return { nodes: this.nodes, edges: this.edges };
  }
}

/**
 * This function makes a dense board: 150 nodes in tight clusters. At the far view, the boxes of the groups overlap.
 * Then a level link starts or ends in a group that another group covers.
 */
export function denseGroupsBoard(): Graph {
  return makeFixture({ name: "dense-groups", kind: "clustered", nodes: 150, edgesPerNode: 2, seed: 3 });
}

/**
 * This function makes a board of three rows of 32 cards. Each card links to the next card of its row.
 * Forty long links join cards far apart. The hub of a section is near the middle of its cards.
 * So a long link climbs to hubs behind its source or past its target, and comes back.
 */
export function hubChainBoard(): Graph {
  const R = rng(3);
  const b = new Board();
  const rows = 3;
  const cols = 32;
  const gap = 48;
  const id = (r: number, c: number): string => `c${r}-${c}`;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) b.node(id(r, c), c * (80 + gap), r * (36 + gap), 80, 36);
  for (let r = 0; r < rows; r++) for (let c = 0; c + 1 < cols; c++) b.link(id(r, c), id(r, c + 1));
  for (let n = 0; n < 40; n++) {
    const r = Math.floor(R() * rows);
    const c = Math.floor(R() * cols);
    const span = Math.floor(cols / 8 + (R() * cols) / 2);
    if (c + span < cols) b.link(id(r, c), id((r + 1) % rows, c + span));
  }
  return b.graph();
}

/**
 * This function makes a board of 32 groups in 8 columns and 4 rows. Each group has 4 cards in a square.
 * The cards of a group link in a chain, and 96 random links join cards of two groups.
 * On a level with many groups, some level links go around the outer edge of the board.
 */
export function manyGroupsBoard(): Graph {
  const R = rng(7);
  const b = new Board();
  const cols = 8;
  const rows = 4;
  const per = 4;
  const w = 60;
  const h = 30;
  const cardGap = 12;
  const groupGap = 60;
  const side = Math.ceil(Math.sqrt(per));
  const gw = side * w + (side - 1) * cardGap;
  const gh = Math.ceil(per / side) * h + (Math.ceil(per / side) - 1) * cardGap;
  const groups: string[][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const list: string[] = [];
      for (let i = 0; i < per; i++) {
        const x = c * (gw + groupGap) + (i % side) * (w + cardGap);
        const y = r * (gh + groupGap) + Math.floor(i / side) * (h + cardGap);
        list.push(b.node(`g${r}-${c}-${i}`, x, y, w, h));
      }
      groups.push(list);
    }
  for (const list of groups) for (let i = 1; i < list.length; i++) b.link(list[i - 1]!, list[i]!);
  const pick = (list: readonly string[]): string => list[Math.floor(R() * list.length)]!;
  for (let n = 0; n < groups.length * 3; n++) b.link(pick(groups[Math.floor(R() * groups.length)]!), pick(groups[Math.floor(R() * groups.length)]!));
  return b.graph();
}

/** The options of `packedGridBoard`. */
export interface PackedGridOptions {
  /** The seed of the links. The default is 11. */
  readonly seed?: number;
  /** The number of columns. The default is 12. */
  readonly cols?: number;
  /** The number of rows. The default is 8. */
  readonly rows?: number;
  /** The number of long links between boxes far apart. The default is 48. */
  readonly long?: number;
}

/**
 * This function makes the far view of a board after a host layout packs it.
 * The board has 96 boxes of one size in a grid of 12 columns and 8 rows.
 * The boxes touch, with no gap between them. Each box links to a box near it, and 48 long links join boxes far apart.
 * The links have no channel between the boxes. The roadmap item ROOM measures this board before and after `makeRoom`.
 *
 * The board is not in `CASES`, because the digests of the router fix the output on each board of `CASES`.
 * The options make a family of such boards for the measure suite. Without options, the board does not change.
 */
export function packedGridBoard(options: PackedGridOptions = {}): Graph {
  const R = rng(options.seed ?? 11);
  const b = new Board();
  const cols = options.cols ?? 12;
  const rows = options.rows ?? 8;
  const long = options.long ?? 48;
  const w = 140;
  const h = 90;
  const id = (r: number, c: number): string => `p${r}-${c}`;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) b.node(id(r, c), c * w, r * h, w, h);
  const step = (): number => Math.floor(R() * 5) - 2;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const rr = Math.max(0, Math.min(rows - 1, r + step()));
      const cc = Math.max(0, Math.min(cols - 1, c + step()));
      b.link(id(r, c), id(rr, cc));
    }
  for (let n = 0; n < long; n++) b.link(id(Math.floor(R() * rows), Math.floor(R() * cols)), id(Math.floor(R() * rows), Math.floor(R() * cols)));
  return b.graph();
}

/**
 * This function makes a packed board with three zoom levels of groups. The board has 256 touching boxes in a grid of 16 columns and 16 rows.
 * The quadtree of `buildSections` splits it into 4, 16 and 64 groups. Each box links to a box near it, and 64 long links join boxes far apart.
 * At each level, the boxes of the groups touch, so the level links have no channel. The roadmap item ROOM2 measures this board.
 *
 * The board is not in `CASES`, because the digests of the router fix the output on each board of `CASES`.
 */
export function nestedGridBoard(): Graph {
  const R = rng(13);
  const b = new Board();
  const side = 16;
  const w = 120;
  const h = 80;
  const id = (r: number, c: number): string => `n${r}-${c}`;
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) b.node(id(r, c), c * w, r * h, w, h);
  const step = (): number => Math.floor(R() * 5) - 2;
  const clamp = (v: number): number => Math.max(0, Math.min(side - 1, v));
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) b.link(id(r, c), id(clamp(r + step()), clamp(c + step())));
  for (let n = 0; n < 64; n++) b.link(id(Math.floor(R() * side), Math.floor(R() * side)), id(Math.floor(R() * side), Math.floor(R() * side)));
  return b.graph();
}

/** The case boards of the benchmark. Each board has a few hundred nodes at most, so the benchmark races them on each run. */
export const CASES: readonly CaseBoard[] = [
  { name: "case-dense-groups", defect: "Groups overlap at the far view, and level links go through other groups.", make: denseGroupsBoard },
  { name: "case-hub-chain", defect: "A route climbs a chain of hubs away from its target and comes back.", make: hubChainBoard },
  { name: "case-many-groups", defect: "On a level with many groups, links go around the outer edge of the board.", make: manyGroupsBoard },
];
