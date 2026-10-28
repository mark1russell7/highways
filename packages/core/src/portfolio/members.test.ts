// The test of the members of the portfolio router: each member gives the same output as the strategy of the same name in the gap screen.
import { describe, expect, it } from "vitest";
import { strategies as screenStrategies } from "../../scripts/screens/meas2.ts";
import { exactBoard } from "../bench/screen/exact-set.ts";
import { resultHash } from "../bench/screen/exercise.ts";
import { STRATEGIES } from "../strategies/builtins.ts";
import { asRouter, listStrategies, type Strategy } from "../strategies/model.ts";
import { MEMBER_FORMS, portfolioMember } from "./members.ts";
import { PORTFOLIO_SETS } from "./sets.ts";

const twins = new Map<string, Strategy<"router", object>>([
  ...listStrategies(STRATEGIES, "router").map((s) => [s.name, s as Strategy<"router", object>] as const),
  ...screenStrategies.map((s) => [s.name, s] as const),
]);

describe("the members of the portfolio router", () => {
  it("has a member for each name of each set", () => {
    const names = [...new Set(Object.values(PORTFOLIO_SETS).flat())];
    expect(names.filter((n) => MEMBER_FORMS[n] === undefined)).toEqual([]);
  });

  it("gives the output hash of the strategy of the same name in the screen, on two boards", () => {
    const boards = [exactBoard("clustered", 10, 0), exactBoard("hubs", 18, 1)];
    const differ: string[] = [];
    for (const name of Object.keys(MEMBER_FORMS)) {
      const twin = twins.get(name);
      expect(twin, name).toBeDefined();
      for (const g of boards) {
        const mine = resultHash(asRouter(portfolioMember(name)!).route(g));
        const theirs = resultHash(asRouter(twin!).route(g));
        if (mine !== theirs) differ.push(`${name} on ${g.nodes.length} nodes`);
      }
    }
    expect(differ).toEqual([]);
  }, 120_000);
});
