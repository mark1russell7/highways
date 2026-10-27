import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { CASES } from "../../cases.ts";
import { dist } from "../../geom.ts";
import { byCollection } from "../../routers/trunks.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { sharedWaysPlan } from "../shared-ways/index.ts";
import { meetingPoints, WEISZFELD_DEFAULTS, weiszfeldPlan } from "./index.ts";

const hub = CASES.find((c) => c.name === "case-hub-chain")!.make();
const clustered = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

describe("the highway strategy weiszfeld (HWY-043)", () => {
  const a = [
    { x: 0, y: -10 },
    { x: 0, y: 10 },
  ];
  const b = [
    { x: 100, y: -10 },
    { x: 100, y: 10 },
  ];

  it("gives meeting points on the axis of a symmetric bundle", () => {
    const [m1, m2] = meetingPoints(a, b, 1, 50);
    expect(m1.y).toBeCloseTo(0, 6);
    expect(m2.y).toBeCloseTo(0, 6);
    // The optimum puts M1 at x = 10 / sqrt(3) for w = 1.
    expect(m1.x).toBeCloseTo(10 / Math.sqrt(3), 1);
    expect(m2.x).toBeCloseTo(100 - 10 / Math.sqrt(3), 1);
  });

  it("gives a shorter trunk for a heavier trunk", () => {
    const trunk = (w: number): number => dist(...meetingPoints(a, b, w, 50));
    expect(trunk(1.8)).toBeLessThan(trunk(1));
    expect(trunk(1)).toBeLessThan(trunk(0.5));
  });

  it("only makes the stretches of the members shorter", () => {
    const base = sharedWaysPlan({ graph: hub }, { rule: byCollection });
    const plan = weiszfeldPlan({ graph: hub }, WEISZFELD_DEFAULTS);
    const before = new Map(base.highways.flatMap((h) => h.members.map((m) => [`${h.key}:${m.edge}`, Math.abs(m.off - m.on)] as const)));
    for (const h of plan.highways)
      for (const m of h.members) {
        const old = before.get(`${h.key}:${m.edge}`);
        if (old !== undefined) expect(Math.abs(m.off - m.on)).toBeLessThanOrEqual(old + 1e-9);
      }
  });

  it("is in the registry, and gives a correct plan on each base, the same each time", () => {
    const weiszfeld = getStrategy(STRATEGIES, "highway", "weiszfeld");
    for (const graph of [hub, clustered])
      for (const from of ["shared-ways", "corridors", "none"] as const) {
        const plan = weiszfeld.run({ graph }, { ...WEISZFELD_DEFAULTS, from });
        expect(checkPlan(graph, plan), from).toEqual([]);
        expect(weiszfeldPlan({ graph }, { ...WEISZFELD_DEFAULTS, from })).toEqual(plan);
      }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "weiszfeld"));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
});
