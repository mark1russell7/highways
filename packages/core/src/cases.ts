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

/** The case boards of the benchmark. Each board has a few hundred nodes at most, so the benchmark races them on each run. */
export const CASES: readonly CaseBoard[] = [
  { name: "case-dense-groups", defect: "Groups overlap at the far view, and level links go through other groups.", make: denseGroupsBoard },
  { name: "case-hub-chain", defect: "A route climbs a chain of hubs away from its target and comes back.", make: hubChainBoard },
  { name: "case-many-groups", defect: "On a level with many groups, links go around the outer edge of the board.", make: manyGroupsBoard },
];
