// The test of the option `hashes` of the portfolio router (HASH-LAZY): "pick" and "all" give the same output, winner and `picked`.
// The boards are the board of `router.test.ts` and the test seeds 5 to 9 of each size band. Under "pick", at most 2 members of a trace have a hash.
import { describe, expect, it } from "vitest";
import { EXACT_CLASSES, exactBoard } from "../bench/screen/exact-set.ts";
import { resultHash } from "../bench/screen/exercise.ts";
import type { Graph } from "../model.ts";
import { PORTFOLIO_BANDS, PORTFOLIO_CAPS, PORTFOLIO_RULES } from "./bands.ts";
import { portfolioMembers, portfolioRouter, routePortfolio, type PortfolioRouterOptions } from "./router.ts";

/** The test boards: one board of each test seed (5 to 9) at the top size of each band. The class goes round with the seed. */
const heldOut: readonly { readonly id: string; readonly graph: Graph }[] = PORTFOLIO_BANDS.flatMap((band) =>
  [5, 6, 7, 8, 9].map((seed) => {
    const cls = EXACT_CLASSES[seed % EXACT_CLASSES.length]!;
    return { id: `${cls}-n${band.maxNodes}-s${seed}`, graph: exactBoard(cls, band.maxNodes, seed) };
  }),
);

const boards = [{ id: "clustered-n10-s3", graph: exactBoard("clustered", 10, 3) }, ...heldOut];

describe("the option hashes of the portfolio router", () => {
  it("gives the same output, winner, winnerIndex, kept and picked under pick and all, with at most 2 hashes under pick", () => {
    const differ: string[] = [];
    let picks = 0;
    let moved = 0;
    for (const { id, graph } of boards)
      for (const rule of PORTFOLIO_RULES)
        for (const cap of PORTFOLIO_CAPS) {
          // The fit (the default) runs on each board. The forms with k run on the small boards, so more picks move.
          const forms: PortfolioRouterOptions[] = [{ rule, cap }];
          if (graph.nodes.length <= 24) forms.push({ rule, cap, k: 3 }, { rule, cap, k: 8 });
          for (const o of forms) {
            const all = routePortfolio(graph, { ...o, hashes: "all" });
            const pick = routePortfolio(graph, o);
            const at = `${id} ${rule} ${cap} ${o.k === undefined ? "fit" : `k${o.k}`}`;
            picks++;
            if (pick.trace.picked) moved++;
            if (resultHash(pick.result) !== resultHash(all.result)) differ.push(`${at}: the output`);
            if (pick.winner !== all.winner || pick.trace.winnerIndex !== all.trace.winnerIndex) differ.push(`${at}: the winner ${pick.winner} against ${all.winner}`);
            if (pick.trace.picked !== all.trace.picked) differ.push(`${at}: picked`);
            if (JSON.stringify(pick.trace.kept) !== JSON.stringify(all.trace.kept)) differ.push(`${at}: kept`);
            expect(pick.moves, at).toEqual(all.moves);
            // Under "all", each member that ran has a hash.
            expect(all.trace.members.every((m) => m.status !== "ran" || m.outputHash !== undefined), at).toBe(true);
            // Under "pick", only the base and the winner have a hash, and only when the winner is not the base.
            const hashed = pick.trace.members.flatMap((m, i) => (m.outputHash === undefined ? [] : [i]));
            expect(hashed.length, at).toBeLessThanOrEqual(2);
            expect(hashed, at).toEqual(pick.trace.winnerIndex > 0 ? [0, pick.trace.winnerIndex] : []);
            for (const i of hashed) expect(pick.trace.members[i]!.outputHash, at).toBe(all.trace.members[i]!.outputHash);
          }
        }
    expect(differ).toEqual([]);
    // The check has a meaning only when picks move.
    expect(moved).toBeGreaterThan(0);
    expect(picks).toBeGreaterThan(moved);
  }, 300_000);

  it("has the default pick, and throws a RangeError for another value", () => {
    const graph = boards[0]!.graph;
    const r = routePortfolio(graph, { rule: "all", cap: 1.5, k: 8 });
    expect(r.trace.members.filter((m) => m.outputHash !== undefined).length).toBeLessThanOrEqual(2);
    expect(() => portfolioMembers(10, { hashes: "none" as "all" })).toThrow(RangeError);
    expect(() => portfolioRouter({ hashes: "none" as "all" })).toThrow(RangeError);
    expect(portfolioRouter({ hashes: "all" }).name).toBe(portfolioRouter().name);
  });
});
