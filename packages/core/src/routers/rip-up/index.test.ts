import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { checkOptions } from "../../strategies/options.ts";
import { byCollection } from "../trunks.ts";
import { RIP_UP_DEFAULTS, RIP_UP_SCHEMA, ripUpRouter, ripUpStrategy } from "./index.ts";

describe("the router rip-up (EDA-010)", () => {
  it("gives the same routes each time, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const first = ripUpStrategy.run(graph, { ...RIP_UP_DEFAULTS });
      expect(ripUpStrategy.run(graph, { ...RIP_UP_DEFAULTS })).toEqual(first);
      expect(first.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
    }
  }, 60_000);

  it("gives valid routes for each order, scope and seed", () => {
    for (const order of ["fault", "seed"] as const) {
      for (const scope of ["fault", "neighbours"] as const) {
        for (const seed of [0, 1]) {
          const r = ripUpRouter({ name: "x", rule: byCollection, order, scope, seed, rounds: 1 }).route(clustered);
          expect(r.routes.length).toBe(clustered.edges.length);
          expect(checkProperties(clustered, r, 1_000_000), `${order} ${scope} ${seed}`).toEqual([]);
        }
      }
    }
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(ripUpStrategy, RIP_UP_DEFAULTS)).toEqual([]);
    expect(Object.keys(RIP_UP_SCHEMA).sort()).toEqual(Object.keys(RIP_UP_DEFAULTS).sort());
  });
});
