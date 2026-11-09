import { random } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import type { Level } from "./model.ts";
import { itemSizes, PICK, pickLevel, pickLevelOf } from "./pick.ts";

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

/** A level of made-up items, each with the width and the height of a pair of `boxes`. */
const level = (depth: number, boxes: readonly (readonly [number, number])[]): Level => ({
  depth,
  items: boxes.map(([w, h], i) => ({ id: `${depth}.${i}`, box: { x: 0, y: 0, w, h }, nodes: [`n${depth}.${i}`] })),
  links: [],
});

/**
 * The rule with one threshold, as a consumer writes it. It gives the finest level with a median short side of `minPx` or more on the screen.
 * The search from fine to coarse stops at a level with 1 item. When no level passes, the pick is the coarsest level with 2 items or more.
 */
function oneThreshold(levels: readonly Level[], scale: number, minPx: number): number {
  const n = levels.length;
  if (n === 0) return 0;
  const typical = (l: Level): number => {
    const sides = l.items.map((i) => Math.min(i.box.w, i.box.h)).sort((a, b) => a - b);
    return sides.length ? sides[Math.floor(sides.length / 2)]! : 0;
  };
  if (typical(levels[n - 1]!) * scale >= minPx) return n;
  for (let i = n - 2; i >= 0; i--) {
    if (levels[i]!.items.length < 2) break;
    if (typical(levels[i]!) * scale >= minPx) return i;
  }
  for (let i = 0; i < n - 1; i++) if (levels[i]!.items.length >= 2) return i;
  return n;
}

describe("itemSizes and pickLevelOf (the side and the least count of items)", () => {
  const levels = [
    level(0, [[800, 200], [600, 300], [700, 100]]),
    level(1, [[400, 100], [300, 200], [350, 50], [380, 90]]),
    level(2, [[40, 20], [30, 10], [50, 25]]),
  ];

  it("measures the long side by default, and the short side on request", () => {
    expect(itemSizes(levels)).toEqual([700, 380, 40]);
    expect(itemSizes(levels, "short")).toEqual([200, 100, 20]);
  });

  it("gives pickLevel of the long sides without side and minItems", () => {
    for (const scale of [0.01, 0.1, 0.3, 0.5, 1, 2]) expect(pickLevelOf(levels, scale)).toBe(pickLevel(itemSizes(levels), scale));
    expect(pickLevelOf(levels, 0.5, { itemAt: 84 })).toBe(pickLevel(itemSizes(levels), 0.5, { itemAt: 84 }));
  });

  it("stops at a level with fewer items than minItems, and falls back to the coarsest level with enough items", () => {
    const thin = [level(0, [[900, 900]]), level(1, [[400, 400], [300, 300]]), level(2, [[50, 50]]), level(3, [[10, 10], [12, 12]])];
    const rule = { side: "short", routesAt: 80, itemAt: 80, minItems: 2 } as const;
    expect(pickLevelOf(thin, 10, rule)).toBe(4);
    // Level 2 has 1 item, so the search stops there, and the fallback gives level 1.
    expect(pickLevelOf(thin, 1, rule)).toBe(1);
    expect(pickLevelOf([level(0, [[5, 5]]), level(1, [[1, 1]])], 1, rule)).toBe(2);
    expect(pickLevelOf([], 1, rule)).toBe(0);
  });

  it("gives the rule with one threshold for one value of both thresholds, the short side and a minItems of 2 (property)", () => {
    const rng = random(11);
    const int = (lo: number, hi: number): number => lo + Math.floor(rng.next() * (hi - lo + 1));
    for (let t = 0; t < 400; t++) {
      const n = int(1, 5);
      const ls = Array.from({ length: n }, (_, d) => level(d, Array.from({ length: int(1, 6) }, () => [int(1, 900), int(1, 900)] as const)));
      const minPx = int(10, 200);
      const scale = rng.next() * 2;
      expect(pickLevelOf(ls, scale, { side: "short", routesAt: minPx, itemAt: minPx, minItems: 2 }), `case ${t}`).toBe(oneThreshold(ls, scale, minPx));
    }
  });
});
