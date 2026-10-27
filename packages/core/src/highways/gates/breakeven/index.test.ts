import { describe, expect, it } from "vitest";
import { CASES } from "../../../cases.ts";
import { STRATEGIES } from "../../../strategies/builtins.ts";
import { getStrategy } from "../../../strategies/model.ts";
import { CORRIDOR_DEFAULTS, corridorPlan } from "../../corridors/index.ts";
import { checkPlan, type HighwayPlan } from "../../model.ts";
import { BREAK_EVEN_DEFAULTS, breakEvenPlan } from "./index.ts";

const graph = CASES.find((c) => c.name === "case-hub-chain")!.make();
const plan = corridorPlan({ graph }, CORRIDOR_DEFAULTS);
const edges = (p: HighwayPlan): string[] => p.highways.flatMap((h) => h.members.map((m) => m.edge)).sort();

describe("the gate breakeven (HWY-047)", () => {
  it("gives a valid plan with a part of the members of the plan before it", () => {
    const out = breakEvenPlan({ graph }, plan, BREAK_EVEN_DEFAULTS);
    expect(checkPlan(graph, out)).toEqual([]);
    const before = new Set(edges(plan));
    expect(edges(out).every((e) => before.has(e))).toBe(true);
  });

  it("is a fixed point: a second pass changes nothing", () => {
    const once = breakEvenPlan({ graph }, plan, BREAK_EVEN_DEFAULTS);
    expect(breakEvenPlan({ graph }, once, BREAK_EVEN_DEFAULTS)).toEqual(once);
  });

  it("keeps fewer members or the same members when the shared stretch costs more", () => {
    const cheap = breakEvenPlan({ graph }, plan, { shareAlpha: 0 });
    const dear = breakEvenPlan({ graph }, plan, { shareAlpha: 0.9 });
    expect(edges(dear).length).toBeLessThanOrEqual(edges(cheap).length);
  });

  it("is in the registry as `corridors+breakeven`, with the options of both", () => {
    const s = getStrategy(STRATEGIES, "highway", "corridors+breakeven");
    expect(s.defaults).toEqual({ ...CORRIDOR_DEFAULTS, ...BREAK_EVEN_DEFAULTS });
    expect(s.run({ graph })).toEqual(breakEvenPlan({ graph }, plan, BREAK_EVEN_DEFAULTS));
  });
});
