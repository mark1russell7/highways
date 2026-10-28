import highsModule from "highs";
import { describe, expect, it } from "vitest";
import type { Box } from "../../geom.ts";
import { checkPlan } from "../../highways/model.ts";
import type { Graph } from "../../model.ts";
import { exactModel } from "./index.ts";

// The types of `highs` describe a CommonJS module, but Node loads its ES module. Its loader is the default export of either form.
const loadHighs = (highsModule.default ?? highsModule) as typeof highsModule.default;

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });

// Three edges that go around one tall wall. The least ink shares the way over the wall.
const wall: Graph = {
  nodes: [
    { id: "wall", box: box(280, 0, 40, 400) },
    ...[0, 1, 2].flatMap((i) => [
      { id: `s${i}`, box: box(0, 100 + 30 * i) },
      { id: `t${i}`, box: box(600, 100 + 30 * i) },
    ]),
  ],
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `s${i}` }, target: { node: `t${i}` } })),
};

describe("the exact model of fixed-charge network design (HWY-040)", () => {
  it("gives a program that HiGHS solves, and a correct plan that shares the way over the wall", async () => {
    const highs = await loadHighs();
    const model = exactModel(wall, { stretch: 1.5, rule: "all" });
    expect(model.edges).toBe(3);
    const solution = highs.solve(model.lp, { time_limit: 30, output_flag: false });
    expect(solution.Status).toBe("Optimal");
    const columns = solution.Columns as Record<string, { Primal: number }>;
    const plan = model.decode((n) => columns[n]?.Primal ?? 0);
    expect(checkPlan(wall, plan)).toEqual([]);
    expect(new Set(plan.highways.flatMap((h) => h.lanes))).toEqual(new Set(["e0", "e1", "e2"]));
  });

  it("gives no shared link to edges of two collections with the rule `collection`", async () => {
    const highs = await loadHighs();
    const mixed: Graph = { ...wall, edges: wall.edges.map((e, i) => ({ ...e, data: { collection: `c${i}` } })) };
    const model = exactModel(mixed, { stretch: 1.5, rule: "collection" });
    const solution = highs.solve(model.lp, { time_limit: 30, output_flag: false });
    expect(solution.Status).toBe("Optimal");
    const columns = solution.Columns as Record<string, { Primal: number }>;
    expect(model.decode((n) => columns[n]?.Primal ?? 0).highways).toEqual([]);
  });
});
