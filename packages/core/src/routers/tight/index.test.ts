import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { checkOptions } from "../../strategies/options.ts";
import { TIGHT_DEFAULTS, TIGHT_SCHEMA, tightStrategy } from "./index.ts";

describe("the router tight (WILD-023)", () => {
  it("gives the same routes each time, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const first = tightStrategy.run(graph, { ...TIGHT_DEFAULTS });
      expect(tightStrategy.run(graph, { ...TIGHT_DEFAULTS })).toEqual(first);
      expect(first.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
    }
  }, 30_000);

  it("changes the order, and thus the routes, when the first edges change", () => {
    const tight = tightStrategy.run(clustered, { ...TIGHT_DEFAULTS });
    const loose = tightStrategy.run(clustered, { ...TIGHT_DEFAULTS, first: "loose", ties: "id" });
    expect(loose.routes).not.toEqual(tight.routes);
  }, 30_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(tightStrategy, TIGHT_DEFAULTS)).toEqual([]);
    expect(Object.keys(TIGHT_SCHEMA).sort()).toEqual(Object.keys(TIGHT_DEFAULTS).sort());
  });
});
