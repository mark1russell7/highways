import { describe, expect, it } from "vitest";
import { makeFixture, type FixtureKind } from "./fixtures.ts";
import { center, type Box } from "./geom.ts";
import type { Node } from "./model.ts";
import { allSections, buildSections, treeDepth } from "./sections.ts";

const node = (id: string, x: number, y: number): Node => ({ id, box: { x, y, w: 40, h: 20 } });
const inside = (b: Box, p: { x: number; y: number }): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

describe("buildSections", () => {
  it("splits the nodes into a tree (property, 5 kinds × 3 seeds)", () => {
    const kinds: FixtureKind[] = ["uniform", "clustered", "grid", "hubs", "collections"];
    for (const kind of kinds) {
      for (let seed = 1; seed <= 3; seed++) {
        const g = makeFixture({ name: "t", kind, nodes: 300, edgesPerNode: 1, seed });
        const root = buildSections(g.nodes, { cap: 6 });
        const seen = new Array<number>(g.nodes.length).fill(0);
        for (const s of allSections(root)) {
          for (const i of s.nodes) expect(inside(s.cell, center(g.nodes[i]!.box)), `${kind} ${seed} ${s.id}`).toBe(true);
          if (s.children.length === 0) {
            expect(s.nodes.length, `${kind} ${seed} ${s.id}`).toBeLessThanOrEqual(6);
            for (const i of s.nodes) seen[i]!++;
            continue;
          }
          // The children split the nodes of their parent.
          expect(s.children.flatMap((c) => c.nodes).sort((a, b) => a - b)).toEqual([...s.nodes].sort((a, b) => a - b));
          for (const c of s.children) {
            expect(c.depth).toBe(s.depth + 1);
            expect(c.id).toMatch(new RegExp(`^${s.id}[0-3]$`));
          }
        }
        // Each node is in exactly one leaf.
        expect(seen.every((n) => n === 1), `${kind} ${seed}`).toBe(true);
      }
    }
  });

  it("does not make a level for a cell whose nodes are all in one quarter", () => {
    // Nine nodes near the origin and one node far away. The near cell shrinks four times before it splits.
    const nodes = [...Array.from({ length: 9 }, (_, i) => node(`n${i}`, (i % 3) * 50, Math.floor(i / 3) * 30)), node("far", 2000, 2000)];
    const root = buildSections(nodes, { cap: 4 });
    expect(root.children.map((c) => c.nodes.length)).toEqual([9, 1]);
    expect(treeDepth(root)).toBe(2);
  });

  it("stops at the largest depth", () => {
    const nodes = Array.from({ length: 50 }, (_, i) => node(`n${i}`, i * 3, i * 3));
    const root = buildSections(nodes, { cap: 1, maxDepth: 3 });
    expect(treeDepth(root)).toBeLessThanOrEqual(3);
  });
});
