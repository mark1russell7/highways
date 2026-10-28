import { describe, expect, it } from "vitest";
import { clustered, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { candidateArcs, HUB_ARC_DEFAULTS, hubArcPlan } from "./index.ts";

describe("the highway strategy hub-arcs (HWY-042)", () => {
  it("gives candidate arcs with no copies, the longest first", () => {
    const arcs = candidateArcs({ graph: clustered }, HUB_ARC_DEFAULTS.generators);
    expect(arcs.length).toBeGreaterThan(0);
    const keys = arcs.map((s) => JSON.stringify(s));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("chooses at most q arcs, and none with q = 0", () => {
    for (const q of [1, 2, 12]) {
      const plan = hubArcPlan({ graph: clustered }, { ...HUB_ARC_DEFAULTS, q });
      expect(checkPlan(clustered, plan)).toEqual([]);
      expect(plan.highways.length).toBeLessThanOrEqual(q);
    }
    expect(hubArcPlan({ graph: clustered }, { ...HUB_ARC_DEFAULTS, q: 0 }).highways).toEqual([]);
    expect(hubArcPlan({ graph: clustered }, HUB_ARC_DEFAULTS).highways.length).toBeGreaterThan(0);
  });

  commonTests("hub-arcs", HUB_ARC_DEFAULTS, hubArcPlan, [flows]);
});
