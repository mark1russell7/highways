import { describe, expect, it } from "vitest";
import { clustered, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { CONFLUENT_DEFAULTS, confluentPlan, greedyBicliques, nodeLinks } from "./index.ts";
import { k23 } from "./k23.test-util.ts";

describe("the highway strategy confluent (HWY-013)", () => {
  it("finds the biclique K(2, 3), with the larger set as b", () => {
    const [scope] = nodeLinks(k23, "all");
    expect(greedyBicliques(scope!.links, 4)).toEqual([{ a: ["a0", "a1"], b: ["b0", "b1", "b2"] }]);
    expect(greedyBicliques(scope!.links, 7)).toEqual([]);
  });

  it("gives one track on the biclique", () => {
    const plan = confluentPlan({ graph: k23 }, CONFLUENT_DEFAULTS);
    expect(checkPlan(k23, plan)).toEqual([]);
    expect(plan.highways.length).toBe(1);
  });

  it("gives a correct plan with the scope collection", () => {
    expect(checkPlan(clustered, confluentPlan({ graph: clustered }, { ...CONFLUENT_DEFAULTS, scope: "collection" }))).toEqual([]);
  });

  commonTests("confluent", CONFLUENT_DEFAULTS, confluentPlan, [flows, k23]);
});
