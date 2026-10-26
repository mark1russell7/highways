import { createHash } from "node:crypto";
import { laneRoutes, runKey, sectionsRouter, segmentsOf } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { BOARDS } from "./boards.ts";

/**
 * The digests of the routes of the example boards with version 0.1.2 of the core. A host app pins `^0.1.2`.
 * A change that only makes the router faster keeps each digest. A digest covers the routes, the shared runs, the levels, the run keys and the lane routes.
 */
const DIGESTS: Readonly<Record<string, string>> = {
  delivery: "eb50f2d466e7e13b2860ba5432081d01b67a3d164ec4f9def04eecf429cdba6d",
  services: "2acbdd6cdcd07bca4dcb210ba8388d0bc298c82e6427341cc1395dbbb3d92a5c",
  courses: "5920f43929d0994b213d91e2aaeb784fd13b5929b5deb5008d08fd2901ba6f59",
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
