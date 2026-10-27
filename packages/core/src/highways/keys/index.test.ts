import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { CASES } from "../../cases.ts";
import type { Point } from "../../geom.ts";
import { byCollection, trunksRouter } from "../../routers/trunks.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { getStrategy } from "../../strategies/model.ts";
import { checkPlan } from "../model.ts";
import { highwayRouterStrategy } from "../router.ts";
import { keysPlan } from "./index.ts";

const graph = CASES.find((c) => c.name === "case-dense-groups")!.make();

/** This function tells if a route holds the points of a spine in a row, in one of the two directions. */
function holds(route: readonly Point[], spine: readonly Point[]): boolean {
  const same = (p: Point, q: Point): boolean => p.x === q.x && p.y === q.y;
  const has = (line: readonly Point[]): boolean => route.some((_, i) => line.every((p, j) => route[i + j] !== undefined && same(route[i + j]!, p)));
  return has(spine) || has([...spine].reverse());
}

describe("the highway strategy keys (HWY-STEP)", () => {
  it("is in the registry and gives a good plan", () => {
    const keys = getStrategy(STRATEGIES, "highway", "keys");
    const plan = keys.run({ graph });
    expect(checkPlan(graph, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    expect(keys.run({ graph })).toEqual(plan);
  });

  it("reads the trunks and the runs of the router trunks: each member route of the router holds its spine", () => {
    const plan = keysPlan({ graph }, { rule: byCollection });
    const routes = new Map(trunksRouter({ name: "trunks", rule: byCollection }).route(graph).routes.map((r) => [r.edge, r.points]));
    for (const h of plan.highways) for (const m of h.members) expect(holds(routes.get(m.edge)!, h.spine), `${h.id} ${m.edge}`).toBe(true);
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", "keys"));
    expect(checkProperties(graph, router.run(graph), 1_000_000)).toEqual([]);
  });
});
