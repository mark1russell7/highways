import { describe, expect, it } from "vitest";
import type { Graph, Node } from "../../../model.ts";
import { STRATEGIES } from "../../../strategies/builtins.ts";
import { getStrategy } from "../../../strategies/model.ts";
import { CORRIDOR_DEFAULTS } from "../../corridors/index.ts";
import { memberAt, previousOf, type Highway, type HighwayInput, type HighwayPlan } from "../../model.ts";
import { gapWidth, SPLIT_HYSTERESIS_DEFAULTS, splitHysteresisPlan, splitLinkId } from "./index.ts";

const box = (id: string, x: number, y: number, parent?: string): Node => ({ id, box: { x, y, w: 20, h: 20 }, ...(parent ? { parent } : {}) });
const edge = (id: string, source: string, target: string) => ({ id, source: { node: source }, target: { node: target } });

// Three edges from the left to the right. The edges a and b run near the spine. The edge c runs far below it, so the spine is a long detour for c.
const nodes: Node[] = [box("s1", 0, 0), box("t1", 300, 0), box("s2", 0, 30), box("t2", 300, 30), box("s3", 0, 400), box("t3", 300, 400)];
const graph: Graph = { nodes, edges: [edge("a", "s1", "t1"), edge("b", "s2", "t2"), edge("c", "s3", "t3")] };
const spine = [
  { x: 40, y: 25 },
  { x: 260, y: 25 },
];
const highway = (id: string, edges: readonly string[]): Highway => ({ id, key: id, spine, lanes: [...edges], members: edges.map((e) => memberAt(spine, e, 0, 1)) });
const plan: HighwayPlan = { highways: [highway("h0", ["a", "b", "c"])] };
const members = (p: HighwayPlan): string[] => p.highways.flatMap((h) => h.members.map((m) => m.edge)).sort();
const o = SPLIT_HYSTERESIS_DEFAULTS;

/** This function runs the gate on a sequence of graphs and plans. Each run gets the run before as `previous`. */
function runs(steps: readonly { graph: Graph; plan: HighwayPlan }[]): HighwayPlan[] {
  const out: HighwayPlan[] = [];
  let previous: HighwayInput["previous"];
  for (const s of steps) {
    const p = splitHysteresisPlan({ graph: s.graph, ...(previous ? { previous } : {}) }, s.plan, o);
    out.push(p);
    previous = previousOf(s.graph, p);
  }
  return out;
}

describe("the gate split-hysteresis (SPLIT-HYSTERESIS)", () => {
  it("keeps each edge at the first run, and gives the memory of the run in the plan", () => {
    const p = splitHysteresisPlan({ graph }, plan, o);
    expect(members(p)).toEqual(["a", "b", "c"]);
    expect(p.splits?.evaluations).toBe(1);
    expect(p.splits?.pressed.map(([id]) => id)).toEqual([splitLinkId("h0", "c")]);
  });

  it("takes the edge with a long detour out after `pressEvaluations` runs, and keeps it out while the demand stays", () => {
    const out = runs(Array.from({ length: 6 }, () => ({ graph, plan })));
    expect(out.map(members)).toEqual([["a", "b", "c"], ["a", "b"], ["a", "b"], ["a", "b"], ["a", "b"], ["a", "b"]]);
    expect(out[1]!.splits?.split.map(([id, r]) => [id, r.reason])).toEqual([[splitLinkId("h0", "c"), "unclosed"]]);
  });

  it("puts the edge on the highway again after `mergeEvaluations` calm runs with a lower demand", () => {
    // After the split, a second highway goes away. Thus the demand drops, and the gap of h0 has no box near it.
    const more: HighwayPlan = { highways: [...plan.highways, highway("h1", ["a", "b"])] };
    const wide = graph;
    const out = runs([
      { graph: wide, plan: more },
      { graph: wide, plan: more },
      { graph: wide, plan },
      { graph: wide, plan },
      { graph: wide, plan },
    ]);
    expect(out.map((p) => members(p).includes("c"))).toEqual([true, false, false, false, true]);
  });

  it("forgets the links of a deleted edge", () => {
    const out = runs([
      { graph, plan },
      { graph, plan },
    ]);
    expect(out[1]!.splits?.split.length).toBe(1);
    const less: Graph = { nodes, edges: graph.edges.filter((e) => e.id !== "c") };
    const p = splitHysteresisPlan({ graph: less, previous: previousOf(graph, out[1]!) }, { highways: [highway("h0", ["a", "b"])] }, o);
    expect(p.splits?.split).toEqual([]);
    expect(members(p)).toEqual(["a", "b"]);
  });

  it("takes a forced edge out at its first run: an edge between two frames", () => {
    const framed: Graph = {
      nodes: [box("f1", -100, -100), box("f2", 400, -100), ...nodes.map((n) => (n.id === "s1" ? { ...n, parent: "f1" } : n.id === "t1" ? { ...n, parent: "f2" } : n))],
      edges: graph.edges,
    };
    const p = splitHysteresisPlan({ graph: framed }, plan, o);
    expect(members(p)).toEqual(["b", "c"]);
    expect(p.splits?.split.map(([, r]) => r.reason)).toEqual(["forced"]);
  });

  it("gives the same plan from a memory that went through JSON", () => {
    const [first] = runs([{ graph, plan }]);
    const json = JSON.parse(JSON.stringify(previousOf(graph, first!))) as NonNullable<HighwayInput["previous"]>;
    const a = splitHysteresisPlan({ graph, previous: previousOf(graph, first!) }, plan, o);
    const b = splitHysteresisPlan({ graph, previous: json }, plan, o);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("measures the gap of a spine to the nearest box that is not an end of a member", () => {
    expect(gapWidth(graph, plan.highways[0]!)).toBe(Infinity);
    const near: Graph = { ...graph, nodes: [...nodes, box("x", 140, 35)] };
    expect(gapWidth(near, plan.highways[0]!)).toBeCloseTo(20);
  });

  it("is in the registry as `corridors+split-hysteresis`", () => {
    const s = getStrategy(STRATEGIES, "highway", "corridors+split-hysteresis");
    expect(s.defaults).toEqual({ ...CORRIDOR_DEFAULTS, ...SPLIT_HYSTERESIS_DEFAULTS });
  });
});
