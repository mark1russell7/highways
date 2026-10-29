import { describe, expect, it } from "vitest";
import { documentHash } from "../bench/screen/hash.ts";
import type { Box } from "../geom.ts";
import { splitFrames, type Graph } from "../model.ts";
import { COVERAGE_FAMILIES, highwaysRegistry } from "./index.ts";

const reg = highwaysRegistry();

/** The digest of the graph of each family at its defaults and the seed 0, with its counts of nodes and edges. */
const DIGESTS: Readonly<Record<string, readonly [string, number, number]>> = {
  "frame-rows": ["cc9f54d28df0bb61", 54, 31],
  pipeline: ["d20a347c02cec0c7", 72, 79],
  "fan-out": ["688a72b7b9627ab4", 97, 104],
  "two-hubs": ["4942511e372cdb37", 74, 121],
  "uneven-sizes": ["31a1d6166bf1b7a6", 94, 128],
  "thin-bars": ["fa8f1738860fe88f", 80, 60],
  "sparse-long": ["29757b9ca24567cb", 36, 32],
  "local-mesh": ["472963ea411dd3ed", 108, 177],
  bipartite: ["ef4334622bd77a9f", 36, 57],
};

const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a: Box, b: Box): boolean => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

/** This function gives the pairs of boxes that overlap. A node and its frame do not count, because the frame holds the node. */
function overlaps(g: Graph): string[] {
  const out: string[] = [];
  for (let i = 0; i < g.nodes.length; i++)
    for (let j = i + 1; j < g.nodes.length; j++) {
      const a = g.nodes[i]!;
      const b = g.nodes[j]!;
      if (a.parent === b.id || b.parent === a.id) continue;
      if (overlap(a.box, b.box)) out.push(`${a.id} ${b.id}`);
    }
  return out;
}

describe("the families of CORPUS-FAMILIES", () => {
  it("has 9 families, each exact, of version 1 and owned by highways", () => {
    expect(COVERAGE_FAMILIES.map((f) => f.name)).toEqual(Object.keys(DIGESTS));
    for (const f of COVERAGE_FAMILIES) expect([f.version, f.owner, f.crossEngine], f.name).toEqual([1, "highways", "exact"]);
  });

  it("gives the same board for the seed 0 at the defaults: the digest of each family", () => {
    for (const f of COVERAGE_FAMILIES) {
      const { graph, generator } = reg.generate(f.name, 0);
      expect([documentHash(graph), graph.nodes.length, graph.edges.length], f.name).toEqual(DIGESTS[f.name]);
      expect(generator, f.name).toEqual({ name: `family.${f.name}`, version: 1, params: {}, seed: 0 });
      expect(reg.generate(f.name, 0), f.name).toEqual(reg.generate(f.name, 0));
    }
  });

  it("gives boxes that do not overlap, at the defaults and at each boundary cell, for 3 seeds", () => {
    for (const f of COVERAGE_FAMILIES)
      for (const dims of [{}, { layout: "mixed" }, ...reg.boundaryCells(f.name)]) {
        if ("layout" in dims && f.name !== "bipartite") continue;
        for (const seed of [0, 1, 2]) expect(overlaps(reg.generate(f.name, seed, dims).graph), `${f.name} ${JSON.stringify(dims)} ${seed}`).toEqual([]);
      }
  });

  it("puts each row of `frame-rows` inside its card, with a plug on each wall for each row", () => {
    const g = reg.generate("frame-rows", 0, { inner: 4 }).graph;
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const rows = g.nodes.filter((n) => n.parent !== undefined);
    expect(rows).toHaveLength(45);
    for (const r of rows) expect(inside(r.box, byId.get(r.parent!)!.box), r.id).toBe(true);
    for (const card of g.nodes.filter((n) => n.parent === undefined)) expect(card.ports?.map((p) => p.side), card.id).toEqual(Array.from({ length: 5 }, () => ["east", "west"]).flat());
    // Each edge from a row is an inner edge of its card. The other edges join plugs of two cards.
    const { inner } = splitFrames(g);
    expect(inner.length).toBe(g.edges.filter((e) => byId.get(e.source.node)?.parent !== undefined).length);
    expect(inner.length).toBeGreaterThan(0);
    expect(splitFrames(reg.generate("frame-rows", 0).graph).inner).toEqual([]);
  });

  it("gives `bipartite` each edge between its two sides, in both layouts", () => {
    for (const layout of ["rows", "mixed"]) {
      const g = reg.generate("bipartite", 3, { layout, left: 4, right: 5 }).graph;
      const pairs = new Set(g.edges.map((e) => `${e.source.node}|${e.target.node}`));
      for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) expect(pairs.has(`a${i}|b${j}`), `${layout} a${i} b${j}`).toBe(true);
    }
  });

  it("gives `fan-out` a link from the hub to each leaf, and `pipeline` a link from each stage to the next stage", () => {
    const fan = reg.generate("fan-out", 0, { cross: 0 }).graph;
    expect(fan.edges.map((e) => e.source.node)).toEqual(Array.from({ length: 96 }, () => "hub"));
    const chain = reg.generate("pipeline", 0, { skips: 0 }).graph;
    expect(chain.edges.map((e) => [e.source.node, e.target.node])).toEqual(Array.from({ length: 71 }, (_, i) => [`s${i}`, `s${i + 1}`]));
  });
});
