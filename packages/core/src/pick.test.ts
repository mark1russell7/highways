import { describe, expect, it } from "vitest";
import { PICK, pickLevel } from "./pick.ts";

describe("pickLevel (the far-view thresholds)", () => {
  const sizes = [800, 400, 200, 100, 40];

  it("picks the routes, a level, or the root level with the default thresholds", () => {
    expect(pickLevel(sizes, 1)).toBe(5);
    expect(pickLevel(sizes, 0.5)).toBe(1);
    expect(pickLevel(sizes, 0.01)).toBe(0);
    expect(pickLevel([], 1)).toBe(0);
  });

  it("takes each threshold that a consumer gives, and the default for the other", () => {
    expect(pickLevel(sizes, 0.5, { itemAt: 84 })).toBe(2);
    expect(pickLevel(sizes, 0.5, { routesAt: 20 })).toBe(5);
    expect(pickLevel(sizes, 0.5, {})).toBe(pickLevel(sizes, 0.5, PICK));
  });
});
