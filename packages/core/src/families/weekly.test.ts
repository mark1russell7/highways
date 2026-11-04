import { describe, expect, it } from "vitest";
import { documentHash } from "../bench/screen/hash.ts";
import { SCREEN_SETS } from "../bench/screen/set.ts";
import type { Box } from "../geom.ts";
import type { Graph } from "../model.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry, WEEKLY_FAMILIES } from "./index.ts";
import { cutMaze } from "./weekly.ts";

const reg = highwaysRegistry();

/** The digest of the graph of each family at its defaults and the seed 0, with its counts of nodes and edges. */
const DIGESTS: Readonly<Record<string, readonly [string, number, number]>> = {
  bottleneck: ["39ecce7a699a7de6", 50, 45],
  "parallel-edges": ["70d01b6efcab602c", 48, 82],
  maze: ["0e0a3a5343a13867", 41, 15],
  channel: ["5296fc30bdd9be46", 32, 24],
  comb: ["4641bb3c97cfb4e0", 30, 15],
  spiral: ["323f37b3b4588463", 36, 13],
};

const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** This function gives the pairs of boxes that overlap. */
function overlaps(g: Graph): string[] {
  const out: string[] = [];
  for (let i = 0; i < g.nodes.length; i++) for (let j = i + 1; j < g.nodes.length; j++) if (overlap(g.nodes[i]!.box, g.nodes[j]!.box)) out.push(`${g.nodes[i]!.id} ${g.nodes[j]!.id}`);
  return out;
}

/** This function gives the box of a node. */
const boxOf = (g: Graph, id: string): Box => g.nodes.find((n) => n.id === id)!.box;

/** This function gives the count of the walls that the walk opened: the false values of the table outside the cells. */
const openings = (table: readonly (readonly boolean[])[]): number => table.flatMap((row, y) => row.filter((solid, x) => !solid && (x % 2 === 0 || y % 2 === 0))).length;

/** This function gives the count of the cells that a walk from the first cell reaches through the open walls. */
function reached(table: readonly (readonly boolean[])[]): number {
  const seen = new Set(["1,1"]);
  const todo: (readonly [number, number])[] = [[1, 1]];
  while (todo.length > 0) {
    const [x, y] = todo.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const key = `${x + 2 * dx},${y + 2 * dy}`;
      if (!table[y + dy]![x + dx]! && !seen.has(key)) {
        seen.add(key);
        todo.push([x + 2 * dx, y + 2 * dy]);
      }
    }
  }
  return seen.size;
}

describe("the families of FAMILIES-WEEKLY", () => {
  it("has 6 families at the end of HIGHWAYS_FAMILIES, each exact, of version 1 and owned by highways", () => {
    expect(WEEKLY_FAMILIES.map((f) => f.name)).toEqual(Object.keys(DIGESTS));
    expect(HIGHWAYS_FAMILIES.slice(-6)).toEqual(WEEKLY_FAMILIES);
    for (const f of WEEKLY_FAMILIES) expect([f.version, f.owner, f.crossEngine], f.name).toEqual([1, "highways", "exact"]);
  });

  it("puts no weekly family into a screen set", () => {
    const names = Object.values(SCREEN_SETS).flatMap((set) => set.families.map((f) => f.name));
    for (const f of WEEKLY_FAMILIES) expect(names, f.name).not.toContain(f.name);
  });

  it("gives the same board for the seed 0 at the defaults: the digest of each family", () => {
    for (const f of WEEKLY_FAMILIES) {
      const { graph, generator } = reg.generate(f.name, 0);
      expect([documentHash(graph), graph.nodes.length, graph.edges.length], f.name).toEqual(DIGESTS[f.name]);
      expect(generator, f.name).toEqual({ name: `family.${f.name}`, version: 1, params: {}, seed: 0 });
      expect(reg.generate(f.name, 0), f.name).toEqual(reg.generate(f.name, 0));
    }
  });

  it("gives boxes that do not overlap and edges with their own ids, at the defaults and at each boundary cell, for 3 seeds", () => {
    for (const f of WEEKLY_FAMILIES)
      for (const dims of reg.boundaryCells(f.name))
        for (const seed of [0, 1, 2]) {
          const { graph } = reg.generate(f.name, seed, dims);
          const where = `${f.name} ${JSON.stringify(dims)} ${seed}`;
          expect(overlaps(graph), where).toEqual([]);
          expect(new Set(graph.edges.map((e) => e.id)).size, where).toBe(graph.edges.length);
          for (const n of graph.nodes) expect(n.box.x >= 0 && n.box.y >= 0 && n.box.w > 0 && n.box.h > 0, `${where} ${n.id}`).toBe(true);
        }
  });

  it("gives `bottleneck` one door of the given width, a wall past both regions, and each edge across the wall", () => {
    for (const seed of [0, 1, 2]) {
      const g = reg.generate("bottleneck", seed, { door: 30, overhang: 200, wall: 16 }).graph;
      const north = boxOf(g, "wall-n");
      const south = boxOf(g, "wall-s");
      expect(south.y - (north.y + north.h)).toBe(30);
      expect([north.x, north.w]).toEqual([south.x, 16]);
      const others = g.nodes.filter((n) => !n.id.startsWith("wall"));
      expect(others.filter((n) => n.box.x + n.box.w <= north.x).map((n) => n.id[0])).toEqual(others.filter((n) => n.id.startsWith("a")).map(() => "a"));
      expect(others.filter((n) => n.box.x >= north.x + north.w).map((n) => n.id[0])).toEqual(others.filter((n) => n.id.startsWith("b")).map(() => "b"));
      expect(Math.min(...others.map((n) => n.box.y)) - north.y).toBeGreaterThanOrEqual(200);
      expect(south.y + south.h - Math.max(...others.map((n) => n.box.y + n.box.h))).toBeGreaterThanOrEqual(200);
      for (const e of g.edges) expect([e.source.node[0], e.target.node[0]]).toEqual(["a", "b"]);
    }
  });

  it("gives `channel` fixed plugs that face the channel, one edge for each plug, and no edge past `span`", () => {
    for (const seed of [0, 1, 2]) {
      const g = reg.generate("channel", seed, { cols: 12, nets: 200, pins: 3, span: 2 }).graph;
      expect(g.nodes).toHaveLength(24);
      const used = g.edges.flatMap((e) => [`${e.source.node}:${e.source.port}`, `${e.target.node}:${e.target.port}`]);
      expect(new Set(used).size, `${seed}`).toBe(used.length);
      for (const e of g.edges) {
        expect([e.source.node[0], e.target.node[0]]).toEqual(["n", "s"]);
        expect(Math.abs(Number(e.source.node.slice(1)) - Number(e.target.node.slice(1)))).toBeLessThanOrEqual(2);
      }
      expect(g.edges.length).toBeLessThanOrEqual(36);
    }
    expect(boxOf(reg.generate("channel", 0, { height: 50 }).graph, "s0").y - 40).toBe(50);
  });

  it("makes `comb` one corridor: the teeth of a comb touch its back, and a tooth reaches past the tip of the next one", () => {
    const g = reg.generate("comb", 0, { teeth: 4, depth: 200, slot: 60, tooth: 10, clear: 30 }).graph;
    const up = boxOf(g, "up1");
    const low = boxOf(g, "low1");
    const backN = boxOf(g, "back-n");
    const backS = boxOf(g, "back-s");
    expect(up.y).toBe(backN.y + backN.h);
    expect(low.y + low.h).toBe(backS.y);
    expect(low.x - (up.x + up.w)).toBe(60);
    expect(low.y - backN.h).toBe(30);
    expect(up.y + up.h).toBeGreaterThan(low.y);
    expect(backS.y - (up.y + up.h)).toBe(30);
  });

  it("gives each piece of the `spiral` wall a touch with the next piece, and the corridor its width between two arms", () => {
    const corridor = 80;
    const wall = 10;
    const g = reg.generate("spiral", 0, { turns: 3, corridor, wall, nodes: 4, edges: 0 }).graph;
    const box = (i: number): Box => boxOf(g, `wall${i}`);
    expect(g.nodes.filter((n) => n.id.startsWith("wall"))).toHaveLength(12);
    for (let i = 0; i + 1 < 12; i++) {
      const [a, b] = [box(i), box(i + 1)];
      const touches = (a.x + a.w === b.x || b.x + b.w === a.x || a.y + a.h === b.y || b.y + b.h === a.y) && !overlap(a, b);
      expect(touches, `${i}`).toBe(true);
    }
    expect(box(0).y - (box(4).y + box(4).h)).toBe(corridor);
    expect(box(1).x - (box(5).x + box(5).w) === corridor || box(5).x - (box(1).x + box(1).w) === corridor).toBe(true);
  });

  it("gives `parallel-edges` the same two ends for each copy of a pair, with no fixed plug", () => {
    const g = reg.generate("parallel-edges", 0, { pairs: 5, copies: 7, others: 3, extra: 0, back: 0.5 }).graph;
    expect(g.nodes).toHaveLength(13);
    expect(g.edges).toHaveLength(35);
    const pairOf = (id: string): string => id.slice(1);
    const sizes = new Map<string, number>();
    for (const e of g.edges) {
      expect(pairOf(e.source.node)).toBe(pairOf(e.target.node));
      expect(e.source.port ?? e.target.port).toBeUndefined();
      sizes.set(pairOf(e.source.node), (sizes.get(pairOf(e.source.node)) ?? 0) + 1);
    }
    expect([...sizes.values()]).toEqual([7, 7, 7, 7, 7]);
    expect(new Set(g.edges.map((e) => e.source.node[0]))).toEqual(new Set(["a", "b"]));
    // The edges of a pair are not all next to each other in the list.
    expect(g.edges.filter((e, i) => i > 0 && pairOf(e.source.node) === pairOf(g.edges[i - 1]!.source.node)).length).toBeLessThan(28);
  });

  it("gives `parallel-edges` the direction of each edge from the dimension `back`", () => {
    const sources = (back: number): Set<string> => new Set(reg.generate("parallel-edges", 1, { back, extra: 0 }).graph.edges.map((e) => e.source.node[0]!));
    expect(sources(0)).toEqual(new Set(["a"]));
    expect(sources(1)).toEqual(new Set(["b"]));
  });

  it("cuts a maze with one way between each two cells at `loops` 0, and tries for more doors with `loops`", () => {
    for (const seed of [0, 1, 2, 3]) {
      const stream = reg.rngOf("maze")(seed);
      const perfect = cutMaze(stream, 9, 5, 0);
      expect(openings(perfect)).toBe(9 * 5 - 1);
      expect(reached(perfect)).toBe(9 * 5);
      expect(perfect[0]!.every(Boolean) && perfect[10]!.every(Boolean) && perfect.every((row) => row[0]! && row[18]!)).toBe(true);
      expect(openings(cutMaze(reg.rngOf("maze")(seed), 9, 5, 30))).toBeGreaterThan(9 * 5 - 1);
    }
  });

  it("makes the walls of `maze` from its table: the boxes cover each wall piece one time, and they leave each cell free", () => {
    for (const seed of [0, 1, 2]) {
      const dims = { cols: 7, rows: 4, corridor: 60, wall: 10, loops: 3 };
      const g = reg.generate("maze", seed, dims).graph;
      const table = cutMaze(reg.rngOf("maze")(seed, dims), 7, 4, 3);
      const walls = g.nodes.filter((n) => n.id.startsWith("w"));
      const pitch = 70;
      const middle = (i: number): number => Math.floor(i / 2) * pitch + (i % 2 === 0 ? 5 : 40);
      table.forEach((row, y) =>
        row.forEach((solid, x) => {
          const p = { x: middle(x), y: middle(y) };
          const hits = walls.filter((n) => p.x > n.box.x && p.x < n.box.x + n.box.w && p.y > n.box.y && p.y < n.box.y + n.box.h);
          expect(hits.length, `${seed} ${x} ${y}`).toBe(solid ? 1 : 0);
        }),
      );
    }
  });

  it("puts each node of `maze` in its own cell, and gives no more nodes than cells", () => {
    expect(reg.generate("maze", 0, { cols: 2, rows: 2, nodes: 60 }).graph.nodes.filter((n) => n.id.startsWith("n"))).toHaveLength(4);
    const g = reg.generate("maze", 3, { corridor: 90, wall: 10 }).graph;
    const nodes = g.nodes.filter((n) => n.id.startsWith("n"));
    expect(nodes).toHaveLength(12);
    expect(new Set(nodes.map((n) => `${Math.floor(n.box.x / 100)},${Math.floor(n.box.y / 100)}`)).size).toBe(12);
    for (const n of nodes) {
      expect(n.box.x % 100).toBeGreaterThanOrEqual(10);
      expect(n.box.y % 100).toBeGreaterThanOrEqual(10);
      expect(n.box.x % 100 + n.box.w).toBeLessThanOrEqual(100);
      expect(n.box.y % 100 + n.box.h).toBeLessThanOrEqual(100);
    }
  });
});
