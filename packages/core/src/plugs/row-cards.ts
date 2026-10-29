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

/** The options of `tallCardsBoard`. */
export interface TallCardsOptions {
  /** The number of rows of each card. The default is 20. */
  readonly rows?: number;
  /** The height of one row. The default is 55. */
  readonly rowHeight?: number;
  /** The number of rows that the box of the rows of each card shows. The list repeats for more cards. The default is `[3, 4, 5, 3, 4, 5]`. */
  readonly visible?: readonly number[];
  /** The height of the header of a card, above the box of its rows. The default is 40. */
  readonly header?: number;
  /** The height of the footer of a card, below the box of its rows. The default is 24. */
  readonly footer?: number;
  /** With `true`, each port has the range of its row (PORT-RANGE). The default is `true`. */
  readonly ranges?: boolean;
}

/**
 * This function gives a board of 6 cards with tall rows (PORT-RANGE, PLUG-ASSIGN), in 3 columns and 2 lines. It has the links of `rowCardsBoard`.
 * The box of the rows of a card is smaller than the card, because the card has a header and a footer. The box shows only some rows.
 * The port `o<row>` is on the east side, and the port `i<row>` is on the west side.
 * The range of a port is the reach of its row. It goes from the top of the box of the rows plus half a row to its bottom minus half a row.
 */
export function tallCardsBoard(options: TallCardsOptions = {}): Graph {
  const rows = options.rows ?? 20;
  const rowHeight = options.rowHeight ?? 55;
  const visible = options.visible ?? [3, 4, 5, 3, 4, 5];
  const header = options.header ?? 40;
  const footer = options.footer ?? 24;
  const ranged = options.ranges ?? true;
  const base = rowCardsBoard({ rows });
  const w = 160;
  const tall = header + Math.max(...visible) * rowHeight + footer;
  const nodes = base.nodes.map((n, c): Node => {
    const v = visible[c % visible.length]!;
    const h = header + v * rowHeight + footer;
    const range: [number, number] = [(header + rowHeight / 2) / h, (header + v * rowHeight - rowHeight / 2) / h];
    const ports = (n.ports ?? []).map((p): Port => ({ id: p.id, side: p.id.startsWith("o") ? "east" : "west", ...(ranged ? { range } : {}) }));
    return { id: n.id, box: { x: (c % 3) * (w + 200), y: Math.floor(c / 3) * (tall + 160), w, h }, ports };
  });
  return { nodes, edges: base.edges };
}
