import { describe, expect, it } from "vitest";
import { FIXTURES, makeFixture } from "./fixtures.ts";

const small = FIXTURES.filter((f) => f.nodes <= 1000);

describe("makeFixture", () => {
  it.each(small.map((f) => [f.name, f] as const))("%s gives the same graph each time", (_, spec) => {
    expect(JSON.stringify(makeFixture(spec))).toBe(JSON.stringify(makeFixture(spec)));
  });

  it.each(small.map((f) => [f.name, f] as const))("%s has the nodes it asks for, with no overlap", (_, spec) => {
    const g = makeFixture(spec);
    expect(g.nodes.length).toBe(spec.nodes);
    const sorted = [...g.nodes].sort((a, b) => a.box.x - b.box.x);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i]!.box;
      for (let j = i + 1; j < sorted.length && sorted[j]!.box.x < a.x + a.w; j++) {
        const b = sorted[j]!.box;
        expect(a.y < b.y + b.h && b.y < a.y + a.h, `${sorted[i]!.id} and ${sorted[j]!.id} overlap`).toBe(false);
      }
    }
  });

  it.each(small.map((f) => [f.name, f] as const))("%s has valid edges with no repeated pair", (_, spec) => {
    const g = makeFixture(spec);
    const ids = new Set(g.nodes.map((n) => n.id));
    const pairs = new Set<string>();
    for (const e of g.edges) {
      expect(ids.has(e.source.node) && ids.has(e.target.node)).toBe(true);
      expect(e.source.node).not.toBe(e.target.node);
      const k = [e.source.node, e.target.node].sort().join("|");
      expect(pairs.has(k)).toBe(false);
      pairs.add(k);
    }
    expect(g.edges.length).toBeGreaterThan(spec.nodes * spec.edgesPerNode * 0.9);
  });

  it("gives fan-outs to one collection in the collections kind", () => {
    const g = makeFixture(FIXTURES.find((f) => f.name === "mid-fanout")!);
    const groups = new Map<string, number>();
    for (const e of g.edges) {
      const k = `${e.source.node}|${String(e.data?.["collection"])}`;
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }
    const fans = [...groups.values()].filter((n) => n >= 4).length;
    expect(fans).toBeGreaterThan(50);
  });

  it("gives fixed plugs on the side of the box", () => {
    const g = makeFixture(FIXTURES.find((f) => f.name === "small-clustered")!);
    const fixed = g.nodes.filter((n) => n.ports);
    expect(fixed.length).toBeGreaterThan(5);
    for (const n of fixed) {
      const at = n.ports![0]!.at!;
      const onSide = at.x === 0 || at.y === 0 || at.x === n.box.w || at.y === n.box.h;
      expect(onSide).toBe(true);
    }
  });
});
