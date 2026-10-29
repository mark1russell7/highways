/**
 * A made-up board of cards with rows (PLUG-SPREAD, FIX-PORTS): each row of a card links to one row of another card.
 * The tests of the plug rules read it.
 */
import type { Edge, Graph, Node, Port } from "../model.ts";

/** The options of `rowCardsBoard`. */
export interface RowCardsOptions {
  /** The number of columns of cards. The default is 3. */
  readonly columns?: number;
  /** The number of cards. The default is 6. */
  readonly cards?: number;
  /** The number of rows of each card. The default is 20. */
  readonly rows?: number;
  /** The height of one row. The default is 12. */
  readonly rowHeight?: number;
}

/**
 * This function gives a board of cards with rows. Each row has a free port `o<row>` for its link out and a free port `i<row>` for a link in.
 * The row `r` of the card `c` links to the card `(c + 1 + r mod 5) mod cards`. Each card takes its links in on its rows in order.
 * With the defaults, the board has 6 cards and 120 edges, and each card is 160 by 240.
 */
export function rowCardsBoard(options: RowCardsOptions = {}): Graph {
  const columns = options.columns ?? 3;
  const count = options.cards ?? 6;
  const rows = options.rows ?? 20;
  const rowHeight = options.rowHeight ?? 12;
  const w = 160;
  const h = rows * rowHeight;
  const nodes: Node[] = [];
  for (let c = 0; c < count; c++) {
    const ports: Port[] = [];
    for (let r = 0; r < rows; r++) ports.push({ id: `o${r}` }, { id: `i${r}` });
    nodes.push({ id: `card${c}`, box: { x: (c % columns) * (w + 160), y: Math.floor(c / columns) * (h + 160), w, h }, ports });
  }
  const taken = new Array<number>(count).fill(0);
  const edges: Edge[] = [];
  for (let c = 0; c < count; c++)
    for (let r = 0; r < rows; r++) {
      const t = (c + 1 + (r % Math.min(5, count - 1))) % count;
      const row = taken[t]!++ % rows;
      edges.push({ id: `card${c}.r${r}`, source: { node: `card${c}`, port: `o${r}` }, target: { node: `card${t}`, port: `i${row}` } });
    }
  return { nodes, edges };
}
