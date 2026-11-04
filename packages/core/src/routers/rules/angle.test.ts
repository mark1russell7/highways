import { describe, expect, it } from "vitest";
import { crossingAngles, drawnSegments } from "../../bench/measures/routes.ts";
import type { Point } from "../../geom.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { ENERGY_RULES, checkRules, compileRules, RULES_DEFAULTS, rulesStrategy, type LegRef, type TermContext, type VariableView } from "./index.ts";

/** Route 0 is a vertical leg with a free leg above it. Route 1 is a line that crosses that vertical leg. */
function boardOf(shift: number): readonly (readonly Point[])[] {
  return [
    [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 25 + shift, y: 40 }, { x: 45 + shift, y: 40 }, { x: 60, y: 80 }],
    [{ x: -20, y: 18 }, { x: 60, y: 22 }],
  ];
}

/** This function gives the energy `cos²θ` at the crossing of the leg 1 of route 0 with route 1, and of the leg 3 if it crosses. */
function energyOf(shift: number): number {
  const [r, s] = boardOf(shift) as [readonly Point[], readonly Point[]];
  const u = { x: r[2]!.x - r[1]!.x, y: r[2]!.y - r[1]!.y };
  const v = { x: s[1]!.x - s[0]!.x, y: s[1]!.y - s[0]!.y };
  const dot = u.x * v.x + u.y * v.y;
  return (dot * dot) / ((u.x * u.x + u.y * u.y) * (v.x * v.x + v.y * v.y));
}

describe("the term angle (RULE-019)", () => {
  it("gives the slope of the energy at a crossing", () => {
    const shift = 1;
    const routes = boardOf(shift);
    const context: TermContext = {
      clearance: 8,
      samples: 0,
      random: () => 0,
      all: [],
      pointOf: (route, k) => routes[route]![k]!,
      nearOf: (route): readonly LegRef[] => (route === 0 ? [{ route: 1, k: 0 }] : []),
    };
    const a = routes[0]![2]!;
    const b = routes[0]![3]!;
    const view: VariableView = { variable: { route: 0, k: 2, last: 3, nx: 1, ny: 0, boxes: [] }, shift, a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, samples: [] };
    const [term] = compileRules({ rules: [{ select: "free-crossings", term: "angle", weight: 1 }] });
    const h = 1e-5;
    const numeric = (energyOf(shift + h) - energyOf(shift - h)) / (2 * h);
    expect(term!(view, context, 0)).toBeCloseTo(numeric, 6);
    expect(numeric).not.toBe(0);
  });

  it("reads the crossings only of the two legs next to a free leg", () => {
    expect(checkRules(ENERGY_RULES)).toEqual([]);
    expect(checkRules({ rules: [{ select: "free", term: "angle", weight: 1 }] })).toHaveLength(1);
  });

  it("keeps the routes the same for each seed under `gradient`, because that method has no sample", () => {
    const first = rulesStrategy.run(clustered, { ...RULES_DEFAULTS, preset: "energy", descent: "gradient", seed: 1 });
    expect(rulesStrategy.run(clustered, { ...RULES_DEFAULTS, preset: "energy", descent: "gradient", seed: 2 }).routes).toEqual(first.routes);
  }, 60_000);

  it("gives a larger mean crossing angle than `elastic` on the board `hub`", () => {
    const energy = rulesStrategy.run(hub, { ...RULES_DEFAULTS, preset: "energy", descent: "gradient" });
    const elastic = rulesStrategy.run(hub, { ...RULES_DEFAULTS, preset: "elastic", descent: "gradient" });
    expect(JSON.stringify(energy.routes)).not.toBe(JSON.stringify(elastic.routes));
    expect(crossingAngles(drawnSegments(energy.routes)).mean).toBeGreaterThanOrEqual(crossingAngles(drawnSegments(elastic.routes)).mean);
  }, 60_000);
});
