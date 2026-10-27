import { describe, expect, it } from "vitest";
import type { Box } from "../geom.ts";
import type { Graph } from "../model.ts";
import { GROUP_SPINES, groupedPlan, weberPoint } from "./grouped.ts";
import { checkPlan } from "./model.ts";
import { sharedStretches } from "./stretches.ts";

const p = (x: number, y: number) => ({ x, y });
const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });

// Three edges that run parallel, 30 apart.
const three: Graph = {
  nodes: [0, 1, 2].flatMap((i) => [
    { id: `s${i}`, box: box(0, 30 * i) },
    { id: `t${i}`, box: box(400, 30 * i) },
  ]),
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `s${i}` }, target: { node: `t${i}` } })),
};

describe("the shared stretches of keyed ways, and the plans of groups of edges", () => {
  it("gives one highway for the stretch that two ways of one key share", () => {
    const plan = sharedStretches(
      [
        { edge: "a", key: "k", points: [p(0, 0), p(10, 0), p(20, 0), p(30, 0)] },
        { edge: "b", key: "k", points: [p(0, 10), p(10, 0), p(20, 0), p(30, 10)] },
        { edge: "c", key: "other", points: [p(0, 20), p(10, 0), p(20, 0), p(30, 20)] },
      ],
      { minSize: 2 },
    );
    expect(plan.highways).toHaveLength(1);
    const h = plan.highways[0]!;
    expect(h.spine).toEqual([p(10, 0), p(20, 0)]);
    expect([...h.lanes].sort()).toEqual(["a", "b"]);
    expect(sharedStretches([{ edge: "a", key: "k", points: [p(0, 0), p(10, 0)] }], { minSize: 2 }).highways).toEqual([]);
  });

  it("gives the Weber point of a set of points", () => {
    const w = weberPoint([p(0, 0), p(10, 0), p(0, 10), p(10, 10)]);
    expect(w.x).toBeCloseTo(5, 3);
    expect(w.y).toBeCloseTo(5, 3);
  });

  it("gives a correct plan for one group with each spine, and none for a small group", () => {
    const groups = new Map(three.edges.map((e) => [e.id, { key: "g", flip: false }]));
    for (const spine of GROUP_SPINES) {
      const plan = groupedPlan({ graph: three }, groups, { spine, minSize: 2 });
      expect(checkPlan(three, plan), spine).toEqual([]);
      expect(groupedPlan({ graph: three }, groups, { spine, minSize: 4 }).highways, spine).toEqual([]);
    }
    expect(groupedPlan({ graph: three }, groups, { spine: "trunk", minSize: 2 }).highways).toHaveLength(1);
  });
});
