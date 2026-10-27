import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { checkPlan } from "../model.ts";
import { QUICKBUNDLES_DEFAULTS, quickBundles } from "../quickbundles/index.ts";
import { highwayRouterStrategy } from "../router.ts";
import { NESTED_DEFAULTS, nestedGroups, nestedPlan, nestingViolations } from "./index.ts";

const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);
const count = (m: ReadonlyMap<string, { key: string }>): number => new Set([...m.values()].map((g) => g.key)).size;

describe("the highway strategy nested (HWY-052)", () => {
  it("gives levels that nest, with fewer groups at the far levels", () => {
    const levels = nestedGroups({ graph: clustered }, NESTED_DEFAULTS);
    expect(levels).toHaveLength(3);
    for (let d = 1; d < levels.length; d++) {
      expect(nestingViolations(levels[d]!, levels[d - 1]!)).toBe(0);
      expect(count(levels[d]!)).toBeLessThanOrEqual(count(levels[d - 1]!));
    }
  });

  it("gives the clusters of quickbundles at the far level", () => {
    const far = nestedGroups({ graph: clustered }, NESTED_DEFAULTS)[2]!;
    const flat = quickBundles({ graph: clustered }, { ...QUICKBUNDLES_DEFAULTS, theta: NESTED_DEFAULTS.theta * NESTED_DEFAULTS.ratio ** 2 });
    const pairs = (m: ReadonlyMap<string, { key: string }>): string[] => [...m].map(([e, g]) => `${e}:${g.key.replace(/^n\./, "q")}`).sort();
    expect(pairs(far)).toEqual(pairs(flat));
  });

  it("counts a group of a closer level that is in two groups of the level above", () => {
    const coarse = new Map([
      ["a", { key: "x", flip: false }],
      ["b", { key: "y", flip: false }],
    ]);
    const fine = new Map([
      ["a", { key: "f", flip: false }],
      ["b", { key: "f", flip: false }],
    ]);
    expect(nestingViolations(coarse, fine)).toBe(1);
  });

  it("is in the registry, and gives a correct plan, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "nested");
    for (const graph of [hub, clustered])
      for (const level of [0, 2]) {
        const plan = strategy.run({ graph }, { ...NESTED_DEFAULTS, level });
        expect(checkPlan(graph, plan)).toEqual([]);
        expect(nestedPlan({ graph }, { ...NESTED_DEFAULTS, level })).toEqual(plan);
      }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "nested"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
