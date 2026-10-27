import { describe, expect, it } from "vitest";
import { defineStrategy } from "../../strategies/model.ts";
import type { Graph } from "../../model.ts";
import { memberAt, type Highway, type HighwayPlan } from "../model.ts";
import { commonEdges, gateStrategy, jaccard, keepMembers, matchHighways, type Gate } from "./model.ts";

const spine = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

/** This function gives a highway on a straight spine with the edges `edges`. */
function highway(id: string, edges: readonly string[]): Highway {
  return { id, key: id, spine, lanes: [...edges], members: edges.map((e, i) => memberAt(spine, e, 0, 100, i)) };
}

const edgesOf = (plan: HighwayPlan): string[][] => plan.highways.map((h) => h.members.map((m) => m.edge));

describe("gateStrategy", () => {
  const base = defineStrategy<"highway", { size: number }>({
    step: "highway",
    name: "base",
    describe: "A test plan.",
    defaults: { size: 2 },
    schema: { size: { type: "integer", min: 1, max: 9, step: 1, default: 2, describe: "The size." } },
    run: (_input, o) => ({ highways: [highway("h0", ["a", "b", "c"].slice(0, o.size + 1))] }),
  });
  const seen: object[] = [];
  const gate: Gate<{ cut: number }> = {
    name: "cut",
    describe: "A test gate.",
    defaults: { cut: 1 },
    schema: { cut: { type: "integer", min: 0, max: 3, step: 1, default: 1, describe: "The cut." } },
    apply: (_input, plan, o) => {
      seen.push(o);
      return { highways: plan.highways.map((h) => ({ ...h, id: `${h.id}-${o.cut}` })) };
    },
  };
  const graph: Graph = { nodes: [], edges: [] };

  it("names the strategy `<strategy>+<gate>` and joins the defaults and the schemas", () => {
    const s = gateStrategy(base, gate);
    expect(s.name).toBe("base+cut");
    expect(s.defaults).toEqual({ size: 2, cut: 1 });
    expect(Object.keys(s.schema ?? {}).sort()).toEqual(["cut", "size"]);
  });

  it("gives the options of the strategy to the strategy and the options of the gate to the gate", () => {
    const s = gateStrategy(base, gate);
    seen.length = 0;
    const plan = s.run({ graph }, { size: 1, cut: 3 });
    expect(seen).toEqual([{ cut: 3 }]);
    expect(plan.highways[0]!.id).toBe("h0-3");
    expect(edgesOf(plan)).toEqual([["a", "b"]]);
  });

  it("refuses a gate with an option of the strategy", () => {
    const bad: Gate<{ size: number }> = { ...gate, defaults: { size: 1 }, schema: {} as Gate<{ size: number }>["schema"] } as unknown as Gate<{ size: number }>;
    expect(() => gateStrategy(base, bad)).toThrow(/size/);
  });
});

describe("keepMembers", () => {
  it("removes the members that the rule refuses, and drops a highway with fewer than two members", () => {
    const plan: HighwayPlan = { highways: [highway("h0", ["a", "b", "c"]), highway("h1", ["d", "e"])] };
    const out = keepMembers(plan, (_h, m) => m.edge !== "b" && m.edge !== "e");
    expect(out.highways.map((h) => h.id)).toEqual(["h0"]);
    expect(edgesOf(out)).toEqual([["a", "c"]]);
    expect(out.highways[0]!.lanes).toEqual(["a", "c"]);
  });

  it("gives the same highway objects when each member stays", () => {
    const plan: HighwayPlan = { highways: [highway("h0", ["a", "b"])] };
    expect(keepMembers(plan, () => true).highways[0]).toBe(plan.highways[0]);
  });
});

describe("matchHighways and jaccard", () => {
  it("gives the Jaccard index of two sets, and 0 for two empty sets", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3, 12);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  it("pairs the highways with the most common edges first, one to one", () => {
    const before: HighwayPlan = { highways: [highway("x", ["a", "b", "c"]), highway("y", ["d", "e"])] };
    const after: HighwayPlan = { highways: [highway("p", ["d", "e", "f"]), highway("q", ["a", "b", "c", "g"]), highway("r", ["k", "l"])] };
    expect([...matchHighways(before, after, 0.5)].sort()).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("counts only the edges of the set, when the set is present", () => {
    const before: HighwayPlan = { highways: [highway("x", ["a", "b"])] };
    const after: HighwayPlan = { highways: [highway("p", ["a", "b", "z", "w"])] };
    expect(matchHighways(before, after, 0.6).size).toBe(0);
    expect(matchHighways(before, after, 0.6, new Set(["a", "b"])).get(0)).toBe(0);
  });

  it("gives the edges of both graphs", () => {
    const g = (ids: string[]): Graph => ({ nodes: [], edges: ids.map((id) => ({ id, source: { node: "s" }, target: { node: "t" } })) });
    expect([...commonEdges(g(["a", "b", "c"]), g(["b", "c", "d"]))]).toEqual(["b", "c"]);
  });
});
