import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { drawnCrossings, measureQuality } from "../../bench/quality.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { SCREEN_SETS, screenInputs } from "../../bench/screen/index.ts";
import { rng } from "../../fixtures.ts";
import type { Point } from "../../geom.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";
import { ENERGY_RULES, checkRules, rulesRouter, sendBack, type RuleGuard, type SolverOutcome } from "./index.ts";

/** This function gives a route from two pairs of numbers. */
const leg = (x0: number, y0: number, x1: number, y1: number): readonly Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y1 },
];

describe("the count of the guard", () => {
  it("is the count of `measureQuality`", () => {
    for (const graph of [hub, clustered]) {
      const result = sharedRouter({ name: "x", rule: byCollection }).route(graph);
      expect(drawnCrossings(result.routes.map((r) => r.points))).toBe(measureQuality(graph, result).crossings);
    }
  });

  it("is the count of `measureQuality` on each board of `screen-v3`, on the routes of `shared` and on moved points", () => {
    const inputs = screenInputs(SCREEN_SETS["screen-v3"]!);
    expect(inputs).toHaveLength(150);
    for (const [seed, input] of inputs.entries()) {
      const graph = inputGraph(input);
      const result = sharedRouter({ name: "x", rule: byCollection }).route(graph);
      const random = rng(seed + 1);
      const moved = { ...result, routes: result.routes.map((r) => ({ ...r, points: r.points.map((p, k) => (k === 0 || k === r.points.length - 1 ? p : { x: p.x + 8 * (random() - 0.5), y: p.y + 8 * (random() - 0.5) })) })) };
      for (const each of [result, moved]) expect(drawnCrossings(each.routes.map((r) => r.points))).toBe(measureQuality(graph, each).crossings);
    }
  }, 120_000);
});

describe("the guard `routes` (RENDER-RULES)", () => {
  it("sends back both routes of a pair, where no single route lowers the count", () => {
    const first = [leg(0, 0, 10, 0), leg(0, 5, 10, 5)];
    const points = [leg(0, -1, 10, 6), leg(0, 6, 10, -1)];
    expect(sendBack(points, first)).toMatchObject({ sent: 2 });
    expect(points).toEqual(first);
    expect(points[0]).toBe(first[0]);
  });

  it("sends back first the route with the largest fall of the count, and keeps the rest", () => {
    const first = [leg(0, 0, 10, 0), leg(0, 20, 10, 20), leg(20, 0, 20, 2), leg(25, 0, 25, 2), leg(30, 0, 30, 2)];
    const crossing = leg(19, 1, 40, 1);
    const keeper = leg(0, 21, 10, 21);
    const points = [crossing, keeper, first[2]!, first[3]!, first[4]!];
    expect(sendBack(points, first)).toMatchObject({ sent: 1 });
    expect(points[0]).toBe(first[0]);
    expect(points[1]).toBe(keeper);
  });

  it("changes nothing when the count does not rise, and makes two counts", () => {
    const first = [leg(0, 0, 10, 0), leg(0, 5, 10, 5)];
    const points = [leg(0, 1, 10, 1), first[1]!];
    expect(sendBack(points, first)).toEqual({ sent: 0, counts: 2 });
    expect(points[0]).not.toBe(first[0]);
  });

  it("refuses a guard that the language does not have", () => {
    expect(checkRules({ ...ENERGY_RULES, guard: "routes" })).toEqual([]);
    expect(checkRules({ ...ENERGY_RULES, guard: "none" as RuleGuard })).toHaveLength(1);
  });

  it("gives the same routes for a file with no guard and for the guard `board`", () => {
    const a = rulesRouter({ name: "x", rule: byCollection, rules: ENERGY_RULES }).route(hub);
    expect(rulesRouter({ name: "x", rule: byCollection, rules: { ...ENERGY_RULES, guard: "board" } }).route(hub)).toEqual(a);
  }, 60_000);

  it("adds no crossing and no break of a hard rule, and gives the same routes for the same board", () => {
    for (const graph of [hub, clustered]) {
      let outcome: SolverOutcome | undefined;
      const options = { name: "x", rule: byCollection, preset: "energy", descent: "gradient", guard: "routes", variable: "points" } as const;
      const first = rulesRouter({ ...options, report: (seen) => (outcome = seen) }).route(graph);
      expect(rulesRouter(options).route(graph)).toEqual(first);
      const base = sharedRouter({ name: "x", rule: byCollection }).route(graph);
      expect(measureQuality(graph, first).crossings).toBeLessThanOrEqual(measureQuality(graph, base).crossings);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
      expect(outcome?.dropped).not.toBe("crossings");
    }
  }, 120_000);
});
