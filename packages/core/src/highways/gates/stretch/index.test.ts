import { describe, expect, it } from "vitest";
import { CASES } from "../../../cases.ts";
import { STRATEGIES } from "../../../strategies/builtins.ts";
import { getStrategy } from "../../../strategies/model.ts";
import { CORRIDOR_DEFAULTS, corridorPlan } from "../../corridors/index.ts";
import { checkPlan } from "../../model.ts";
import { edgeLengths } from "../model.ts";
import { STRETCH_DEFAULTS, stretchPlan } from "./index.ts";

const graph = CASES.find((c) => c.name === "case-hub-chain")!.make();
const plan = corridorPlan({ graph }, CORRIDOR_DEFAULTS);

describe("the gate stretch (HWY-048)", () => {
  it("keeps each route of the plan in the budget", () => {
    for (const budget of [1.05, 1.2, 1.5]) {
      const out = stretchPlan({ graph }, plan, { budget, pad: 0 });
      expect(checkPlan(graph, out)).toEqual([]);
      for (const [, l] of edgeLengths(graph, out, {})) expect(l.route).toBeLessThanOrEqual(budget * l.alone + 1e-6);
    }
  });

  it("changes nothing when the budget is very large", () => {
    expect(stretchPlan({ graph }, plan, { budget: 1e9, pad: 0 })).toBe(plan);
  });

  it("is in the registry as `corridors+stretch`", () => {
    const s = getStrategy(STRATEGIES, "highway", "corridors+stretch");
    expect(s.defaults).toEqual({ ...CORRIDOR_DEFAULTS, ...STRETCH_DEFAULTS });
    expect(s.run({ graph })).toEqual(stretchPlan({ graph }, plan, STRETCH_DEFAULTS));
  });
});
