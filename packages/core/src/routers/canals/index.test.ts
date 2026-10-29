import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import type { Edge } from "../../model.ts";
import { checkOptions } from "../../strategies/options.ts";
import type { Way } from "../shared.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";
import { CANAL_DEFAULTS, CANAL_SCHEMA, canalHubs, canalRouter, canalStrategy, halfPower } from "./index.ts";

/** This function gives a found way of an edge from `s` to `t` with the key `key`. */
function way(id: string, s: string, t: string, key: string): Way {
  const edge: Edge = { id, source: { node: s }, target: { node: t } };
  return { edge, key, ps: undefined, pt: undefined, seq: [], ids: [0, 1], found: true } as unknown as Way;
}

describe("the router canals (NAT-004)", () => {
  it("gives the powers of the flux with only products and square roots", () => {
    for (const x of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
      for (const mu of [1, 1.5, 2, 2.5, 3]) expect(halfPower(x, mu)).toBeCloseTo(x ** mu, 12);
    }
    expect(halfPower(0.5, 2)).toBe(0.25);
  });

  it("gives a hub for each node with enough edges of one key", () => {
    const ways = [way("a", "h", "x", "p"), way("b", "y", "h", "p"), way("c", "h", "z", "p"), way("d", "h", "w", "q"), way("e", "u", "v", "p"), way("f", "h", "x", "\u0000f")];
    const hubs = canalHubs(ways, 3);
    expect(hubs.map((h) => [h.node, h.key, h.ways.map((w) => w.edge.id)])).toEqual([["h", "p", ["a", "b", "c"]]]);
    expect(canalHubs(ways, 4)).toEqual([]);
  });

  it("gives the same routes each time, with no break of a hard rule", () => {
    for (const graph of [hub, clustered]) {
      const first = canalStrategy.run(graph, { ...CANAL_DEFAULTS });
      expect(canalStrategy.run(graph, { ...CANAL_DEFAULTS })).toEqual(first);
      expect(first.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
    }
  }, 60_000);

  it("changes some ways of shared on a board with hubs", () => {
    const shared = sharedRouter({ name: "x", rule: byCollection }).route(clustered);
    const before = new Map(shared.routes.map((r) => [r.edge, JSON.stringify(r.points)]));
    const changed = canalRouter({ name: "x", rule: byCollection }).route(clustered).routes.filter((r) => before.get(r.edge) !== JSON.stringify(r.points)).length;
    expect(changed).toBeGreaterThan(0);
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(canalStrategy, CANAL_DEFAULTS)).toEqual([]);
    expect(Object.keys(CANAL_SCHEMA).sort()).toEqual(Object.keys(CANAL_DEFAULTS).sort());
  });
});
