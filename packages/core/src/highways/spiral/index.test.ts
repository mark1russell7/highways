import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import { dist, type Box, type Point } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { SPIRAL_DEFAULTS, spiralJoin, spiralPlan, spiralTree, type SpiralNode } from "./index.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);
const root: Point = { x: 0, y: 0 };
const deg = Math.PI / 180;

const leaf = (edge: string, r: number, theta: number): SpiralNode => ({ r, theta, point: { x: r * Math.cos(theta), y: r * Math.sin(theta) }, clear: 0, edge, children: [] });

// One hub on the left and five targets on the right, in a narrow fan.
const fan: Graph = {
  nodes: [{ id: "h", box: box(0, 190) }, ...[0, 1, 2, 3, 4].map((i) => ({ id: `t${i}`, box: box(600, 100 + 50 * i) }))],
  edges: [0, 1, 2, 3, 4].map((i) => ({ id: `e${i}`, source: { node: "h" }, target: { node: `t${i}` } })),
};

describe("the highway strategy spiral (HWY-017, EDA-035)", () => {
  it("joins two leaves where their spirals meet, on the middle angle for equal radii", () => {
    const alpha = 25 * deg;
    const join = spiralJoin(leaf("a", 100, -10 * deg), leaf("b", 100, 10 * deg), alpha, root)!;
    expect(join.theta > Math.PI ? join.theta - 2 * Math.PI : join.theta).toBeCloseTo(0, 9);
    // Each leaf turns 10 degrees: tan(alpha) ln(100 / r) = 10 degrees.
    expect(join.r).toBeCloseTo(100 * Math.exp(-(10 * deg) / Math.tan(alpha)), 6);
    expect(spiralJoin(leaf("a", 100, 0), leaf("b", 100, Math.PI), alpha, root)).toBeUndefined();
  });

  it("builds a tree where each join is nearer to the root than its children", () => {
    const leaves = [0, 1, 2, 3].map((i) => leaf(`e${i}`, 100 + 20 * i, (i - 1.5) * 8 * deg));
    const tops = spiralTree(leaves, 25 * deg, root, 1);
    const check = (n: SpiralNode): number => {
      if (n.edge !== undefined) return 1;
      let count = 0;
      for (const c of n.children) {
        expect(n.r).toBeLessThanOrEqual(c.r + 1e-9);
        count += check(c);
      }
      return count;
    };
    expect(tops.reduce((s, t) => s + check(t), 0)).toBe(4);
    expect(tops.length).toBe(1);
  });

  it("gives branches that the edges of a fan share, from the hub out", () => {
    const plan = spiralPlan({ graph: fan }, SPIRAL_DEFAULTS);
    expect(checkPlan(fan, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    const h = fan.nodes[0]!.box;
    for (const hw of plan.highways)
      for (const m of hw.members) expect(dist(m.merge, { x: h.x + h.w / 2, y: h.y + h.h / 2 })).toBeLessThan(dist(m.split, { x: h.x + h.w / 2, y: h.y + h.h / 2 }));
    expect(spiralPlan({ graph: fan }, { ...SPIRAL_DEFAULTS, minTargets: 6 }).highways).toEqual([]);
  });

  it("is in the registry, and gives a correct plan, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "spiral");
    for (const graph of [hub, clustered]) {
      const plan = strategy.run({ graph }, { ...SPIRAL_DEFAULTS });
      expect(checkPlan(graph, plan)).toEqual([]);
      expect(spiralPlan({ graph }, SPIRAL_DEFAULTS)).toEqual(plan);
    }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "spiral"));
    expect(checkProperties(fan, router.run(fan), 1_000_000)).toEqual([]);
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
