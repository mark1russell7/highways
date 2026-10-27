import { createHash } from "node:crypto";
import { laneRoutes, runKey, sectionsRouter, segmentsOf } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { BOARDS } from "./boards.ts";

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
