import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { LEVEL_HIGHWAY_DEFAULTS, levelHighwayPlan } from "./index.ts";

const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const many = CASES.find((c) => c.name === "case-many-groups")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

describe("the highway strategy level-links (HWY-056, WILD-034)", () => {
  it("gives highways along the links of the level, with the edges between the two items", () => {
    const plan = levelHighwayPlan({ graph: many }, { ...LEVEL_HIGHWAY_DEFAULTS, from: "none" });
    expect(checkPlan(many, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    for (const h of plan.highways) {
      expect(h.key.startsWith("level1:"), h.key).toBe(true);
      expect(h.members.length).toBeGreaterThanOrEqual(LEVEL_HIGHWAY_DEFAULTS.minSize);
    }
  });

  it("gives fewer riders with a smaller stretch", () => {
    const riders = (stretch: number): number => levelHighwayPlan({ graph: many }, { ...LEVEL_HIGHWAY_DEFAULTS, from: "none", stretch }).highways.reduce((n, h) => n + h.members.length, 0);
    expect(riders(1.2)).toBeLessThanOrEqual(riders(2));
  });

  it("is in the registry, and gives a correct plan on each base, the same each time", () => {
    const links = getStrategy(STRATEGIES, "highway", "level-links");
    for (const graph of [hub, clustered, many])
      for (const from of ["shared-ways", "corridors", "none"] as const) {
        const plan = links.run({ graph }, { ...LEVEL_HIGHWAY_DEFAULTS, from });
        expect(checkPlan(graph, plan), from).toEqual([]);
        expect(levelHighwayPlan({ graph }, { ...LEVEL_HIGHWAY_DEFAULTS, from })).toEqual(plan);
      }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "level-links"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(many, router.run(many), 1_000_000)).toEqual([]);
  });
});
