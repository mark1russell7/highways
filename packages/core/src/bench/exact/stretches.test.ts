// The tests of the cheaper stretch of the exact model (PORTFOLIO-SPEED): the A* search gives the values of the full Dijkstra of the first version.
import { describe, expect, it } from "vitest";
import { exactBoard, EXACT_CLASSES } from "../screen/exact-set.ts";
import { RECORD_EPS } from "../screen/hash.ts";
import { portfolioMember } from "../../portfolio/members.ts";
import { asRouter } from "../../strategies/model.ts";
import { exactStretch, exactStretches, exactStretchesReference } from "./index.ts";

describe("the stretch of the exact model", () => {
  it("gives the values of the reference search on each class, for the routes of two members", () => {
    const members = ["shared", "corners-side"].map((name) => asRouter(portfolioMember(name)!));
    for (const cls of EXACT_CLASSES)
      for (const [n, k] of [
        [10, 0],
        [24, 1],
        [40, 2],
      ] as const) {
        const graph = exactBoard(cls, n, k);
        const fast = exactStretches(graph);
        const slow = exactStretchesReference(graph);
        for (const m of members) {
          const routes = m.route(graph).routes;
          const a = slow(routes);
          const b = fast(routes);
          expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
          for (const [edge, v] of a) expect(Math.abs(b.get(edge)! - v)).toBeLessThanOrEqual(RECORD_EPS);
        }
      }
  });

  it("keeps the largest stretch of `exactStretch` at 1 or more", () => {
    const graph = exactBoard("hubs", 18, 3);
    const routes = asRouter(portfolioMember("shared")!).route(graph).routes;
    expect(exactStretch(graph, routes)).toBeGreaterThanOrEqual(1);
    expect(exactStretch(graph, [])).toBe(1);
  });
});
