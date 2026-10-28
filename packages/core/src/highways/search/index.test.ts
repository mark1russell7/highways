import { describe, expect, it } from "vitest";
import { follow } from "../follow.ts";
import { commonTests, flows, hub } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { tidyPlan } from "../base.ts";
import { candidatePlan } from "../select/index.ts";
import { SEARCH_DEFAULTS, searchPlan, searchScore } from "./index.ts";

describe("the highway strategy search (HWY-059)", () => {
  it("gives the start plan with no evaluations", () => {
    expect(searchPlan({ graph: hub }, { ...SEARCH_DEFAULTS, evaluations: 0 })).toEqual(tidyPlan(candidatePlan({ graph: hub }, "corridors")));
  });

  it("gives a plan with a score at least as high as the score of the start plan", () => {
    const o = { ...SEARCH_DEFAULTS, evaluations: 12 };
    const first = follow(hub, { highways: [] }).routes;
    const score = (plan: Parameters<typeof follow>[1]): number => searchScore(hub, follow(hub, plan).routes, first, o);
    const start = tidyPlan(candidatePlan({ graph: hub }, "corridors"));
    const found = searchPlan({ graph: hub }, o);
    expect(checkPlan(hub, found)).toEqual([]);
    expect(score(found)).toBeGreaterThanOrEqual(score(start));
  }, 30_000);

  it("gives a higher score to routes that save more ink, all else equal", () => {
    const first = follow(hub, { highways: [] }).routes;
    const o = { ...SEARCH_DEFAULTS, stretchWeight: 0, ambiguityWeight: 0, angleWeight: 0 };
    const start = tidyPlan(candidatePlan({ graph: hub }, "corridors"));
    expect(searchScore(hub, follow(hub, start).routes, first, o)).toBeGreaterThan(searchScore(hub, first, first, o));
  });

  commonTests("search", { ...SEARCH_DEFAULTS, evaluations: 4 }, searchPlan, [flows]);
});
