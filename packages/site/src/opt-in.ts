import { OPT_IN_STRATEGIES, register, STRATEGIES, type AnyStrategy, type Registry } from "@mark1russell7/highways";

/** The note of one opt-in router on the compare page. Its numbers are recorded numbers, so they stay the same on each board. */
export interface OptInNote {
  /** The file of the repository that has the numbers of `text`. */
  readonly source: "docs/research/CATALOG.md" | "docs/research/PORTFOLIO.md" | "docs/research/XPLAT.md";
  /** The stage of the idea in its source. */
  readonly stage: "built" | "kept" | "screened";
  /** The recorded numbers. A word in backticks is code. */
  readonly text: string;
  /** The page does not run the router on a board with more nodes. The panel keeps the recorded numbers of `text`. */
  readonly limit?: number;
}

/**
 * The notes of the opt-in routers, one for each router of `OPT_IN_STRATEGIES`.
 * A ratio compares a router with `shared`. A test finds each decimal number in the file `source`.
 */
export const OPT_IN_NOTES: Readonly<Record<string, OptInNote>> = {
  adam: {
    source: "docs/research/CATALOG.md",
    stage: "screened",
    text: "Recorded on `screen-v2`: crossings (R1) are `better` with 0 families against, and 3 of 6 families tie. The time is 7.17 times `shared`.",
  },
  annealing: {
    source: "docs/research/CATALOG.md",
    stage: "screened",
    text: "Recorded on `screen-v2`: the median ink saved (B1) is 0.754 times `shared`. Crossings (R1) are `worse`, with 3 of 6 families against. The time is 3.77 times `shared`.",
  },
  attraction: {
    source: "docs/research/CATALOG.md",
    stage: "screened",
    text: "Recorded on `screen-v2`: ink saved (B1) and crossings (R1) are `better`, with 0 families against. The B1 gain is 0.003. The run count (B8) is `worse`. The time is 2.76 times `shared`.",
  },
  canals: {
    source: "docs/research/CATALOG.md",
    stage: "kept",
    text: "Recorded on `screen-v2`: crossings (R1) and ink saved (B1) are `better`, with 0 families against. The detour spread (R5) is `worse`. The time is 0.83 times `shared`.",
  },
  nudge: {
    source: "docs/research/CATALOG.md",
    stage: "screened",
    text: "Recorded on `screen-v3`: the lane balance (R16.cv) is 0.954, and `shared` has 1.012. Crossings (R1) are 1.127 times `shared`, so the router fails that guard. The time is 1.18 times `shared`.",
  },
  portfolio: {
    source: "docs/research/PORTFOLIO.md",
    stage: "kept",
    text: "Recorded on `screen-v1`: `shared` and 3 more strategies keep 72% of the oracle gain, at most 4.3% over the best single strategy on each board. At 40 nodes, a run takes 51 to 176 ms.",
    limit: 500,
  },
  repel: {
    source: "docs/research/CATALOG.md",
    stage: "screened",
    text: "Recorded on `screen-v3`: close parallel legs (R12) are 0.613 times `shared`. Crossings (R1) are 1.384 times `shared`, so the router fails that guard. The time is 52.1 times `shared`, so it also fails the time test.",
    limit: 500,
  },
  reroute: {
    source: "docs/research/CATALOG.md",
    stage: "screened",
    text: "Recorded on `screen-v2`: close parallel legs (R12) are `better`, but crossings (R1) and the bundled share (B2) are `worse`. The median ink saved (B1) is 0.933 times `shared`. The time is 2.13 times `shared`.",
  },
  rules: {
    source: "docs/research/CATALOG.md",
    stage: "built",
    text: "No screen record yet for this router. A rule file as data compiles to one energy. The file `adam` gives the routes of the router `adam`, so its time is 7.17 times `shared`.",
  },
  "shared-stretch": {
    source: "docs/research/XPLAT.md",
    stage: "kept",
    text: "Recorded: the order `sifting` cuts `B5` plus the broken pairs by 24%. On the board of 1000 boxes, the time is 25.4 times `shared`, so the router is for small and medium boards.",
    limit: 500,
  },
  springs: {
    source: "docs/research/CATALOG.md",
    stage: "screened",
    text: "Recorded on `screen-v3`: the total turn (R4) is 0.451 times `shared`. Crossings (R1) are 1.804 times `shared`, so the router fails that guard. The time is 6.6 times `shared`.",
  },
  tight: {
    source: "docs/research/CATALOG.md",
    stage: "screened",
    text: "Recorded on `screen-v2`: the detour spread (R5 q95) is `better` with 0 families against, and 4 of 6 families tie. The time is 1.21 times `shared`.",
  },
};

/** This function gives the router with the limit of its note, so the page gives a skipped panel past that limit. */
function limited(router: AnyStrategy): AnyStrategy {
  const limit = OPT_IN_NOTES[router.name]?.limit;
  return limit === undefined ? router : { ...router, maxNodes: limit };
}

/**
 * The registry of the compare page: `STRATEGIES` and the opt-in routers.
 * The live demo stays on `STRATEGIES`, so its first drawing does not change.
 */
export const COMPARE_STRATEGIES: Registry = register(STRATEGIES, ...OPT_IN_STRATEGIES.map(limited));
