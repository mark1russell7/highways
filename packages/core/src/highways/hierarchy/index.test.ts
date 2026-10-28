import { describe, expect, it } from "vitest";
import type { Section } from "../../sections.ts";
import { clustered, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { controlChain, HIERARCHY_DEFAULTS, HIERARCHY_GROUPS, hierarchyPlan } from "./index.ts";

/** This function gives an empty section with the id `id`. */
const section = (id: string): Section => ({ id, depth: id.length - 1, cell: { x: 0, y: 0, w: 1, h: 1 }, nodes: [], children: [] });

describe("the highway strategy hierarchy (HWY-001)", () => {
  it("goes up to the lowest common section and down again, without that section", () => {
    const [s, s0, s01, s012, s1, s13] = ["s", "s0", "s01", "s012", "s1", "s13"].map(section) as [Section, Section, Section, Section, Section, Section];
    expect(controlChain([s, s0, s01, s012], [s, s1, s13], Infinity).map((c) => c.id)).toEqual(["s012", "s01", "s0", "s1", "s13"]);
    expect(controlChain([s, s0, s01, s012], [s, s1, s13], 1).map((c) => c.id)).toEqual(["s0", "s1"]);
    expect(controlChain([s, s0], [s, s0], Infinity)).toEqual([]);
  });

  it("gives a correct plan with each tree of sections", () => {
    for (const group of HIERARCHY_GROUPS) expect(checkPlan(clustered, hierarchyPlan({ graph: clustered }, { ...HIERARCHY_DEFAULTS, group }))).toEqual([]);
  });

  commonTests("hierarchy", HIERARCHY_DEFAULTS, hierarchyPlan, [flows, parallel]);
});
