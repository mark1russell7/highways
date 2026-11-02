import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { checkOptions } from "../../strategies/options.ts";
import { SPRINGS_DEFAULTS, SPRINGS_SCHEMA, springsStrategy } from "./index.ts";

describe("the router springs (PHYSICAL)", () => {
  it("gives the same routes each time, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const first = springsStrategy.run(graph, { ...SPRINGS_DEFAULTS });
      expect(springsStrategy.run(graph, { ...SPRINGS_DEFAULTS })).toEqual(first);
      expect(first.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
    }
  }, 30_000);

  it("keeps the routes of shared with no steps", () => {
    const none = springsStrategy.run(hub, { ...SPRINGS_DEFAULTS, iterations: 0 });
    const some = springsStrategy.run(hub, { ...SPRINGS_DEFAULTS });
    expect(some.routes).not.toEqual(none.routes);
  }, 30_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(springsStrategy, SPRINGS_DEFAULTS)).toEqual([]);
    expect(Object.keys(SPRINGS_SCHEMA).sort()).toEqual(Object.keys(SPRINGS_DEFAULTS).sort());
  });
});
