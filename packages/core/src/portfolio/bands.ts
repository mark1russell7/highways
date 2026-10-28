/** The rule of the caller. Under `collection`, a shared segment holds edges of one collection only. Under `all`, collections can mix. */
export type PortfolioRule = "collection" | "all";

/** The stretch caps of the portfolio router: the caps of the gap closed (B10). */
export type PortfolioCap = 1.1 | 1.25 | 1.5;

/** The rules of the portfolio router. */
export const PORTFOLIO_RULES: readonly PortfolioRule[] = ["collection", "all"];

/** The caps of the portfolio router. */
export const PORTFOLIO_CAPS: readonly PortfolioCap[] = [1.1, 1.25, 1.5];

/** The sizes of the sets of the portfolio router, without the base. */
export const PORTFOLIO_KS_API: readonly (3 | 5 | 8)[] = [3, 5, 8];

/** One size band of the inputs. Each band has its own greedy sets. */
export interface PortfolioBand {
  readonly id: string;
  /** The largest node count of the band. An input with more nodes than the last band uses the last band. */
  readonly maxNodes: number;
}

/**
 * The size bands: up to 12 nodes, 13 to 24 nodes, 25 to 40 nodes, 41 to 64 nodes and 65 to 128 nodes. An input above 128 nodes uses the band `n65-128`.
 * The two large bands come from PORTFOLIO-SPEED. Their boards have no optima, so their sets come from the B1 under the guard.
 */
export const PORTFOLIO_BANDS: readonly PortfolioBand[] = [
  { id: "n1-12", maxNodes: 12 },
  { id: "n13-24", maxNodes: 24 },
  { id: "n25-40", maxNodes: 40 },
  { id: "n41-64", maxNodes: 64 },
  { id: "n65-128", maxNodes: 128 },
];

/** This function gives the band of a node count: the first band whose `maxNodes` is the count or more, else the last band. */
export function portfolioBand(nodes: number, bands: readonly PortfolioBand[] = PORTFOLIO_BANDS): PortfolioBand {
  return bands.find((b) => nodes <= b.maxNodes) ?? bands[bands.length - 1]!;
}
