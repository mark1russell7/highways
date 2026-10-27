import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { CASES } from "../../cases.ts";
import type { Box } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { ROUTERS } from "../../routers/index.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { findStrategy, getStrategy } from "../../strategies/model.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { BREAK_EVEN, CORRIDOR_DEFAULTS, corridorPlan, minHash } from "./index.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });

// One source beside two walls and three targets on the right. The edges to t0 and t1 go through the gap between the walls.
const gap: Graph = {
  nodes: [
    { id: "s", box: box(0, 250) },
    { id: "top", box: box(150, -300, 20, 290) },
    { id: "bottom", box: box(150, 30, 20, 290) },
    { id: "t0", box: box(400, -120) },
    { id: "t1", box: box(400, 0) },
    { id: "t2", box: box(400, 120) },
  ],
  edges: [
    { id: "a", source: { node: "s" }, target: { node: "t0" } },
    { id: "b", source: { node: "s" }, target: { node: "t1" } },
    { id: "c", source: { node: "s" }, target: { node: "t2" } },
  ],
};

const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();

describe("minHash", () => {
  it("gives the same signature for the same set, in each order, and another signature for another set", () => {
    const one = minHash(["p", "q", "r"], 16);
    expect(one).toHaveLength(16);
    expect(minHash(["r", "p", "q", "p"], 16)).toEqual(one);
    expect(minHash(["x", "y", "z"], 16)).not.toEqual(one);
    expect(one.every((v) => Number.isInteger(v) && v >= 0 && v < 2 ** 32)).toBe(true);
  });
});

describe("the highway strategy corridors (HWY-031)", () => {
  it("joins two ways when they share more than the break-even length", () => {
    expect(BREAK_EVEN).toBeCloseTo(1 + Math.SQRT2, 12);
  });

  it("gives one highway through the gap. The way to t2 goes below the bottom wall, so it is not a member", () => {
    const plan = corridorPlan({ graph: gap }, CORRIDOR_DEFAULTS);
    expect(checkPlan(gap, plan)).toEqual([]);
    expect(plan.highways).toHaveLength(1);
    expect([...plan.highways[0]!.lanes].sort()).toEqual(["a", "b"]);
  });

  it("is in the registry as a highway strategy, and no router changes", () => {
    const corridors = getStrategy(STRATEGIES, "highway", "corridors");
    expect(findStrategy(STRATEGIES, "router", "corridors")).toBeUndefined();
    expect(ROUTERS.map((r) => r.name)).not.toContain("corridors");
    const plan = corridors.run({ graph: hub });
    expect(checkPlan(hub, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    expect(corridors.run({ graph: hub })).toEqual(plan);
  });

  it("reads the first routes of the input when they are present", () => {
    const routes = ROUTERS.find((r) => r.name === "corners")!.route(hub);
    const plan = corridorPlan({ graph: hub, routes }, CORRIDOR_DEFAULTS);
    expect(checkPlan(hub, plan)).toEqual([]);
    const points = new Set(routes.routes.flatMap((r) => r.points.map((p) => `${p.x},${p.y}`)));
    for (const h of plan.highways) for (const p of h.spine) expect(points.has(`${p.x},${p.y}`)).toBe(true);
  });

  it("gives fewer members or the same number with a larger share rho", () => {
    const count = (rho: number): number => corridorPlan({ graph: hub }, { ...CORRIDOR_DEFAULTS, rho }).highways.reduce((n, h) => n + h.members.length, 0);
    expect(count(0.8)).toBeLessThanOrEqual(count(0.1));
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "corridors"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(gap, router.run(gap), 1_000_000)).toEqual([]);
  });
});
