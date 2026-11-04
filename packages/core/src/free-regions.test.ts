import { describe, expect, it } from "vitest";
import { highwaysRegistry } from "./families/index.ts";
import { freeRegions } from "./free-regions.ts";
import type { Box, Point } from "./geom.ts";
import { Obstacles } from "./visibility.ts";
import { WayFinder } from "./ways.ts";

const nodesOf = (boxes: readonly Box[]) => boxes.map((box, i) => ({ id: `n${i}`, box }));

/** This function gives the pairs with a clear sight line and two different labels. A correct label gives no pair. */
function broken(boxes: readonly Box[], pad: number, points: readonly Point[]): string[] {
  const obstacles = new Obstacles(nodesOf(boxes), 180);
  const { labels } = freeRegions(boxes, pad, points, Number.MAX_SAFE_INTEGER)!;
  const out: string[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (labels[i] === 0 || labels[j] === 0 || labels[i] === labels[j]) continue;
      if (obstacles.clear(points[i]!, points[j]!, pad)) out.push(`${JSON.stringify(points[i])} ${JSON.stringify(points[j])}`);
    }
  }
  return out;
}

/** This function gives a small generator of whole numbers, so a failed board comes back with its seed. */
function draws(seed: number): (n: number) => number {
  let state = seed >>> 0;
  return (n) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 2 ** 32) * n);
  };
}

/** A ring of four boxes around the square from 10 to 20. The boxes overlap at the corners. */
const RING: readonly Box[] = [
  { x: 0, y: 0, w: 30, h: 10 },
  { x: 0, y: 20, w: 30, h: 10 },
  { x: 0, y: 0, w: 10, h: 30 },
  { x: 20, y: 0, w: 10, h: 30 },
];

describe("freeRegions (JOIN-COST)", () => {
  it("gives a closed region a label of its own", () => {
    const { labels } = freeRegions(RING, 0, [{ x: 15, y: 15 }, { x: 40, y: 15 }, { x: -5, y: -5 }], 1e6)!;
    expect(labels[0]).toBeGreaterThan(0);
    expect(labels[0]).not.toBe(labels[1]);
    expect(labels[1]).toBe(labels[2]);
  });

  it("gives 0 to a point inside a box", () => {
    expect(freeRegions(RING, 0, [{ x: 5, y: 15 }], 1e6)!.labels[0]).toBe(0);
  });

  it("keeps a seam open, because the sight test lets a segment pass along the side of a box", () => {
    const boxes: Box[] = [{ x: 0, y: 0, w: 30, h: 10 }, { x: 0, y: 10, w: 30, h: 10 }];
    expect(new Obstacles(nodesOf(boxes), 180).clear({ x: -5, y: 10 }, { x: 35, y: 10 }, 0)).toBe(true);
    // The two sides of a wall meet only through the seam, so their labels must be equal.
    const walled = [...boxes, { x: 30, y: -40, w: 10, h: 100 }, { x: -10, y: -40, w: 10, h: 100 }, { x: -10, y: 50, w: 50, h: 10 }];
    const { labels } = freeRegions(walled, 0, [{ x: 15, y: 30 }, { x: 15, y: -30 }], 1e6)!;
    expect(labels[0]).toBe(labels[1]);
  });

  it("does not let a thin box block, because the sight test forgives a short part of a segment", () => {
    const wall: Box = { x: 10, y: -100, w: 1e-7, h: 200 };
    expect(new Obstacles(nodesOf([wall]), 180).clear({ x: 0, y: 0 }, { x: 20, y: 0 }, 0)).toBe(true);
    expect(broken([wall], 0, [{ x: 0, y: 0 }, { x: 20, y: 0 }])).toEqual([]);
  });

  it("gives no labels past the limit, or for a box with no finite position", () => {
    expect(freeRegions(RING, 0, [], 1)).toBeUndefined();
    expect(freeRegions([{ x: Number.NaN, y: 0, w: 1, h: 1 }], 0, [], 1e6)).toBeUndefined();
    expect(freeRegions([{ x: Number.POSITIVE_INFINITY, y: 0, w: 1, h: 1 }], 0, [], 1e6)).toBeUndefined();
  });

  it("gives one region to an empty board", () => {
    const { labels, cells } = freeRegions([], 2, [{ x: 0, y: 0 }, { x: 9, y: 9 }], 1e6)!;
    expect([...labels]).toEqual([1, 1]);
    expect(cells).toBe(1);
  });

  it("gives two labels to no pair in sight, on boxes that touch, overlap and share corners", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const next = draws(seed);
      const boxes: Box[] = Array.from({ length: 4 + next(16) }, () => ({ x: next(10) * 5, y: next(10) * 5, w: (1 + next(4)) * 5, h: (1 + next(4)) * 5 }));
      const pad = [0, 1.25, 2.5][seed % 3]!;
      const points: Point[] = [];
      for (let x = -5; x <= 75; x += 5) {
        for (let y = -5; y <= 75; y += 5) points.push({ x: x + (seed % 2) * 2.5, y });
      }
      expect(broken(boxes, pad, points), `${seed}`).toEqual([]);
    }
  });

  it("gives two labels to no pair in sight, on the corners of a maze", () => {
    const reg = highwaysRegistry();
    for (const seed of [59, 181679]) {
      const { graph } = reg.generate("maze", seed);
      const ways = new WayFinder(graph.nodes);
      expect(broken(graph.nodes.map((n) => n.box), ways.margin / 2, ways.corners.points), `${seed}`).toEqual([]);
    }
  });
});
