import { describe, expect, it } from "vitest";
import { documentHash } from "../bench/screen/hash.ts";
import { SCREEN_SETS } from "../bench/screen/set.ts";
import type { Box } from "../geom.ts";
import type { Graph } from "../model.ts";
import { sectionsRouter } from "../routers/index.ts";
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
  switchbox: ["65fc74a2940fe92c", 44, 16],
  escape: ["8314365f93e18055", 130, 30],
  rings: ["d8e600cad6562d6b", 35, 13],
  "walled-level": ["150c7fb2761dd0f9", 50, 13],
  layered: ["e0505a42708137f6", 24, 29],
  "lattice-x": ["85b850f156c7175e", 35, 33],
  "arc-row": ["7bd05f341217b6fd", 24, 23],
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
  it("has 13 families at the end of HIGHWAYS_FAMILIES, each exact, of version 1 and owned by highways", () => {
    expect(WEEKLY_FAMILIES.map((f) => f.name)).toEqual(Object.keys(DIGESTS));
    expect(HIGHWAYS_FAMILIES.slice(-13)).toEqual(WEEKLY_FAMILIES);
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

  it("gives `switchbox` one fixed plug into the box on each pin, and one edge for each pin at most", () => {
    for (const seed of [0, 1, 2]) {
      const g = reg.generate("switchbox", seed, { pins: 6, nets: 80, blocks: 0 }).graph;
      expect(g.nodes).toHaveLength(24);
      expect(g.edges).toHaveLength(12);
      const used = g.edges.flatMap((e) => [e.source.node, e.target.node]);
      expect(new Set(used).size, `${seed}`).toBe(24);
      const sideOf: Record<string, string> = { n: "south", s: "north", w: "east", e: "west" };
      for (const n of g.nodes) expect(n.ports?.map((p) => p.side)).toEqual([sideOf[n.id[0]!]]);
    }
  });

  it("keeps the blocks of `switchbox` inside the box and apart", () => {
    const g = reg.generate("switchbox", 1, { pins: 8, pitch: 40, blocks: 16 }).graph;
    const blocks = g.nodes.filter((n) => n.id.startsWith("b"));
    expect(blocks).toHaveLength(16);
    const pins = g.nodes.filter((n) => !n.id.startsWith("b"));
    for (const [i, a] of blocks.entries()) {
      for (const p of pins) expect(overlap(a.box, p.box), `${a.id} ${p.id}`).toBe(false);
      for (const c of blocks.slice(i + 1)) expect(overlap(a.box, c.box), `${a.id} ${c.id}`).toBe(false);
    }
  });

  it("gives each edge of `escape` one pad and its own terminal, and the terminals stay out of the pads", () => {
    for (const seed of [0, 1, 2]) {
      const g = reg.generate("escape", seed, { cols: 5, rows: 4, nets: 400 }).graph;
      const pads = g.nodes.filter((n) => n.id.startsWith("p"));
      const terminals = g.nodes.filter((n) => n.id.startsWith("t"));
      expect(pads).toHaveLength(20);
      expect(terminals).toHaveLength(20);
      expect(g.edges).toHaveLength(20);
      expect(new Set(g.edges.map((e) => e.target.node)).size).toBe(20);
      expect(new Set(g.edges.map((e) => e.source.node)).size).toBe(20);
      for (const [i, a] of g.nodes.entries()) for (const c of g.nodes.slice(i + 1)) expect(overlap(a.box, c.box), `${a.id} ${c.id}`).toBe(false);
    }
  });

  /** This function tells if a point of the plane is in a wall of the board. */
  const inWall = (g: Graph, x: number, y: number): boolean => g.nodes.some((n) => n.id.startsWith("wall") && x >= n.box.x && x < n.box.x + n.box.w && y >= n.box.y && y < n.box.y + n.box.h);

  it("closes each ring of `rings` but for one door, so the walls leave one way out of each corridor", () => {
    for (const seed of [0, 1, 2, 3]) {
      const [rings, corridor, wall] = [3, 60, 10];
      const g = reg.generate("rings", seed, { rings, corridor, wall, door: 30, nodes: 2, edges: 0 }).graph;
      const pitch = corridor + wall;
      const mid = rings * pitch;
      for (let k = 0; k < rings; k++) {
        const outer = (k + 1) * pitch;
        const inner = outer - wall;
        // This is one count of free units of each ring, along the middle of its wall.
        let free = 0;
        const line = wall >> 1;
        for (let t = -inner; t < inner; t++) {
          if (!inWall(g, mid + t, mid - outer + line)) free++;
          if (!inWall(g, mid + inner + line, mid + t)) free++;
          if (!inWall(g, mid + t, mid + inner + line)) free++;
          if (!inWall(g, mid - outer + line, mid + t)) free++;
        }
        expect(free, `${seed} ${k}`).toBe(30);
      }
    }
  });

  it("keeps the nodes of `rings` out of the walls and apart", () => {
    for (const seed of [0, 1, 2]) {
      const g = reg.generate("rings", seed, { rings: 5, nodes: 120 }).graph;
      const nodes = g.nodes.filter((n) => n.id.startsWith("n"));
      expect(nodes).toHaveLength(60);
      for (const [i, a] of nodes.entries()) {
        expect(a.box.x).toBeGreaterThanOrEqual(0);
        expect(a.box.y).toBeGreaterThanOrEqual(0);
        for (const w of g.nodes.filter((n) => n.id.startsWith("wall"))) expect(overlap(a.box, w.box), `${a.id} ${w.id}`).toBe(false);
        for (const c of nodes.slice(i + 1)) expect(overlap(a.box, c.box), `${a.id} ${c.id}`).toBe(false);
      }
    }
  });

  it("gives `walled-level` one knot of tiny nodes apart from each box, and edges only between the nodes of the cells", () => {
    for (const seed of [0, 1, 2]) {
      const g = reg.generate("walled-level", seed, { knot: 4 }).graph;
      const knot = g.nodes.filter((n) => /^k\d+$/.test(n.id));
      expect(knot).toHaveLength(16);
      for (const k of knot) {
        expect(Math.max(k.box.w, k.box.h), k.id).toBeLessThanOrEqual(2);
        for (const n of g.nodes) if (n.id !== k.id) expect(overlap(k.box, n.box), `${k.id} ${n.id}`).toBe(false);
      }
      for (const e of g.edges) for (const end of [e.source.node, e.target.node]) expect(end, `${seed}`).toMatch(/^n\d+$/);
    }
  });

  it("makes the section tree of `walled-level` deeper than the tree of `maze` with the same seed", () => {
    const depth = (g: Graph): number => Math.max(...(sectionsRouter({ name: "p", maxNodes: 100_000 }).route(g).levels ?? []).map((l) => l.depth));
    for (const seed of [0, 1, 2]) expect(depth(reg.generate("walled-level", seed).graph), `${seed}`).toBeGreaterThan(depth(reg.generate("maze", seed).graph));
  }, 60_000);

  it("gives each edge of `layered` a way down, no longer than `span`, and only one layer down with `long` 0", () => {
    const layerOf = (id: string): number => Number(id.slice(1, id.indexOf("n")));
    for (const seed of [0, 1, 2]) {
      const g = reg.generate("layered", seed, { layers: 8, span: 4, long: 0.5, edges: 120 }).graph;
      const downs = g.edges.map((e) => layerOf(e.target.node) - layerOf(e.source.node));
      expect(Math.min(...downs), `${seed}`).toBe(1);
      expect(Math.max(...downs), `${seed}`).toBeLessThanOrEqual(4);
      expect(downs.some((d) => d >= 2), `${seed}`).toBe(true);
      for (const n of g.nodes) expect(n.box.y, n.id).toBe(layerOf(n.id) * (36 + 80));
      const flat = reg.generate("layered", seed, { layers: 8, span: 4, long: 0, edges: 120 }).graph;
      for (const e of flat.edges) expect(layerOf(e.target.node) - layerOf(e.source.node)).toBe(1);
    }
  });

  it("gives `lattice-x` both diagonals of each cell with `diagonal` 1, and only the sides with `diagonal` 0 and `side` 1", () => {
    const cell = (id: string): readonly [number, number] => id.slice(1).split("_").map(Number) as unknown as readonly [number, number];
    const full = reg.generate("lattice-x", 0, { cols: 5, rows: 3, diagonal: 1, side: 0 }).graph;
    expect(full.nodes).toHaveLength(6 * 4);
    expect(full.edges).toHaveLength(2 * 5 * 3);
    for (const e of full.edges) {
      const [r1, c1] = cell(e.source.node);
      const [r2, c2] = cell(e.target.node);
      expect([Math.abs(r1 - r2), Math.abs(c1 - c2)]).toEqual([1, 1]);
    }
    const sides = reg.generate("lattice-x", 0, { cols: 5, rows: 3, diagonal: 0, side: 1 }).graph;
    expect(sides.edges).toHaveLength(5 * 4 + 3 * 6);
    for (const e of sides.edges) {
      const [r1, c1] = cell(e.source.node);
      const [r2, c2] = cell(e.target.node);
      expect(Math.abs(r1 - r2) + Math.abs(c1 - c2)).toBe(1);
    }
    expect(boxOf(full, "n1_1")).toEqual({ x: 120, y: 120, w: 24, h: 24 });
  });

  it("puts the nodes of `arc-row` in one row of one height, and keeps each edge within `reach`", () => {
    for (const seed of [0, 1, 2]) {
      const g = reg.generate("arc-row", seed, { nodes: 40, edges: 80, reach: 5, gap: 10 }).graph;
      expect(new Set(g.nodes.map((n) => `${n.box.y} ${n.box.h}`))).toEqual(new Set(["0 32"]));
      for (let i = 1; i < g.nodes.length; i++) expect(g.nodes[i]!.box.x - (g.nodes[i - 1]!.box.x + g.nodes[i - 1]!.box.w)).toBe(10);
      const spans = g.edges.map((e) => Math.abs(Number(e.source.node.slice(1)) - Number(e.target.node.slice(1))));
      expect(Math.max(...spans), `${seed}`).toBeLessThanOrEqual(5);
      expect(Math.min(...spans), `${seed}`).toBeGreaterThanOrEqual(1);
    }
    const near = reg.generate("arc-row", 0, { nodes: 40, edges: 80, reach: 1 }).graph;
    for (const e of near.edges) expect(Math.abs(Number(e.source.node.slice(1)) - Number(e.target.node.slice(1)))).toBe(1);
  });
});
