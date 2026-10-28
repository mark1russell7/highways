import { describe, expect, it } from "vitest";
import type { Graph } from "../../model.ts";
import { box, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { EDGE_PATH_DEFAULTS, edgePathPlan, edgePaths } from "./index.ts";

// A long edge from `A` to `C`, and a path of two short edges through `B` near the line.
const triangle: Graph = {
  nodes: [
    { id: "A", box: box(0, 0) },
    { id: "B", box: box(300, 60) },
    { id: "C", box: box(600, 0) },
  ],
  edges: [
    { id: "ac", source: { node: "A" }, target: { node: "C" } },
    { id: "ab", source: { node: "A" }, target: { node: "B" } },
    { id: "cb", source: { node: "C" }, target: { node: "B" } },
  ],
};

describe("the highway strategy edge-paths (HWY-012)", () => {
  it("routes a long edge along a short path of other edges, and locks the edges of the path", () => {
    const paths = edgePaths({ graph: triangle }, EDGE_PATH_DEFAULTS);
    expect([...paths.keys()]).toEqual(["ac"]);
    expect(paths.get("ac")).toEqual([
      { edge: "ab", back: false },
      { edge: "cb", back: true },
    ]);
    expect(edgePaths({ graph: triangle }, { ...EDGE_PATH_DEFAULTS, distortion: 1 }).size).toBe(0);
  });

  it("gives a highway where the long edge rides the ways of its path", () => {
    const plan = edgePathPlan({ graph: triangle }, EDGE_PATH_DEFAULTS);
    expect(checkPlan(triangle, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    expect(plan.highways.every((h) => h.members.some((m) => m.edge === "ac"))).toBe(true);
  });

  commonTests("edge-paths", EDGE_PATH_DEFAULTS, edgePathPlan, [flows, triangle]);
});
