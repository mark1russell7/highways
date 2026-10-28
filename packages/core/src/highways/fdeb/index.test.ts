import { describe, expect, it } from "vitest";
import { WayFinder } from "../../ways.ts";
import { clustered, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { FDEB_DEFAULTS, fdebLines, fdebPlan } from "./index.ts";

describe("the highway strategy fdeb (HWY-002 with RULE-002)", () => {
  it("pulls the parallel edges together, and keeps the points out of the boxes", () => {
    const lines = fdebLines({ graph: parallel }, new WayFinder(parallel.nodes), FDEB_DEFAULTS);
    const mid = [...lines.values()].map((l) => l[Math.floor(l.length / 2)]!.y);
    expect(Math.max(...mid) - Math.min(...mid)).toBeLessThan(16);
    const finder = new WayFinder(clustered.nodes);
    for (const l of fdebLines({ graph: clustered }, finder, FDEB_DEFAULTS).values())
      for (const p of l.slice(1, -1)) expect(finder.obstacles.inside(p, 0)).toBe(false);
  });

  it("gives at least one highway on the parallel edges", () => {
    expect(fdebPlan({ graph: parallel }, FDEB_DEFAULTS).highways.length).toBeGreaterThan(0);
  });

  commonTests("fdeb", FDEB_DEFAULTS, fdebPlan, [flows, parallel]);
});
