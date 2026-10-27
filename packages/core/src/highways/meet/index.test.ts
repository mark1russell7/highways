import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { checkPlan, memberAt } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { MEET_DEFAULTS, meetMember, meetPlan } from "./index.ts";

const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

describe("the highway strategy meet (HWY-050)", () => {
  const spine = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  // The route comes down to the spine at x = 20, runs beside it, and goes up at x = 80.
  const route = [
    { x: 0, y: 50 },
    { x: 20, y: 2 },
    { x: 80, y: 2 },
    { x: 100, y: 50 },
  ];

  it("moves the merge point and the split point inward, to where the route meets the spine", () => {
    const m = meetMember(spine, memberAt(spine, "e", 0, 1), route, MEET_DEFAULTS);
    expect(m.on).toBeGreaterThan(0.1);
    expect(m.on).toBeLessThan(0.25);
    expect(m.off).toBeGreaterThan(0.75);
    expect(m.off).toBeLessThan(0.9);
    const back = meetMember(spine, memberAt(spine, "e", 1, 0), route, MEET_DEFAULTS);
    expect(back.on).toBeCloseTo(m.off, 9);
    expect(back.off).toBeCloseTo(m.on, 9);
  });

  it("keeps the member when the met stretch is too short, or when the route is far", () => {
    const member = memberAt(spine, "e", 0, 1);
    expect(meetMember(spine, member, route, { ...MEET_DEFAULTS, minRun: 1000 })).toBe(member);
    expect(meetMember(spine, member, route.map((p) => ({ x: p.x, y: p.y + 100 })), MEET_DEFAULTS)).toBe(member);
  });

  it("is in the registry, and gives a correct plan on each base, the same each time", () => {
    const meet = getStrategy(STRATEGIES, "highway", "meet");
    for (const graph of [hub, clustered])
      for (const from of ["shared-ways", "corridors", "none"] as const) {
        const plan = meet.run({ graph }, { ...MEET_DEFAULTS, from });
        expect(checkPlan(graph, plan), from).toEqual([]);
        expect(meetPlan({ graph }, { ...MEET_DEFAULTS, from })).toEqual(plan);
      }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "meet"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
