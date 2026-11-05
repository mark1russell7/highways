import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import type { Graph } from "../../model.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { box, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { follow } from "../follow.ts";
import { checkPlan } from "../model.ts";
import { CURRENT_DEFAULTS, currentOf, currentPlan, directionClass, partsOf, solveSheet, type Sheet } from "./index.ts";

/** Three edges from the left to the right, and a tall wall between them. Each way goes past one end of the wall. */
const blocked: Graph = {
  nodes: [
    ...[0, 1, 2].flatMap((i) => [
      { id: `l${i}`, box: box(0, 30 * i) },
      { id: `r${i}`, box: box(600, 30 * i) },
    ]),
    { id: "wall", box: box(280, -80, 40, 240) },
  ],
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `l${i}` }, target: { node: `r${i}` } })),
};

describe("the highway strategy currents (RULE-051)", () => {
  it("gives a current from the source to the target of a free sheet", () => {
    const sheet: Sheet = { x0: 0, y0: 0, size: 1, w: 9, h: 3, free: new Uint8Array(27).fill(1) };
    const b = new Float64Array(27);
    b[9 + 1] = 1;
    b[9 + 7] = -1;
    const J = currentOf(sheet, solveSheet(sheet, b));
    // The middle cell of the middle row: the current goes in the direction +x.
    expect(J[2 * (9 + 4)]!).toBeGreaterThan(0);
    expect(Math.abs(J[2 * (9 + 4) + 1]!)).toBeLessThan(1e-6);
  });

  it("gives the parts of a sheet that a wall cuts", () => {
    const free = new Uint8Array(9).fill(1);
    free[1] = free[4] = free[7] = 0;
    const part = partsOf({ x0: 0, y0: 0, size: 1, w: 3, h: 3, free });
    expect(part[0]).toBe(part[6]);
    expect(part[0]).not.toBe(part[2]);
    expect(part[1]).toBe(-1);
  });

  it("gives the direction class of a vector by its pseudo-angle", () => {
    const o = { x: 0, y: 0 };
    expect(directionClass(o, { x: 1, y: 0 }, 4)).toBe(0);
    expect(directionClass(o, { x: 0, y: 1 }, 4)).toBe(1);
    expect(directionClass(o, { x: -1, y: 0 }, 4)).toBe(2);
    expect(directionClass(o, { x: 0, y: -1 }, 4)).toBe(3);
    expect(directionClass(o, { x: 0, y: -1 }, 1)).toBe(0);
  });

  it("bundles the three edges of one direction past the wall", () => {
    const plan = currentPlan({ graph: blocked }, CURRENT_DEFAULTS);
    expect(checkPlan(blocked, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    expect(checkProperties(blocked, follow(blocked, plan), 1_000_000)).toEqual([]);
  });

  it("makes no highway for edges with a straight line of sight", () => {
    expect(currentPlan({ graph: parallel }, CURRENT_DEFAULTS).highways).toEqual([]);
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(highwayStrategies.currents, CURRENT_DEFAULTS)).toEqual([]);
  });

  commonTests("currents", CURRENT_DEFAULTS, currentPlan, [flows, blocked]);
});
