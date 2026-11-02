import { describe, expect, it } from "vitest";
import { follow } from "../follow.ts";
import { commonTests, flows, hub } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { tidyPlan } from "../base.ts";
import { candidatePlan } from "../select/index.ts";
import { SEARCH_DEFAULTS, SEARCH_WORK_UNIT, searchPlan, searchRun, searchScore, type SearchStep } from "./index.ts";

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

  it("counts the same work on each run, and keeps the default plan with no work budget (SEARCH-BUDGET)", () => {
    const a = searchRun({ graph: hub }, { ...SEARCH_DEFAULTS, evaluations: 6 });
    const b = searchRun({ graph: hub }, { ...SEARCH_DEFAULTS, evaluations: 6, work: 0 });
    expect(a.evaluations).toBe(6);
    expect(a.work).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(a.plan).toEqual(searchPlan({ graph: hub }, { ...SEARCH_DEFAULTS, evaluations: 6 }));
  }, 30_000);

  it("measures no new plan after the work budget, and gives the start plan with too little work (SEARCH-BUDGET)", () => {
    const three = searchRun({ graph: hub }, { ...SEARCH_DEFAULTS, evaluations: 3 });
    const two = searchRun({ graph: hub }, { ...SEARCH_DEFAULTS, evaluations: 2 });
    // A budget between the work of 2 plans and the work of 3 plans stops after the third plan.
    const budget = (two.work + three.work) / 2 / SEARCH_WORK_UNIT;
    const cut = searchRun({ graph: hub }, { ...SEARCH_DEFAULTS, evaluations: 6, work: budget });
    expect(cut).toEqual(three);
    const least = searchRun({ graph: hub }, { ...SEARCH_DEFAULTS, work: 1 / SEARCH_WORK_UNIT });
    expect(least.evaluations).toBe(1);
    expect(least.plan).toEqual(tidyPlan(candidatePlan({ graph: hub }, "corridors")));
  }, 30_000);

  it("gives each measured plan to the observer, and the observer does not change the search (SEARCH-OBJECTIVE)", () => {
    const o = { ...SEARCH_DEFAULTS, evaluations: 6 };
    const plain = searchRun({ graph: hub }, o);
    const steps: SearchStep[] = [];
    const seen = searchRun({ graph: hub }, o, (s) => steps.push(s));
    expect(seen).toEqual(plain);
    expect(steps.map((s) => s.n)).toEqual(Array.from({ length: plain.evaluations }, (_, i) => i + 1));
    expect(steps[0]!.from).toBe(0);
    const first = follow(hub, { highways: [] }).routes;
    for (const s of steps) {
      expect(s.from).toBeLessThan(s.n);
      expect(s.score).toBe(searchScore(hub, s.result.routes, first, o));
    }
  }, 30_000);

  commonTests("search", { ...SEARCH_DEFAULTS, evaluations: 4 }, searchPlan, [flows]);
});
