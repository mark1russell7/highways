import { describe, expect, it } from "vitest";
import { inkSaved } from "../../bench/measures/bundles.ts";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import type { Box } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { follow } from "../follow.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { zipLegs, ZIPPER_DEFAULTS, zipperPlan } from "./index.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });
const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

// Two edges that run parallel, 30 apart.
const pair: Graph = {
  nodes: [
    { id: "s0", box: box(0, 0) },
    { id: "s1", box: box(0, 30) },
    { id: "t0", box: box(400, 0) },
    { id: "t1", box: box(400, 30) },
  ],
  edges: [
    { id: "a", source: { node: "s0" }, target: { node: "t0" } },
    { id: "b", source: { node: "s1" }, target: { node: "t1" } },
  ],
};

describe("the highway strategy zipper (NAT-022, WILD-037)", () => {
  const p = (x: number, y: number) => ({ x, y });
  const limits = { near: 20, maxAngle: 15, adhesion: 1, minOverlap: 10 };

  it("zips two near parallel legs along the mean line, when the overlap pays for the jogs", () => {
    const zip = zipLegs(p(0, 0), p(100, 0), p(0, 10), p(100, 10), limits)!;
    expect(zip.gain).toBeCloseTo(100 - 2 * (5 + 5), 9);
    expect(zip.from.y).toBeCloseTo(5, 9);
    expect(zip.to.y).toBeCloseTo(5, 9);
    expect(zip.forward).toEqual([true, true]);
    expect(zipLegs(p(0, 0), p(100, 0), p(100, 10), p(0, 10), limits)!.forward).toEqual([true, false]);
  });

  it("does not zip legs that are far, at a large angle, or with a short overlap", () => {
    expect(zipLegs(p(0, 0), p(100, 0), p(0, 30), p(100, 30), limits)).toBeUndefined();
    expect(zipLegs(p(0, 0), p(100, 0), p(0, 0), p(100, 60), limits)).toBeUndefined();
    expect(zipLegs(p(0, 0), p(100, 0), p(95, 5), p(200, 5), limits)).toBeUndefined();
    expect(zipLegs(p(0, 0), p(100, 0), p(0, 10), p(100, 10), { ...limits, adhesion: 0.1 })).toBeUndefined();
  });

  it("zips the two parallel edges into one highway, so they share ink", () => {
    const plan = zipperPlan({ graph: pair }, { ...ZIPPER_DEFAULTS, from: "none", near: 2 });
    expect(checkPlan(pair, plan)).toEqual([]);
    expect(plan.highways).toHaveLength(1);
    expect([...plan.highways[0]!.lanes].sort()).toEqual(["a", "b"]);
    const result = follow(pair, plan);
    expect(inkSaved(result.routes)).toBeGreaterThan(0);
    expect(checkProperties(pair, result, 1_000_000)).toEqual([]);
    expect(zipperPlan({ graph: pair }, { ...ZIPPER_DEFAULTS, from: "none", near: 0.5 }).highways).toEqual([]);
  });

  it("is in the registry, and gives a correct plan on each base, the same each time", () => {
    const zipper = getStrategy(STRATEGIES, "highway", "zipper");
    for (const graph of [hub, clustered])
      for (const from of ["shared-ways", "corridors", "none"] as const) {
        const plan = zipper.run({ graph }, { ...ZIPPER_DEFAULTS, from });
        expect(checkPlan(graph, plan), from).toEqual([]);
        expect(zipperPlan({ graph }, { ...ZIPPER_DEFAULTS, from })).toEqual(plan);
      }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "zipper"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
