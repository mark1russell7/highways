import { describe, expect, it } from "vitest";
import type { Graph } from "../../model.ts";
import { box, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { oneSteiner, spanningTree, STEINER_DEFAULTS, steinerPlan } from "./index.ts";

/** One node on the left with edges to four nodes on the right. */
const fan: Graph = {
  nodes: [{ id: "s", box: box(0, 150) }, ...[0, 1, 2, 3].map((i) => ({ id: `t${i}`, box: box(500, 100 * i) }))],
  edges: [0, 1, 2, 3].map((i) => ({ id: `e${i}`, source: { node: "s" }, target: { node: `t${i}` } })),
};

describe("the highway strategy steiner (HWY-036)", () => {
  it("gives the spanning tree and the Steiner point of a cross", () => {
    const cross = [
      { x: 0, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 0 },
      { x: 1, y: 2 },
    ];
    expect(spanningTree(cross, "rectilinear").cost).toBe(6);
    const tree = oneSteiner(cross, "rectilinear", () => true);
    expect(tree.points[4]).toEqual({ x: 1, y: 1 });
    expect(tree.links.length).toBe(4);
    // A Steiner point in a box is not a candidate.
    expect(oneSteiner(cross, "rectilinear", (p) => p.x !== 1 || p.y !== 1).points.length).toBe(4);
  });

  it("gives rectilinear highways for the edges of one source", () => {
    const plan = steinerPlan({ graph: fan }, STEINER_DEFAULTS);
    expect(checkPlan(fan, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    for (const h of plan.highways) for (let i = 1; i < h.spine.length; i++) expect(h.spine[i]!.x === h.spine[i - 1]!.x || h.spine[i]!.y === h.spine[i - 1]!.y).toBe(true);
  });

  it("gives correct plans with each group, method and metric", () => {
    for (const group of ["source", "key"] as const) {
      for (const method of ["one-steiner", "spanning"] as const) {
        for (const metric of ["rectilinear", "octilinear"] as const) {
          for (const graph of [fan, flows]) expect(checkPlan(graph, steinerPlan({ graph }, { ...STEINER_DEFAULTS, group, method, metric }))).toEqual([]);
        }
      }
    }
  });

  commonTests("steiner", STEINER_DEFAULTS, steinerPlan, [flows, fan]);
});
