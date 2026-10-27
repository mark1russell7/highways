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
import { characteristicPoints, representative, segmentClusters, segmentDistance, TRACLUS_DEFAULTS, traclusPlan, type RouteSegment } from "./index.ts";

const p = (x: number, y: number) => ({ x, y });
const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);
const W = { perp: 1, par: 1, theta: 1 };

// Three edges that go around one tall wall, so their first routes share the corridor over the wall.
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

describe("the highway strategy traclus (HWY-025)", () => {
  it("gives the distance of two segments: 0 for the same segment, and more for a far or a turned segment", () => {
    const s = { a: p(0, 0), b: p(100, 0) };
    expect(segmentDistance(s, s, W)).toBeCloseTo(0, 9);
    expect(segmentDistance(s, { a: p(100, 0), b: p(0, 0) }, W)).toBeCloseTo(0, 9);
    expect(segmentDistance(s, { a: p(10, 5), b: p(90, 5) }, W)).toBeCloseTo(5, 9);
    expect(segmentDistance(s, { a: p(150, 0), b: p(200, 0) }, W)).toBeCloseTo(50, 9);
    expect(segmentDistance(s, { a: p(50, -10), b: p(50, 10) }, W)).toBeGreaterThan(19);
  });

  it("keeps the corners of a route with a sharp turn, and drops the corners of a nearly straight route", () => {
    expect(characteristicPoints([p(0, 0), p(100, 0), p(100, 100)], 10, 1)).toHaveLength(3);
    expect(characteristicPoints([p(0, 0), p(50, 0.1), p(100, 0)], 10, 1)).toEqual([p(0, 0), p(100, 0)]);
  });

  it("clusters the near segments of three edges, and gives their mean line", () => {
    const segs: RouteSegment[] = [0, 1, 2].map((i) => ({ edge: `e${i}`, index: 0, a: p(0, 4 * i), b: p(100, 4 * i) }));
    const far: RouteSegment = { edge: "f", index: 0, a: p(0, 300), b: p(100, 300) };
    const clusters = segmentClusters([...segs, far], 10, 3, W);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.map((s) => s.edge)).toEqual(["e0", "e1", "e2"]);
    const line = representative(clusters[0]!, 3, 5);
    expect(line).toHaveLength(2);
    expect(line[0]!.y).toBeCloseTo(4, 9);
    expect(segmentClusters(segs, 10, 4, W)).toEqual([]);
  });

  it("makes a highway of the corridor that the first routes share", () => {
    const plan = traclusPlan({ graph: wall }, TRACLUS_DEFAULTS);
    expect(checkPlan(wall, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
  });

  it("is in the registry, and gives a correct plan, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "traclus");
    for (const graph of [hub, clustered]) {
      const plan = strategy.run({ graph }, { ...TRACLUS_DEFAULTS });
      expect(checkPlan(graph, plan)).toEqual([]);
      expect(traclusPlan({ graph }, TRACLUS_DEFAULTS)).toEqual(plan);
    }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "traclus"));
    expect(checkProperties(wall, router.run(wall), 1_000_000)).toEqual([]);
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
