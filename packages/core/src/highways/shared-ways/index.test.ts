import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { FIXTURES, makeFixture } from "../../fixtures.ts";
import { sharedRouter } from "../../routers/shared.ts";
import { byCollection } from "../../routers/trunks.ts";
import { segmentsOf } from "../../segments.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { sharedWaysPlan } from "./index.ts";

const graph = makeFixture(FIXTURES.find((f) => f.name === "small-clustered")!);

describe("the highway strategy shared-ways (HWY-STEP)", () => {
  it("is in the registry and gives a good plan", () => {
    const ways = getStrategy(STRATEGIES, "highway", "shared-ways");
    const plan = ways.run({ graph });
    expect(checkPlan(graph, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    expect(ways.run({ graph })).toEqual(plan);
  });

  it("gives one highway for each stretch that two edges or more of the router shared go along", () => {
    const plan = sharedWaysPlan({ graph }, { rule: byCollection });
    const shared = segmentsOf(sharedRouter({ name: "shared", rule: byCollection }).route(graph)).segments.filter((s) => s.count > 1);
    expect(plan.highways.map((h) => h.spine)).toEqual(shared.map((s) => s.points));
    expect(plan.highways.map((h) => [...h.lanes].sort())).toEqual(shared.map((s) => [...s.edges].sort()));
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "shared-ways"));
    expect(checkProperties(graph, router.run(graph), 1_000_000)).toEqual([]);
  });
});
