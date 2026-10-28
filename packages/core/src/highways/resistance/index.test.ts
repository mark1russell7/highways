import { describe, expect, it } from "vitest";
import type { Graph } from "../../model.ts";
import { box, commonTests, flows } from "../fixtures.test-util.ts";
import { spectralClusters } from "../spectral/index.ts";
import { edgeResistance, RESISTANCE_DEFAULTS, resistanceClusters, resistancePlan } from "./index.ts";

const graph = (nodes: number, edges: readonly (readonly [number, number])[]): Graph => ({
  nodes: Array.from({ length: nodes }, (_, i) => ({ id: `n${i}`, box: box(100 * i, 0) })),
  edges: edges.map(([s, t], i) => ({ id: `e${i}`, source: { node: `n${s}` }, target: { node: `n${t}` } })),
});

describe("the highway strategy resistance (HWY-021)", () => {
  it("gives the resistance 1 to each edge of a tree, and 0 to a loop", () => {
    const r = edgeResistance(graph(4, [[0, 1], [1, 2], [1, 3], [2, 2]]), 8);
    for (const id of ["e0", "e1", "e2"]) expect(r.get(id)).toBeCloseTo(1, 6);
    expect(r.get("e3")).toBe(0);
  });

  it("gives about 2/3 to each edge of a triangle, and about 1/2 to each of two parallel edges", () => {
    const tri = edgeResistance(graph(3, [[0, 1], [1, 2], [2, 0]]), 4000);
    for (const id of ["e0", "e1", "e2"]) expect(Math.abs(tri.get(id)! - 2 / 3)).toBeLessThan(0.1);
    const two = edgeResistance(graph(2, [[0, 1], [0, 1]]), 4000);
    for (const id of ["e0", "e1"]) expect(Math.abs(two.get(id)! - 1 / 2)).toBeLessThan(0.1);
  });

  it("gives the clusters of spectral with the weight 0, and puts the edges between two areas into one cluster", () => {
    const groups = resistanceClusters({ graph: flows }, RESISTANCE_DEFAULTS);
    expect(groups.get("b")!.key).toBe(groups.get("a")!.key);
    expect(groups.get("c")!.key).toBe(groups.get("a")!.key);
    expect(groups.get("x")?.key).not.toBe(groups.get("a")!.key);
    expect(resistanceClusters({ graph: flows }, { ...RESISTANCE_DEFAULTS, weight: 0 })).toEqual(spectralClusters({ graph: flows }, RESISTANCE_DEFAULTS));
  });

  it("gives no pair to a bridge with sparsify", () => {
    expect(resistanceClusters({ graph: flows }, { ...RESISTANCE_DEFAULTS, sparsify: true }).size).toBe(0);
  });

  commonTests("resistance", RESISTANCE_DEFAULTS, resistancePlan, [flows]);
});
