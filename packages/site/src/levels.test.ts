import { describe, expect, it } from "vitest";
import { FIXTURES, makeFixture, ROUTERS } from "@highways/core";
import { itemSizes, pickLevel } from "./levels.ts";

describe("pickLevel", () => {
  const sizes = [800, 400, 200, 100, 40];
  const pick = (scale: number): number => pickLevel(sizes, scale, { routesAt: 22, itemAt: 84 });

  it("shows the routes when the nodes are large on the screen", () => {
    expect(pick(1)).toBe(5);
  });

  it("shows the finest level whose items are large enough", () => {
    expect(pick(0.5)).toBe(2);
    expect(pick(0.25)).toBe(1);
  });

  it("falls back to the root level", () => {
    expect(pick(0.01)).toBe(0);
    expect(pickLevel([], 1)).toBe(0);
  });
});

describe("itemSizes", () => {
  it("gives smaller items at deeper levels of the sections router", () => {
    const graph = makeFixture(FIXTURES.find((f) => f.name === "small-clustered")!);
    const router = ROUTERS.find((r) => r.name === "sections")!;
    const levels = router.route(graph).levels!;
    const sizes = itemSizes(levels);
    expect(sizes.length).toBe(levels.length);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeLessThanOrEqual(sizes[i - 1]!);
  });
});
