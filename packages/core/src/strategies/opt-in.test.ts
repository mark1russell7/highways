import { describe, expect, it } from "vitest";
import { STRATEGIES } from "./builtins.ts";
import { listStrategies, STEPS, type Step } from "./model.ts";
import { ALL_STRATEGIES, OPT_IN_STRATEGIES, STEP_DEFAULTS } from "./opt-in.ts";

const DEFAULT_ROUTERS = ["straight", "plugs", "corners", "corners-smooth", "trunks", "shared", "shared-all", "sections", "sections-tree"];

describe("the opt-in strategies (PHYSICAL-VISIBLE)", () => {
  it("has the 11 opt-in routers, in the order of their names", () => {
    const names = OPT_IN_STRATEGIES.map((s) => s.name);
    expect(names).toEqual(["adam", "annealing", "attraction", "canals", "nudge", "portfolio", "repel", "reroute", "shared-stretch", "springs", "tight"]);
    for (const s of OPT_IN_STRATEGIES) expect(s.step, s.name).toBe("router");
  });

  it("leaves `STRATEGIES` with the 9 default routers, so a bench or a screen gets no new row", () => {
    expect(listStrategies(STRATEGIES, "router").map((s) => s.name)).toEqual(DEFAULT_ROUTERS);
  });

  it("adds only the opt-in routers in `ALL_STRATEGIES`, after the default routers", () => {
    for (const step of STEPS) {
      const all = listStrategies(ALL_STRATEGIES, step);
      const base = listStrategies(STRATEGIES, step);
      expect(all.slice(0, base.length)).toEqual(base);
      expect(all.slice(base.length)).toEqual(step === "router" ? OPT_IN_STRATEGIES : []);
    }
  });

  it("names a built-in strategy of its step in each step default", () => {
    for (const [step, name] of Object.entries(STEP_DEFAULTS)) expect(listStrategies(STRATEGIES, step as Step).map((s) => s.name), step).toContain(name);
  });
});
