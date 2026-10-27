import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import type { Box } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { DIFFUSION_DEFAULTS, diffusionPlan, linkDensity } from "./index.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

// Three edges that go around one tall wall, so their ways share the links over the wall.
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

describe("the highway strategy diffusion (HWY-020)", () => {
  // A path of four corners: 0-1, 1-2 and 2-3. Only the middle link has edges.
  const path = (i: number): number[] => [i - 1, i + 1].filter((j) => j >= 0 && j < 4);
  const key = (i: number, j: number): number => i * 4 + j;

  it("spreads the density to the links next to a dense link, and gives it as a share of the largest", () => {
    const none = linkDensity(path, 4, new Map([[key(1, 2), 6]]), 0.25, 0);
    expect(none.get(key(1, 2))).toBe(1);
    expect(none.get(key(0, 1))).toBe(0);
    const spread = linkDensity(path, 4, new Map([[key(1, 2), 6]]), 0.25, 1);
    expect(spread.get(key(1, 2))).toBe(1);
    // The link 0-1 gets a quarter of the mean of its one neighbour: 0.25 × 6 = 1.5, and the middle keeps 0.75 × 6 = 4.5.
    expect(spread.get(key(0, 1))).toBeCloseTo(1.5 / 4.5, 9);
    expect(spread.get(key(2, 3))).toBeCloseTo(1.5 / 4.5, 9);
  });

  it("makes a highway of the links that the ways share", () => {
    const plan = diffusionPlan({ graph: wall }, DIFFUSION_DEFAULTS);
    expect(checkPlan(wall, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    expect([...new Set(plan.highways.flatMap((h) => h.lanes))].sort()).toEqual(["e0", "e1", "e2"]);
    expect(diffusionPlan({ graph: wall }, { ...DIFFUSION_DEFAULTS, minSize: 4 }).highways).toEqual([]);
  });

  it("is in the registry, and gives a correct plan, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "diffusion");
    for (const graph of [hub, clustered]) {
      const plan = strategy.run({ graph }, { ...DIFFUSION_DEFAULTS });
      expect(checkPlan(graph, plan)).toEqual([]);
      expect(diffusionPlan({ graph }, DIFFUSION_DEFAULTS)).toEqual(plan);
    }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "diffusion"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
