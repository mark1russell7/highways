import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { measureQuality } from "../../bench/quality.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { checkOptions } from "../../strategies/options.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";
import { ADAM_DEFAULTS, ADAM_SCHEMA, adamRouter, adamStrategy } from "./index.ts";

describe("the router adam (RULE-020)", () => {
  it("gives the same routes for the same seed, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const first = adamStrategy.run(graph, { ...ADAM_DEFAULTS });
      expect(adamStrategy.run(graph, { ...ADAM_DEFAULTS })).toEqual(first);
      expect(first.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
    }
  }, 60_000);

  it("moves some legs of shared, keeps the runs and the bundles, and adds no crossing", () => {
    const shared = sharedRouter({ name: "x", rule: byCollection }).route(clustered);
    const out = adamRouter({ name: "x", rule: byCollection }).route(clustered);
    const before = new Map(shared.routes.map((r) => [r.edge, JSON.stringify(r.points)]));
    expect(out.routes.filter((r) => before.get(r.edge) !== JSON.stringify(r.points)).length).toBeGreaterThan(0);
    expect(out.runs).toEqual(shared.runs);
    expect(out.bundles).toEqual(shared.bundles);
    expect(measureQuality(clustered, out).crossings).toBeLessThanOrEqual(measureQuality(clustered, shared).crossings);
  }, 60_000);

  it("gives other routes for another seed", () => {
    const a = adamRouter({ name: "x", rule: byCollection, seed: 1 }).route(clustered);
    const b = adamRouter({ name: "x", rule: byCollection, seed: 2 }).route(clustered);
    expect(JSON.stringify(a.routes)).not.toBe(JSON.stringify(b.routes));
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(adamStrategy, ADAM_DEFAULTS)).toEqual([]);
    expect(Object.keys(ADAM_SCHEMA).sort()).toEqual(Object.keys(ADAM_DEFAULTS).sort());
  });
});
