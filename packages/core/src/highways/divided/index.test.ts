import { describe, expect, it } from "vitest";
import { WayFinder } from "../../ways.ts";
import { box, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import type { Highway, HighwayMember } from "../model.ts";
import { DIVIDED_DEFAULTS, divideHighway, dividedPlan, offsetLine } from "./index.ts";

/** This function gives a member of a highway on the spine from `(100, 0)` to `(500, 0)`. */
const member = (edge: string, on: number, off: number): HighwayMember => ({ edge, on, off, merge: { x: on ? 500 : 100, y: 0 }, split: { x: off ? 500 : 100, y: 0 }, seq: 0 });

/** A highway with two edges in each direction. */
const twoWay: Highway = {
  id: "h0",
  key: "k",
  spine: [
    { x: 100, y: 0 },
    { x: 500, y: 0 },
  ],
  lanes: ["a", "b", "c", "d"],
  members: [member("a", 0, 1), member("b", 0, 1), member("c", 1, 0), member("d", 1, 0)],
};

describe("the highway strategy divided (HWY-011)", () => {
  it("gives an offset line on the right with a positive offset, with the y axis down", () => {
    const line = offsetLine(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      2,
    );
    expect(line[0]!.x).toBeCloseTo(0, 9);
    expect(line[0]!.y).toBeCloseTo(2, 9);
    expect(line[1]!.x).toBeCloseTo(8, 9);
    expect(line[1]!.y).toBeCloseTo(2, 9);
    expect(line[2]!.x).toBeCloseTo(8, 9);
  });

  it("divides a highway of two-way traffic into two carriageways, one for each direction", () => {
    const finder = new WayFinder([{ id: "n", box: box(0, 300) }]);
    const parts = divideHighway(twoWay, finder, DIVIDED_DEFAULTS)!;
    expect(parts.map((h) => h.lanes)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    // Two lanes of width 4 and half a gap of one lane: 4 (2 / 2 + 1 / 2) = 6. The traffic keeps to the right, and the y axis points down.
    expect(parts[0]!.spine.map((p) => p.y)).toEqual([6, 6]);
    expect(parts[1]!.spine.map((p) => p.y)).toEqual([-6, -6]);
    expect(parts[0]!.members[0]!.merge).toEqual({ x: 100, y: 6 });
    const left = divideHighway(twoWay, finder, { ...DIVIDED_DEFAULTS, rule: "left" })!;
    expect(left[0]!.spine[0]!.y).toBe(-6);
    expect(divideHighway(twoWay, finder, { ...DIVIDED_DEFAULTS, minSize: 3 })).toBeUndefined();
  });

  it("keeps a highway whole when a box blocks each offset", () => {
    const finder = new WayFinder([{ id: "n", box: { x: 200, y: 1, w: 100, h: 20 } }]);
    const parts = divideHighway(twoWay, finder, DIVIDED_DEFAULTS);
    expect(parts).toBeUndefined();
  });

  commonTests("divided", DIVIDED_DEFAULTS, dividedPlan, [flows, parallel]);
});
