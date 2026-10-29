import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { checkOptions } from "../../strategies/options.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";
import { REROUTE_DEFAULTS, REROUTE_SCHEMA, rerouteRouter, rerouteStrategy, turnsOf } from "./index.ts";

describe("the router reroute (RULE-044)", () => {
  it("counts the turns of a way", () => {
    const l = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
    ];
    expect(turnsOf(l)).toBe(2);
    expect(turnsOf(l.slice(0, 3))).toBe(0);
  });

  it("gives the same routes each time, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const first = rerouteStrategy.run(graph, { ...REROUTE_DEFAULTS });
      expect(rerouteStrategy.run(graph, { ...REROUTE_DEFAULTS })).toEqual(first);
      expect(first.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
    }
  }, 30_000);

  it("changes some ways of shared, and more ways with more rounds and a larger share", () => {
    const shared = sharedRouter({ name: "x", rule: byCollection }).route(clustered);
    const before = new Map(shared.routes.map((r) => [r.edge, JSON.stringify(r.points)]));
    const changed = (q: number, rounds: number): number =>
      rerouteRouter({ name: "x", rule: byCollection, rounds, q })
        .route(clustered)
        .routes.filter((r) => before.get(r.edge) !== JSON.stringify(r.points)).length;
    const few = changed(0.05, 1);
    expect(few).toBeGreaterThan(0);
    expect(changed(0.3, 5)).toBeGreaterThanOrEqual(few);
  }, 30_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(rerouteStrategy, REROUTE_DEFAULTS)).toEqual([]);
    expect(Object.keys(REROUTE_SCHEMA).sort()).toEqual(Object.keys(REROUTE_DEFAULTS).sort());
  });
});
