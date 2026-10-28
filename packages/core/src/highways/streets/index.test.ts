import { describe, expect, it } from "vitest";
import { commonTests, flows, rows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { STREET_DEFAULTS, streetPlan } from "./index.ts";

describe("the highway strategy streets (HWY-058)", () => {
  it("covers the edges with straight axis-parallel streets, each edge on one street at most", () => {
    const plan = streetPlan({ graph: rows }, { ...STREET_DEFAULTS, detour: 1.3, minGain: 1.5 });
    expect(checkPlan(rows, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const h of plan.highways) {
      expect(h.spine.length).toBe(2);
      expect(h.spine[0]!.x === h.spine[1]!.x || h.spine[0]!.y === h.spine[1]!.y).toBe(true);
      for (const m of h.members) {
        expect(seen.has(m.edge)).toBe(false);
        seen.add(m.edge);
      }
    }
  });

  it("stops at the gain and at the number of streets", () => {
    expect(streetPlan({ graph: rows }, { ...STREET_DEFAULTS, detour: 1.3, minGain: 8 }).highways).toEqual([]);
    expect(streetPlan({ graph: rows }, { ...STREET_DEFAULTS, detour: 1.3, minGain: 1, maxStreets: 0 }).highways).toEqual([]);
  });

  commonTests("streets", STREET_DEFAULTS, streetPlan, [flows, rows]);
});
