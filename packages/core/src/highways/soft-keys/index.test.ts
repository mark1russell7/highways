import { describe, expect, it } from "vitest";
import type { Graph } from "../../model.ts";
import { commonTests, flows } from "../fixtures.test-util.ts";
import { SOFT_KEY_DEFAULTS, softDistance, softKeyClusters, softKeyPlan } from "./index.ts";

describe("the highway strategy soft-keys (HWY-019)", () => {
  it("adds lambda only when two edges have two different keys", () => {
    expect(softDistance(0.1, "p", "q", 0.25, 0)).toBeCloseTo(0.35, 9);
    expect(softDistance(0.1, "p", "p", 0.25, 0)).toBeCloseTo(0.1, 9);
    expect(softDistance(0.1, undefined, "q", 0.25, 0.5)).toBeCloseTo(0.6, 9);
  });

  it("puts near edges of two keys into one cluster, and keeps them apart with a very large lambda", () => {
    const soft = softKeyClusters({ graph: flows }, SOFT_KEY_DEFAULTS);
    expect(soft.get("b")!.key).toBe(soft.get("a")!.key);
    expect(soft.get("c")!.key).toBe(soft.get("a")!.key);
    expect(soft.get("c")!.flip).toBe(true);
    expect(soft.get("x")!.key).not.toBe(soft.get("a")!.key);
    expect(soft.get("y")!.key).toBe(soft.get("x")!.key);
    const hard = softKeyClusters({ graph: flows }, { ...SOFT_KEY_DEFAULTS, lambda: Infinity });
    expect(hard.get("b")!.key).not.toBe(hard.get("a")!.key);
    expect(hard.get("c")!.key).toBe(hard.get("a")!.key);
  });

  it("adds the distance of a number field over its range", () => {
    const graph: Graph = { ...flows, edges: flows.edges.map((e, i) => ({ ...e, data: { ...e.data, w: i % 2 } })) };
    const split = softKeyClusters({ graph }, { ...SOFT_KEY_DEFAULTS, lambda: 0, attributes: ["w"] });
    expect(split.get("b")!.key).not.toBe(split.get("a")!.key);
    expect(split.get("c")!.key).toBe(split.get("a")!.key);
  });

  commonTests("soft-keys", SOFT_KEY_DEFAULTS, softKeyPlan, [flows]);
});
