import { describe, expect, it } from "vitest";
import type { Point } from "../../geom.ts";
import { dropCauses } from "./drop-causes.ts";

/** This function gives a route from two pairs of numbers. */
const leg = (x0: number, y0: number, x1: number, y1: number): readonly Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y1 },
];

/** Two routes that do not cross, one above the other. */
const FIRST = [leg(0, 0, 10, 0), leg(0, 5, 10, 5)];

describe("the causes of a dropped board", () => {
  it("names the pair of moved routes that neither route alone clears", () => {
    // Each moved route still crosses the first shape of the other route, so neither revert removes the crossing.
    const final = [leg(0, -1, 10, 6), leg(0, 6, 10, -1)];
    const causes = dropCauses(FIRST, final, false, { first: 0, afterPass: 1, final: 1 });
    expect(causes).toMatchObject({ pair: true, fix: false, cap: false, counts: false, outside: false, boardRise: 1, routeRise: 1 });
  });

  it("does not name a pair when one revert clears the crossing, and names the fix when a route ends worse", () => {
    const final = [FIRST[0]!, leg(0, 5, 10, -5)];
    const causes = dropCauses(FIRST, final, false, { first: 0, afterPass: 1, final: 1 });
    expect(causes).toMatchObject({ pair: false, fix: true, outside: false });
  });

  it("names a fall that two moved routes share, when each route also rises with a fixed route", () => {
    // Routes 0 and 1 cross once at first and not at the end. Each moved route crosses the first shape of the other one, and one fixed route.
    const first = [leg(0, 0, 10, 0), leg(5, -5, 5, 5), leg(4.5, 0.5, 4.5, 2), leg(7, 3, 9, 3)];
    const final = [leg(4, 1, 6, 1), leg(8, -5, 8, 5), first[2]!, first[3]!];
    const causes = dropCauses(first, final, false, { first: 1, afterPass: 2, final: 2 });
    expect(causes).toMatchObject({ pair: false, fix: false, shared: true, outside: false, routeRise: 1 });
  });

  it("names the fix of hard rules when it raised the count", () => {
    expect(dropCauses(FIRST, FIRST, false, { first: 1, afterPass: 1, final: 2 }).fix).toBe(true);
  });

  it("names the cap of rounds", () => {
    expect(dropCauses(FIRST, FIRST, true, { first: 1, afterPass: 2, final: 2 }).cap).toBe(true);
  });

  it("names a difference of the two counts when only the board count rose", () => {
    const causes = dropCauses(FIRST, FIRST, false, { first: 1, afterPass: 2, final: 2 });
    expect(causes).toMatchObject({ counts: true, boardRise: 1, routeRise: 0 });
  });
});
