import { describe, expect, it } from "vitest";
import { CASES } from "../cases.ts";
import type { Graph, Node } from "../model.ts";
import { capSettings, formatSections, groupSettings, slackSettings, stretchSettings, sweepSections, type SectionsBenchRow } from "./sections.ts";

const board = (name: string): Graph => CASES.find((c) => c.name === name)!.make();
const hard = (r: SectionsBenchRow): number[] => [r.faults.through, r.faults.outside, r.faults.backtrack, r.levelFaults.through, r.levelFaults.outside];

describe("the sweeps of the options of the levels (CUSTOM)", () => {
  it("the hub limit on case-hub-chain: 1.5 lowers the worst detour by more than 10% against 2, with fewer routes through hubs", () => {
    const rows = sweepSections("case-hub-chain", board("case-hub-chain"), stretchSettings([1.25, 1.5, 2, 3]));
    const row = (s: string): SectionsBenchRow => rows.find((r) => r.setting === s)!;
    const [fair, two, low] = [row("defaults"), row("stretch 2"), row("stretch 1.5")];
    expect({ ...two, setting: "", ms: 0 }).toEqual({ ...fair, setting: "", ms: 0 });
    expect(fair.faults.worstDetour).toBeCloseTo(1.78, 2);
    expect(low.faults.worstDetour).toBeLessThanOrEqual(0.9 * two.faults.worstDetour);
    expect(low.faults.worstDetour).toBeLessThanOrEqual(1.4);
    expect(low.hubRoutes).toBeLessThan(two.hubRoutes);
    expect(row("stretch 1.25").hubRoutes).toBeLessThan(low.hubRoutes);
    expect(row("stretch 3").faults.worstDetour).toBeGreaterThan(two.faults.worstDetour);
    // No fault of the hard rules rises at any value of the sweep. The levels do not depend on the hub limit.
    for (const r of rows) {
      expect(hard(r)).toEqual(hard(fair));
      expect(r.faults.backtrack).toBe(0);
      expect([r.levelFaults.backtrack, r.overlaps]).toEqual([fair.levelFaults.backtrack, fair.overlaps]);
    }
    expect(formatSections(rows).split("\n")).toHaveLength(2 + 5);
  });

  it("the slack of the hubs on case-hub-chain: without a skip, most ways through the hubs go out and back and give way to the direct way", () => {
    const rows = sweepSections("case-hub-chain", board("case-hub-chain"), slackSettings([0, 80, Infinity]));
    const row = (s: string): SectionsBenchRow => rows.find((r) => r.setting === s)!;
    expect(row("hubSlack Infinity").hubRoutes).toBeLessThan(row("hubSlack 80").hubRoutes / 2);
    for (const r of rows) expect(r.faults.backtrack).toBe(0);
  });

  it("the section limit on case-dense-groups: a smaller cap makes one more level, and no fault of the routes", () => {
    const rows = sweepSections("case-dense-groups", board("case-dense-groups"), capSettings([4, 8, 16]));
    const row = (s: string): SectionsBenchRow => rows.find((r) => r.setting === s)!;
    expect(row("cap 4").levels).toBe(row("cap 8").levels + 1);
    expect(row("cap 16").overlaps).toBeLessThanOrEqual(row("cap 8").overlaps);
    for (const r of rows) expect([r.faults.through, r.faults.outside, r.faults.backtrack, r.levelFaults.through, r.levelFaults.outside]).toEqual([0, 0, 0, 0, 0]);
  });

  it("the grouping rules on case-many-groups: the rule keys gives one item for each group of cards at the far view", () => {
    const key = (n: Node): string => n.id.slice(0, n.id.lastIndexOf("-"));
    const rows = sweepSections("case-many-groups", board("case-many-groups"), groupSettings(undefined, { keys: { key } }));
    const row = (s: string): SectionsBenchRow => rows.find((r) => r.setting === s)!;
    expect({ ...row("group quadtree"), setting: "", ms: 0 }).toEqual({ ...row("defaults"), setting: "", ms: 0 });
    expect(row("group keys").farItems).toBe(32);
    expect(row("group keys").levelFaults.backtrack).toBeLessThanOrEqual(row("defaults").levelFaults.backtrack);
    for (const r of rows) expect(hard(r)).toEqual([0, 0, 0, 0, 0]);
  });
});
