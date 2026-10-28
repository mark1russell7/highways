import { createHash } from "node:crypto";
import { cornersRouter, laneRoutes, runKey, sectionsRouter, segmentsOf } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { BOARDS, EXAMPLE_BOARDS, ordersBoard } from "./boards.ts";

/**
 * The digests of the routes of the example boards with version 0.1.2 of the core. A host app pins `^0.1.2`.
 * A change that only makes the router faster keeps each digest. A digest covers the routes, the shared runs, the levels, the run keys and the lane routes.
 * ER3b changed the routes of the three boards, because their edges took the hubs out and back.
 * ER3c changed only the points of the level links of the board `courses`. Those links go through the groups now, not around the outer edge.
 */
const DIGESTS: Readonly<Record<string, string>> = {
  delivery: "6ed6c5d4875e531d3fb182313c5fde5b794f177dda2c80d1b41bfe4c30d7e7c0",
  services: "db7dfedbdf302d726add19839ebf0bfebd83414ec4c0e3a101e7a2f7062884dd",
  courses: "e497e24c5f35ba4beee8547c4427e4a3f27632696cd49516026442c93761c3de",
};

/** The router of the examples page. */
const router = sectionsRouter({ name: "sections", margin: 20, stretch: 3, cap: 6 });

describe("the routes of the example boards", () => {
  for (const make of BOARDS) {
    const board = make();
    it(`stay the same on the board ${board.id}`, () => {
      const result = router.route(board.graph);
      const segments = segmentsOf(result);
      const keys = segments.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges));
      const lanes = laneRoutes(segments, new Set(keys), 2.4, 16);
      expect(createHash("sha256").update(JSON.stringify({ result, keys, lanes })).digest("hex")).toBe(DIGESTS[board.id]);
    });
  }
});

describe("the board orders: a table card with rows and wall plugs (INTERIOR-ROUTE)", () => {
  const board = ordersBoard();
  const card = board.graph.nodes.find((n) => n.id === "orders")!.box;

  it("is the last board of the examples page, and the compare page does not show it", () => {
    expect(EXAMPLE_BOARDS.at(-1)).toBe(ordersBoard);
    expect(BOARDS).not.toContain(ordersBoard);
  });

  it("gets an inner route in the card for each edge from a row, and sections routes the outer edges", () => {
    const inner = cornersRouter({ name: "corners", margin: 6 }).route(board.graph).routes.filter((r) => r.frame === "orders");
    expect(inner.map((r) => r.edge).sort()).toEqual(["e4", "e5", "e6", "e7"]);
    for (const r of inner) for (const p of r.points) expect(p.x >= card.x && p.x <= card.x + card.w && p.y >= card.y && p.y <= card.y + card.h, r.edge).toBe(true);
    expect(router.route(board.graph).routes.map((r) => r.edge).sort()).toEqual(["e0", "e1", "e2", "e3"]);
  });
});
