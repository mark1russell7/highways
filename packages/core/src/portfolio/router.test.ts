// The tests of the portfolio router (PORTFOLIO-API, PORTFOLIO-FIT).
import { describe, expect, it } from "vitest";
import { inkSaved } from "../bench/measures/bundles.ts";
import { exactBoard } from "../bench/screen/exact-set.ts";
import { resultHash } from "../bench/screen/exercise.ts";
import { mixedSegments } from "../bench/screen/gap.ts";
import { STRATEGIES } from "../strategies/builtins.ts";
import { listStrategies } from "../strategies/model.ts";
import { portfolioBand } from "./bands.ts";
import { PORTFOLIO_FIT } from "./fit.ts";
import { guardBreaks, portfolioKey, type PortfolioFacts } from "./key.ts";
import { portfolioMember } from "./members.ts";
import { portfolioMembers, portfolioName, portfolioRouter, portfolioStrategy, routePortfolio } from "./router.ts";
import { PORTFOLIO_SETS } from "./sets.ts";

const board = exactBoard("clustered", 10, 3);

describe("the portfolio router", () => {
  it("chooses the band from the node count, and the last band above 128 nodes", () => {
    expect([1, 12, 13, 24, 25, 40, 41, 64, 65, 128, 129, 400].map((n) => portfolioBand(n).id)).toEqual([
      "n1-12",
      "n1-12",
      "n13-24",
      "n13-24",
      "n25-40",
      "n25-40",
      "n41-64",
      "n41-64",
      "n65-128",
      "n65-128",
      "n65-128",
      "n65-128",
    ]);
  });

  it("runs the base first, then the first k names of the set of the band", () => {
    expect(portfolioMembers(10, { k: 3 })).toEqual(["shared", ...PORTFOLIO_SETS["collection|1.5|n1-12"]!.slice(0, 3)]);
    expect(portfolioMembers(30, { rule: "all", cap: 1.1, k: 8 })).toEqual(["shared", ...PORTFOLIO_SETS["all|1.1|n25-40"]!.slice(0, 8)]);
    expect(portfolioMembers(400, { rule: "all", cap: 1.25, k: 5 })).toEqual(portfolioMembers(128, { rule: "all", cap: 1.25, k: 5 }));
  });

  it("runs the fit without k: each member of the fit of the band up to its node limit", () => {
    for (const n of [10, 12, 18, 24, 30, 40, 64, 150]) {
      const fit = PORTFOLIO_FIT[`all|1.25|${portfolioBand(n).id}`]!;
      expect(portfolioMembers(n, { rule: "all", cap: 1.25 })).toEqual(["shared", ...fit.filter(([, limit]) => n <= limit).map(([s]) => s)]);
    }
    expect(portfolioName()).toBe("portfolio-collection-1.5-fit");
    expect(routePortfolio(board).trace.deterministic).toBe(true);
  });

  it("gives the output of the winner, with the trace and the move count", () => {
    for (const rule of ["collection", "all"] as const) {
      const r = routePortfolio(board, { rule, cap: 1.25, k: 5 });
      expect(r.members).toEqual(portfolioMembers(10, { rule, cap: 1.25, k: 5 }));
      expect(r.trace.members.map((m) => m.id)).toEqual(r.members);
      expect(r.trace.winner).toBe(r.winner);
      expect(r.trace.deterministic).toBe(true);
      expect(r.moves).toEqual({ "move.pick": r.trace.picked ? 1 : 0 });
      const winner = portfolioMember(r.winner)!;
      expect(resultHash(r.result)).toBe(resultHash(winner.run(board, winner.defaults)));
      // The winner has the fewest hard breaks, then the most ink saved within the tie of B1.
      const ran = r.trace.members.filter((m) => m.status === "ran");
      const hard = Math.min(...ran.map((m) => m.values!["hard"]!));
      expect(r.trace.members[r.trace.winnerIndex]!.values!["hard"]).toBe(hard);
      const best = Math.max(...ran.filter((m) => m.values!["hard"] === hard).map((m) => m.values!["B1"]!));
      expect(inkSaved(r.result.routes)).toBeGreaterThanOrEqual(best - 0.01);
    }
  });

  it("counts each mixed segment as a hard break under the rule collection only", () => {
    const winner = routePortfolio(board, { rule: "all", cap: 1.5, k: 8 }).result;
    const mixed = mixedSegments(board, winner);
    expect(portfolioKey(board, "collection", 1.5).hard(board, winner) - portfolioKey(board, "all", 1.5).hard(board, winner)).toBe(mixed);
  });

  it("exempts the base from the cap, and counts each edge of a member above the cap", () => {
    const base = routePortfolio(board, { k: 3, maxMembers: 1 }).result;
    for (const cap of [1.1, 1.25, 1.5] as const) expect(portfolioKey(board, "all", cap, () => base).hard(board, base)).toBe(0);
    const other = portfolioMember("corners-side")!.run(board, {});
    const tight = portfolioKey(board, "all", 1.1, () => base).hard(board, other);
    const loose = portfolioKey(board, "all", 1.5, () => base).hard(board, other);
    expect(tight).toBeGreaterThanOrEqual(loose);
  });

  it("passes a member with the hard counts of the base, and refuses more breaks, an edge above the cap or a mixed segment", () => {
    const facts = (hard: Record<string, number>, stretch: number, mixed = 0): PortfolioFacts => ({ hard, over: (cap) => (stretch > cap + 1e-9 ? 1 : 0), mixed });
    const base = facts({ complete: 0, "run-shared": 2 }, 1.6);
    expect(guardBreaks(facts({ "run-shared": 2 }, 1.1), base, "collection", 1.1)).toBe(0);
    expect(guardBreaks(facts({ "run-shared": 3 }, 1.1), base, "collection", 1.1)).toBe(1);
    expect(guardBreaks(facts({ complete: 1, "run-shared": 1 }, 1.1), base, "all", 1.5)).toBe(1);
    expect(guardBreaks(facts({}, 1.2), base, "all", 1.1)).toBe(1);
    expect(guardBreaks(facts({}, 1.2), base, "all", 1.25)).toBe(0);
    expect(guardBreaks(facts({}, 1.2, 2), base, "collection", 1.25)).toBe(2);
    expect(guardBreaks(facts({}, 1.2, 2), base, "all", 1.25)).toBe(0);
  });

  it("gives the base when the budget or the count cuts the other members", () => {
    const one = routePortfolio(board, { k: 3, maxMembers: 1 });
    expect(one.winner).toBe("shared");
    expect(one.trace.cut).toBe(3);
    expect(one.moves).toEqual({ "move.pick": 0 });
    let t = 0;
    const late = routePortfolio(board, { k: 3, budgetMs: 5, now: () => (t += 10) });
    expect(late.winner).toBe("shared");
    expect(late.trace.deterministic).toBe(false);
  });

  it("gives the same output two times", () => {
    const a = routePortfolio(board, { rule: "all", cap: 1.5, k: 3 });
    const b = routePortfolio(board, { rule: "all", cap: 1.5, k: 3 });
    expect(resultHash(a.result)).toBe(resultHash(b.result));
    expect(a.winner).toBe(b.winner);
  });

  it("throws a RangeError for a bad option", () => {
    expect(() => portfolioMembers(10, { cap: 1.3 as 1.5 })).toThrow(RangeError);
    expect(() => portfolioMembers(10, { k: 4 as 3 })).toThrow(RangeError);
    expect(() => portfolioMembers(10, { rule: "any" as "all" })).toThrow(RangeError);
  });

  it("is opt-in: the registry STRATEGIES does not hold it", () => {
    expect(listStrategies(STRATEGIES, "router").map((s) => s.name)).not.toContain(portfolioStrategy.name);
    expect(portfolioRouter({ rule: "all", cap: 1.1, k: 8 }).name).toBe("portfolio-all-1.1-k8");
    expect(portfolioRouter().name).toBe("portfolio-collection-1.5-fit");
    expect(resultHash(portfolioStrategy.run(board, portfolioStrategy.defaults))).toBe(resultHash(routePortfolio(board).result));
  });
});
