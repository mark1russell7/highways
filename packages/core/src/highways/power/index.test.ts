import { describe, expect, it } from "vitest";
import { nodeLinks } from "../confluent/index.ts";
import { k23 } from "../confluent/k23.test-util.ts";
import { clustered, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { jaccardIndex, modulesOf, POWER_DEFAULTS, powerPlan } from "./index.ts";

describe("the highway strategy power (HWY-014)", () => {
  it("gives the Jaccard index of two sets", () => {
    expect(jaccardIndex(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3, 12);
    expect(jaccardIndex(new Set(), new Set())).toBe(1);
  });

  it("finds the two modules of K(2, 3) by both rules", () => {
    const [scope] = nodeLinks(k23, "all");
    for (const rule of ["exact", "near"] as const) {
      const modules = modulesOf(scope!.links, rule, 0.8).sort((a, b) => a.length - b.length);
      expect(modules).toEqual([
        ["a0", "a1"],
        ["b0", "b1", "b2"],
      ]);
    }
  });

  it("gives one power edge on K(2, 3), and none when it must save more edges", () => {
    const plan = powerPlan({ graph: k23 }, POWER_DEFAULTS);
    expect(checkPlan(k23, plan)).toEqual([]);
    expect(plan.highways.length).toBe(1);
    expect(powerPlan({ graph: k23 }, { ...POWER_DEFAULTS, minSaved: 6 }).highways).toEqual([]);
  });

  it("gives a correct plan with the rule near", () => {
    expect(checkPlan(clustered, powerPlan({ graph: clustered }, { ...POWER_DEFAULTS, modules: "near", jaccard: 0.5 }))).toEqual([]);
  });

  commonTests("power", POWER_DEFAULTS, powerPlan, [flows, k23]);
});
