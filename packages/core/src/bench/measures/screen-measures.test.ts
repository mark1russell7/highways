import { describe, expect, it } from "vitest";
import type { Point } from "../../geom.ts";
import type { Graph, Level, LevelItem, Node } from "../../model.ts";
import { checkLevels } from "../properties.ts";
import { measureByKey } from "../screen/measures.ts";
import { curvatureVariation, curveDeviation } from "./curves.ts";
import { groupFill, itemOverlaps, silhouette } from "./groups.ts";
import { levelRatio } from "./levels.ts";
import { boxDisplacement, distanceDistortion, roomOrderFaults } from "./room.ts";
import { routeSymmetry } from "./symmetry.ts";

/** A box of the size `w` by `h` at the corner `(x, y)`. */
const node = (id: string, x: number, y: number, w = 1, h = 1): Node => ({ id, box: { x, y, w, h } });
/** A box of the size 1 by 1 with its center at `(x, y)`. */
const at = (id: string, x: number, y: number): Node => node(id, x - 0.5, y - 0.5);
const item = (id: string, nodes: readonly string[], x = 0, y = 0, w = 1, h = 1): LevelItem => ({ id, nodes, box: { x, y, w, h } });
const level = (depth: number, items: readonly LevelItem[]): Level => ({ depth, items, links: [] });
/** A level with `n` items of one node each. */
const many = (depth: number, n: number): Level => level(depth, Array.from({ length: n }, (_, i) => item(`d${depth}i${i}`, [`n${i}`])));
const edge = (id: string, s: string, t: string) => ({ id, source: { node: s }, target: { node: t } });

describe("C4: the curvature variation", () => {
  it("gives 0 for a straight line and for an arc of a circle", () => {
    expect(curvatureVariation([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }])).toBe(0);
    const arc = Array.from({ length: 41 }, (_, i) => ({ x: 10 * Math.cos(i * 0.02), y: 10 * Math.sin(i * 0.02) }));
    expect(curvatureVariation(arc)).toBeLessThan(1e-6);
  });

  it("gives c^2 L^4 for a clothoid of length L whose curvature grows as c s", () => {
    // The clothoid of length 10 with the curvature 0.02 s. Then V = 0.02^2 · 10^4 = 4.
    const c = 0.02;
    const points: Point[] = [{ x: 0, y: 0 }];
    let [x, y] = [0, 0];
    for (let k = 1; k <= 1000; k++) {
      const s = (k - 0.5) * 0.01;
      x += Math.cos((c * s * s) / 2) * 0.01;
      y += Math.sin((c * s * s) / 2) * 0.01;
      if (k % 10 === 0) points.push({ x, y });
    }
    expect(Math.abs(curvatureVariation(points) - 4) / 4).toBeLessThan(0.05);
  });
});

describe("C8: the deviation of a curve from its route", () => {
  it("gives 0 for the same line, and the offset for a parallel line", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(curveDeviation(route, route, 0.25)).toBe(0);
    expect(
      curveDeviation(
        [
          { x: 0, y: 1 },
          { x: 10, y: 1 },
        ],
        route,
        0.25,
      ),
    ).toBeCloseTo(1, 9);
  });

  it("gives the distance from the corner to the diagonal for a cut corner", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const diagonal = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(Math.abs(curveDeviation(diagonal, route, 0.05) - Math.SQRT2 * 5)).toBeLessThan(0.1);
  });
});

describe("G4, G5 and G7: the shape of the groups", () => {
  it("gives the share of the box of a group that its nodes fill (G4)", () => {
    const graph: Graph = { nodes: [node("a", 0, 0, 5, 5), node("b", 5, 5, 5, 5), node("c", 20, 0)], edges: [] };
    // The item of `c` alone does not count.
    expect(groupFill(graph, level(0, [item("g", ["a", "b"], 0, 0, 10, 10), item("h", ["c"], 20, 0)]))).toBe(0.5);
    expect(groupFill(graph, level(0, [item("h", ["c"], 20, 0)]))).toBeUndefined();
  });

  it("counts the pairs of items of one level whose boxes overlap (G5)", () => {
    const near = level(0, [item("p", [], 0, 0, 10, 10), item("q", [], 5, 5, 10, 10)]);
    const far = level(1, [item("r", [], 0, 0, 10, 10), item("s", [], 20, 0, 10, 10)]);
    expect(itemOverlaps([near, far])).toBe(1);
    expect(itemOverlaps([far])).toBe(0);
  });

  it("gives the mean silhouette of the nodes of two groups (G7)", () => {
    const graph: Graph = { nodes: [at("a", 0, 0), at("b", 1, 0), at("c", 10, 0), at("d", 11, 0)], edges: [] };
    const two = level(0, [item("g", ["a", "b"]), item("h", ["c", "d"])]);
    // a: (10.5 - 1) / 10.5. b: (9.5 - 1) / 9.5. c and d are the same by the mirror.
    expect(silhouette(graph, two)).toBeCloseTo((9.5 / 10.5 + 8.5 / 9.5) / 2, 9);
    expect(silhouette(graph, level(0, [item("g", ["a", "b", "c", "d"])]))).toBeUndefined();
  });
});

describe("Z1 and Z5: the counts of the levels", () => {
  it("counts a level whose items miss a node as one fault of `counts-sum` (Z1)", () => {
    const graph: Graph = { nodes: [node("a", 0, 0), node("b", 5, 0)], edges: [] };
    const faults = checkLevels(graph, [level(0, [item("g", ["a"])])]).filter((v) => v.rule === "counts-sum");
    expect(faults.length).toBe(1);
    expect(measureByKey("Z1.countsSum")?.id).toBe("Z1");
  });

  it("gives the largest ratio of the item counts and the spread of their logs (Z5)", () => {
    expect(levelRatio([many(0, 2), many(1, 8), many(2, 32)])).toEqual({ max: 4, spread: 0 });
    const r = levelRatio([many(2, 16), many(0, 2), many(1, 4)])!;
    expect(r.max).toBe(4);
    expect(r.spread).toBeCloseTo(Math.log(2) / 2, 9);
    expect(levelRatio([many(0, 3)])).toBeUndefined();
  });
});

describe("M2, M3 and M5: the boxes that a room strategy moves", () => {
  const before = [node("a", 0, 0), node("b", 5, 0)];

  it("counts a pair of boxes whose order changes (M2)", () => {
    expect(roomOrderFaults(before, before)).toBe(0);
    expect(roomOrderFaults(before, [node("a", 5, 0), node("b", 0, 0)])).toBe(1);
  });

  it("gives the mean move of the centers in units of the board (M3)", () => {
    expect(boxDisplacement(before, before, 1)).toBe(0);
    expect(boxDisplacement(before, [node("a", 3, 4), node("b", 5, 0)], 1)).toBe(2.5);
    expect(boxDisplacement(before, [node("a", 3, 4), node("b", 5, 0)], 2)).toBe(1.25);
  });

  it("gives 0 for a change of scale, and the stress of the best scale for another move (M5)", () => {
    const packed = [at("a", 0, 0), at("b", 10, 0), at("c", 0, 10)];
    expect(distanceDistortion(packed, [at("a", 0, 0), at("b", 20, 0), at("c", 0, 20)])).toBeCloseTo(0, 9);
    // The distances 10, 10 and 14.14 become 10, 20 and 22.36. The best scale is 0.616, and the stress is 0.2251.
    expect(distanceDistortion(packed, [at("a", 0, 0), at("b", 10, 0), at("c", 0, 20)])).toBeCloseTo(0.2251, 4);
  });
});

describe("H3: the symmetry of the routes", () => {
  const nodes = [node("A", 0, 0, 2, 2), node("B", 8, 0, 2, 2), node("C", 0, 8, 2, 2), node("D", 8, 8, 2, 2)];
  const p = (x: number, y: number): Point => ({ x, y });

  it("gives 1 when a mirror sends each route onto a route", () => {
    const graph: Graph = { nodes: nodes.slice(0, 2), edges: [edge("e", "A", "B")] };
    expect(routeSymmetry(graph, [{ edge: "e", points: [p(1, 1), p(5, 1), p(9, 1)] }])).toBe(1);
    expect(routeSymmetry(graph, [])).toBeUndefined();
  });

  it("gives the share of the best map when one route breaks the symmetry", () => {
    const graph: Graph = { nodes, edges: [edge("e1", "A", "B"), edge("e2", "C", "D"), edge("e3", "A", "C"), edge("e4", "B", "D")] };
    const routes = [
      { edge: "e1", points: [p(1, 1), p(9, 1)] },
      { edge: "e2", points: [p(1, 9), p(9, 9)] },
      { edge: "e3", points: [p(1, 1), p(1, 9)] },
      // This route goes out to the right, and comes back below its target. No map of the board keeps it.
      { edge: "e4", points: [p(9, 1), p(12, 1), p(12, 7), p(9, 7), p(9, 9)] },
    ];
    // The mirror on the horizontal axis keeps e1, e2 and e3. The mirror on the vertical axis and the half turn keep only e1 and e2.
    expect(routeSymmetry(graph, routes)).toBe(0.75);
  });
});
