// The test of one key (PORTFOLIO-FIT): the router picks the same member as the offline choice of `scripts/portfolio.ts` on the records of CI.
// The test routes the boards of `exact-v1` (10 nodes) and a part of `exact-v1-bounds` (18 nodes). The workflow `Portfolio` checks each record (`pnpm portfolio:api`).
import { describe, expect, it } from "vitest";
import { capTable, choose, ruleTable } from "../../scripts/portfolio.ts";
import { readShortRuns, runTableOf } from "../../scripts/portfolio-sets.ts";
import { EXACT_V1, EXACT_V1_BOUNDS } from "../bench/screen/exact-set.ts";
import { inputGraph } from "../bench/screen/forms.ts";
import { screenInputs } from "../bench/screen/set.ts";
import { PORTFOLIO_CAPS, PORTFOLIO_RULES } from "./bands.ts";
import { routePortfolio, type PortfolioRouterOptions } from "./router.ts";

describe("the pick of the portfolio router", () => {
  it("is the offline choice of the same members on the records of exact-v1 and a part of exact-v1-bounds", () => {
    const table = runTableOf(readShortRuns());
    const inputs = [
      ...screenInputs(EXACT_V1).map((input) => ({ input, k: 8 as const })),
      ...screenInputs(EXACT_V1_BOUNDS)
        .filter((i) => i.boxes.length === 18 && (i.seed ?? 0) < 2)
        .map((input) => ({ input, k: 5 as const })),
    ].filter(({ input }) => table.has(input.id));
    expect(inputs.length).toBeGreaterThanOrEqual(40);
    const differ: string[] = [];
    for (const rule of PORTFOLIO_RULES) {
      const rt = ruleTable(table, rule);
      for (const cap of PORTFOLIO_CAPS) {
        const ct = capTable(rt, cap);
        for (const { input, k } of inputs) {
          const graph = inputGraph(input);
          for (const o of [{ rule, cap, k }, { rule, cap }] satisfies PortfolioRouterOptions[]) {
            const r = routePortfolio(graph, o);
            const offline = choose(ct.get(input.id)!, r.members.slice(1), "cap");
            if (r.winner !== offline) differ.push(`${input.id} ${rule} ${cap} ${"k" in o ? `k${o.k}` : "fit"}: ${r.winner} against ${offline}`);
          }
        }
      }
    }
    expect(differ).toEqual([]);
  }, 300_000);
});
