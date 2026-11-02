import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import type { Graph } from "../../model.ts";
import { checkOptions } from "../../strategies/options.ts";
import { NUDGE_DEFAULTS, NUDGE_SCHEMA, nudgeRoutes, nudgeStrategy, spread } from "./index.ts";

describe("the router nudge (PHYSICAL)", () => {
  it("gives the same routes each time, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const first = nudgeStrategy.run(graph, { ...NUDGE_DEFAULTS });
      expect(nudgeStrategy.run(graph, { ...NUDGE_DEFAULTS })).toEqual(first);
      expect(first.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
    }
  }, 30_000);

  it("gives even free gaps, with the middle of the group in place", () => {
    expect(spread([0, 2, 20], [4, 4, 4], 4)).toEqual([0, 10, 20]);
    expect(spread([0, 1], [4, 8], 4)).toEqual([-4.5, 5.5]);
  });

  it("moves the middle leg of three parallel routes, and keeps the legs at the ends", () => {
    const graph: Graph = { nodes: [], edges: [] };
    const leg = (y: number) => [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y }, { x: 90, y }, { x: 90, y: 50 }, { x: 100, y: 50 }];
    const start = [0, 2, 20].map((y, i) => ({ edge: `e${i}`, points: leg(y) }));
    const out = nudgeRoutes(graph, start, NUDGE_DEFAULTS);
    expect(out.map((r) => r.points[2]!.y)).toEqual([0, 10, 20]);
    expect(out[1]!.points[0]).toEqual({ x: 0, y: 0 });
    expect(out[1]!.points[5]).toEqual({ x: 100, y: 50 });
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(nudgeStrategy, NUDGE_DEFAULTS)).toEqual([]);
    expect(Object.keys(NUDGE_SCHEMA).sort()).toEqual(Object.keys(NUDGE_DEFAULTS).sort());
  });
});
