import { describe, expect, it } from "vitest";
import { WayFinder } from "../../ways.ts";
import { commonTests, flows, rows } from "../fixtures.test-util.ts";
import { freeLines, streetRide } from "../free-lines.ts";
import { checkPlan } from "../model.ts";
import { GAP_DEFAULTS, gapPlan } from "./index.ts";

describe("the highway strategy gaps (HWY-057)", () => {
  it("gives the free middle lines of the gaps as streets, clear of the boxes", () => {
    const finder = new WayFinder(rows.nodes);
    const lines = freeLines(rows, finder, "room");
    expect(lines.some((l) => l.a.y === 40 && l.b.y === 40)).toBe(true);
    for (const l of lines) {
      expect(l.a.x === l.b.x || l.a.y === l.b.y).toBe(true);
      expect(finder.obstacles.clear(l.a, l.b, finder.margin / 2)).toBe(true);
    }
    expect(freeLines(rows, finder, "corners").length).toBeGreaterThan(lines.length);
  });

  it("gives the ride of an edge on a street from the nearest points", () => {
    const ride = streetRide({ a: { x: 0, y: 40 }, b: { x: 600, y: 40 } }, { edge: "e", s: { x: 50, y: 10 }, t: { x: 550, y: 70 }, base: 500 });
    expect(ride.on).toEqual({ x: 50, y: 40 });
    expect(ride.off).toEqual({ x: 550, y: 40 });
    expect(ride.ride).toBe(500);
    expect(ride.ramps).toBe(60);
  });

  it("gives straight axis-parallel spines on the gaps", () => {
    const plan = gapPlan({ graph: rows }, { ...GAP_DEFAULTS, minSize: 2 });
    expect(checkPlan(rows, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    for (const h of plan.highways) {
      expect(h.spine.length).toBe(2);
      expect(h.spine[0]!.x === h.spine[1]!.x || h.spine[0]!.y === h.spine[1]!.y).toBe(true);
    }
    expect(gapPlan({ graph: rows }, { ...GAP_DEFAULTS, minSize: 4 }).highways).toEqual([]);
  });

  commonTests("gaps", GAP_DEFAULTS, gapPlan, [flows, rows]);
});
