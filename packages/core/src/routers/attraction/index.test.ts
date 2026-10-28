import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { checkOptions } from "../../strategies/options.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";
import { ATTRACTION_DEFAULTS, ATTRACTION_SCHEMA, attractionRouter, attractionStrategy } from "./index.ts";

describe("the router attraction (HWY-044)", () => {
  it("gives the routes of shared with one pass, no pull and no capacity cost", () => {
    const plain = sharedRouter({ name: "shared", rule: byCollection }).route(clustered);
    const same = attractionRouter({ name: "shared", rule: byCollection, passes: 1, attraction: 0, capacityWeight: 0 }).route(clustered);
    expect(same).toEqual(plain);
  });

  it("gives the same routes each time, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const first = attractionStrategy.run(graph, { ...ATTRACTION_DEFAULTS });
      expect(attractionStrategy.run(graph, { ...ATTRACTION_DEFAULTS })).toEqual(first);
      expect(first.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
    }
  }, 30_000);

  it("changes the routes when the passes and the pull change", () => {
    const one = attractionStrategy.run(clustered, { ...ATTRACTION_DEFAULTS, passes: 1, attraction: 0 });
    const more = attractionStrategy.run(clustered, { ...ATTRACTION_DEFAULTS, passes: 4, attraction: 1, capacityWeight: 4 });
    expect(more.routes).not.toEqual(one.routes);
  }, 30_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(attractionStrategy, ATTRACTION_DEFAULTS)).toEqual([]);
    expect(Object.keys(ATTRACTION_SCHEMA).sort()).toEqual(Object.keys(ATTRACTION_DEFAULTS).sort());
  });
});
