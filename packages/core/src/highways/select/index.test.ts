import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { checkPlan, memberAt } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { CANDIDATE_SOURCES, candidatePlan, candidateScore, SELECT_DEFAULTS, selectPlan } from "./index.ts";

const p = (x: number, y: number) => ({ x, y });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

describe("the highway strategy select (HWY-045)", () => {
  it("scores the ink that a highway saves, and the detour of its members", () => {
    const spine = [p(0, 0), p(100, 0)];
    const h = { id: "h0", key: "k", spine, lanes: ["a", "b"], members: [memberAt(spine, "a", 0, 1), memberAt(spine, "b", 0, 1)] };
    const routes = new Map([
      ["a", spine],
      ["b", [p(0, 10), p(100, 10)]],
    ]);
    const { gain, extra } = candidateScore(h, routes);
    expect(gain).toBeCloseTo(100, 9);
    expect(extra).toBeCloseTo(20, 9);
  });

  it("gives a correct plan of each generator", () => {
    for (const source of CANDIDATE_SOURCES) expect(checkPlan(clustered, candidatePlan({ graph: clustered }, source)), source).toEqual([]);
  });

  it("is in the registry, and gives a correct plan, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "select");
    for (const graph of [hub, clustered]) {
      const plan = strategy.run({ graph }, { ...SELECT_DEFAULTS });
      expect(checkPlan(graph, plan)).toEqual([]);
      expect(selectPlan({ graph }, SELECT_DEFAULTS)).toEqual(plan);
      for (const h of plan.highways) expect(SELECT_DEFAULTS.generators.some((g) => h.key.startsWith(`${g}:`)), h.key).toBe(true);
    }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "select"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
