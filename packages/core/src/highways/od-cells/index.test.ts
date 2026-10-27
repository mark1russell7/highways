import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { OD_CELL_DEFAULTS, odCellPlan, odGroups } from "./index.ts";

const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const many = CASES.find((c) => c.name === "case-many-groups")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

describe("the highway strategy od-cells (EDA-033, WILD-032)", () => {
  it("groups the edges by their pair of cells, in either direction", () => {
    const groups = odGroups({ graph: many }, OD_CELL_DEFAULTS);
    for (const g of groups.values()) expect(g.key.startsWith("od"), g.key).toBe(true);
    const plan = odCellPlan({ graph: many }, OD_CELL_DEFAULTS);
    expect(checkPlan(many, plan)).toEqual([]);
    for (const h of plan.highways) {
      expect(h.key.startsWith("od"), h.key).toBe(true);
      expect(h.members.length).toBeGreaterThanOrEqual(OD_CELL_DEFAULTS.minGroup);
    }
    expect(odGroups({ graph: { nodes: [], edges: [] } }, OD_CELL_DEFAULTS).size).toBe(0);
  });

  it("is in the registry, and gives a correct plan on each level, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", "od-cells");
    for (const graph of [hub, many, clustered])
      for (const level of [1, 2, 3]) {
        const plan = strategy.run({ graph }, { ...OD_CELL_DEFAULTS, level });
        expect(checkPlan(graph, plan), `${level}`).toEqual([]);
        expect(odCellPlan({ graph }, { ...OD_CELL_DEFAULTS, level })).toEqual(plan);
      }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "od-cells"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(many, router.run(many), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
