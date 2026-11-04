import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { measureQuality } from "../../bench/quality.ts";
import type { Box, Point } from "../../geom.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";
import { checkRules, compileRules, ENERGY_RULES, freeVariables, RULES_DEFAULTS, rulesRouter, rulesStrategy, type LegRef, type Rule, type RuleSet, type TermContext, type Variable, type VariableView } from "./index.ts";

/** Route 0 has one free point, at index 1, that moves by `dx` and `dy`. Route 1 crosses its second leg. */
function boardOf(dx: number, dy: number): readonly (readonly Point[])[] {
  return [
    [{ x: 0, y: 0 }, { x: 30 + dx, y: 40 + dy }, { x: 70, y: 10 }],
    [{ x: 35, y: 10 }, { x: 75, y: 50 }],
  ];
}

/** The box that the terms `gap` of these tests read. */
const BOX: Box = { x: 26, y: 46, w: 20, h: 10 };

/** This function gives the context of a step on the board of `boardOf`. */
function contextOf(routes: readonly (readonly Point[])[]): TermContext {
  return {
    clearance: 8,
    samples: 0,
    random: () => 0,
    all: [],
    pointOf: (route, k) => routes[route]![k]!,
    nearOf: (route): readonly LegRef[] => (route === 0 ? [{ route: 1, k: 0 }] : []),
  };
}

/** This function gives the view of the variable of the free point of route 0. */
function viewOf(routes: readonly (readonly Point[])[], variable: Variable): VariableView {
  const [before, a, after] = routes[0] as [Point, Point, Point];
  const half = (p: Point): Point => ({ x: (p.x + a.x) / 2, y: (p.y + a.y) / 2 });
  return { variable, shift: 0, a, b: a, mid: a, samples: [{ point: half(before), part: 0.5 }, { point: a, part: 1 }, { point: half(after), part: 0.5 }] };
}

/** This function gives the energy of the rule at a move of the free point, from the definition of each term. */
function energyOf(rule: Rule, dx: number, dy: number): number {
  const [r, s] = boardOf(dx, dy) as [readonly Point[], readonly Point[]];
  const [before, p, after] = r as [Point, Point, Point];
  const c2 = 64;
  if (rule.term === "spring") return ((p.x - before.x) ** 2 + (p.y - before.y) ** 2 + (p.x - after.x) ** 2 + (p.y - after.y) ** 2) / c2;
  if (rule.term === "angle") {
    const u = { x: after.x - p.x, y: after.y - p.y };
    const v = { x: s[1]!.x - s[0]!.x, y: s[1]!.y - s[0]!.y };
    const dot = u.x * v.x + u.y * v.y;
    return (dot * dot) / ((u.x * u.x + u.y * u.y) * (v.x * v.x + v.y * v.y));
  }
  const half = (q: Point): Point => ({ x: (q.x + p.x) / 2, y: (q.y + p.y) / 2 });
  let sum = 0;
  for (const q of [half(before), p, half(after)]) {
    const x = q.x - Math.max(BOX.x, Math.min(BOX.x + BOX.w, q.x));
    const y = q.y - Math.max(BOX.y, Math.min(BOX.y + BOX.h, q.y));
    const d = Math.sqrt(x * x + y * y);
    if (d < 8) sum += (1 - d / 8) ** 2;
  }
  return sum;
}

describe("the variable points (RULE-POINTS)", () => {
  const rules: readonly Rule[] = [
    { select: "free", term: "spring", weight: 1 },
    { select: "free-crossings", term: "angle", weight: 1 },
    { select: "free-boxes", term: "gap", weight: 1 },
  ];
  for (const rule of rules) {
    it(`gives the slope of the term ${rule.term} against x and y`, () => {
      const routes = boardOf(0, 0);
      const [term] = compileRules({ rules: [rule] });
      const h = 1e-5;
      const slopes = [
        { nx: 1, ny: 0, numeric: (energyOf(rule, h, 0) - energyOf(rule, -h, 0)) / (2 * h) },
        { nx: 0, ny: 1, numeric: (energyOf(rule, 0, h) - energyOf(rule, 0, -h)) / (2 * h) },
      ];
      for (const { nx, ny, numeric } of slopes) {
        const variable: Variable = { route: 0, k: 1, last: 1, nx, ny, boxes: [BOX] };
        expect(term!(viewOf(routes, variable), contextOf(routes), 0)).toBeCloseTo(numeric, 5);
      }
      expect(slopes.some((s) => s.numeric !== 0)).toBe(true);
    });
  }

  it("refuses a variable that the language does not have", () => {
    expect(checkRules({ ...ENERGY_RULES, variable: "points" })).toEqual([]);
    expect(checkRules({ ...ENERGY_RULES, variable: "curves" } as unknown as RuleSet)).toHaveLength(1);
  });

  it("gives two variables for each free point, and leaves each end of a route", () => {
    const base = sharedRouter({ name: "x", rule: byCollection }).route(clustered);
    const set: RuleSet = { ...ENERGY_RULES, variable: "points" };
    const variables = freeVariables(clustered, base, set, RULES_DEFAULTS.clearance);
    expect(variables.length % 2).toBe(0);
    for (const v of variables) {
      expect(v.k).toBeGreaterThan(0);
      expect(v.k).toBeLessThan(base.routes[v.route]!.points.length - 1);
    }
    expect(variables.length / 2).toBeGreaterThanOrEqual(freeVariables(clustered, base, ENERGY_RULES, RULES_DEFAULTS.clearance).length);
  });

  it("keeps the routes of a file with no variable the same as the routes of `legs`", () => {
    const a = rulesRouter({ name: "x", rule: byCollection, rules: ENERGY_RULES }).route(hub);
    expect(rulesRouter({ name: "x", rule: byCollection, rules: { ...ENERGY_RULES, variable: "legs" } }).route(hub)).toEqual(a);
  }, 60_000);

  it("gives the same routes for the same seed, with no break of a hard rule and no added crossing", () => {
    const options = { ...RULES_DEFAULTS, preset: "energy", descent: "gradient", variable: "points" } as const;
    for (const graph of [hub, clustered]) {
      const first = rulesStrategy.run(graph, options);
      expect(rulesStrategy.run(graph, options)).toEqual(first);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
      const base = sharedRouter({ name: "x", rule: byCollection }).route(graph);
      expect(measureQuality(graph, first).crossings).toBeLessThanOrEqual(measureQuality(graph, base).crossings);
    }
  }, 120_000);

  it("moves other points than the variable `legs`", () => {
    const options = { ...RULES_DEFAULTS, preset: "energy", descent: "gradient" } as const;
    const legs = rulesStrategy.run(hub, options);
    const points = rulesStrategy.run(hub, { ...options, variable: "points" });
    expect(JSON.stringify(points.routes)).not.toBe(JSON.stringify(legs.routes));
  }, 60_000);
});
