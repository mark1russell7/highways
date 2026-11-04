import { describe, expect, it } from "vitest";
import { highwaysRegistry } from "./families/index.ts";
import { FIXTURES, makeFixture } from "./fixtures.ts";
import { edgePlugs } from "./highways/stretches.ts";
import type { Graph } from "./model.ts";
import { cornersRouter } from "./routers/index.ts";
import { CornerGraph, Obstacles } from "./visibility.ts";
import { WayFinder } from "./ways.ts";

const reg = highwaysRegistry();

/** The default members of `maze` where the nearest links of the corners cut one region into two parts. */
const FAILED = [181679, 25284, 39410, 60599, 85824, 123157, 138292, 157463, 185715, 186724];

/** The largest dimensions of `maze`, and members of that size whose join needs more than 256 looks for each point. */
const LARGE = { cols: 24, rows: 16, nodes: 60, edges: 120 };
const LARGE_STOPPED = [3086, 7122, 9140];

/** This function counts the connected parts of the corner graph. */
function parts(ways: WayFinder): number {
  const c = ways.corners;
  const seen = new Set<number>();
  let count = 0;
  for (let i = 0; i < c.points.length; i++) {
    if (seen.has(i)) continue;
    count++;
    const stack = [i];
    seen.add(i);
    while (stack.length > 0) {
      for (const j of c.neighbours(stack.pop()!)) {
        if (seen.has(j)) continue;
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return count;
}

const noWay = (graph: Graph, ways: WayFinder): number => edgePlugs(graph).filter(({ ps, pt }) => !ways.corners.path(ways.out(ps!), ways.out(pt!))).length;

describe("the join of the parts of the corner graph (CORNER-REACH)", () => {
  it("gives each failed maze the parts of the full graph, and a way for each edge", () => {
    for (const seed of FAILED) {
      const { graph } = reg.generate("maze", seed);
      const off = new WayFinder(graph.nodes, { joinWork: 0 });
      const on = new WayFinder(graph.nodes);
      expect(parts(off), `${seed}`).toBe(3);
      expect(noWay(graph, off), `${seed}`).toBeGreaterThan(0);
      expect(parts(on), `${seed}`).toBe(parts(new WayFinder(graph.nodes, { k: 1_000_000, joinWork: 0 })));
      expect(noWay(graph, on), `${seed}`).toBe(0);
      expect(on.corners.joinStopped, `${seed}`).toBe(false);
    }
  });

  it("keeps the bytes of a board where no part can see another", () => {
    const { graph } = reg.generate("maze", 59);
    const on = cornersRouter({ name: "corners" }).route(graph);
    expect(JSON.stringify(on)).toBe(JSON.stringify(cornersRouter({ name: "corners", joinWork: 0 }).route(graph)));
  });

  it("keeps the bytes of a board with one part", () => {
    const { graph } = reg.generate("tiny-uniform", 3);
    const on = new WayFinder(graph.nodes);
    expect(parts(on)).toBe(1);
    expect(on.corners.linkCount).toBe(new WayFinder(graph.nodes, { joinWork: 0 }).corners.linkCount);
    expect(JSON.stringify(cornersRouter({ name: "corners" }).route(graph))).toBe(JSON.stringify(cornersRouter({ name: "corners", joinWork: 0 }).route(graph)));
  });

  it("tells in the result when the limit stops the join, and the routes of that board say so", () => {
    const { graph } = reg.generate("maze", 181679);
    const stopped = cornersRouter({ name: "corners", joinWork: 1 }).route(graph);
    expect(stopped.joinStopped).toBe(true);
    expect(stopped.routes.some((r) => r.through !== undefined)).toBe(true);
    const done = cornersRouter({ name: "corners" }).route(graph);
    expect("joinStopped" in done).toBe(false);
    expect(done.routes.some((r) => r.through !== undefined)).toBe(false);
  });

  it("does not stop on the largest boards of the family, which a constant limit for each point stopped", () => {
    for (const seed of LARGE_STOPPED) {
      const { graph } = reg.generate("maze", seed, LARGE);
      const on = new WayFinder(graph.nodes);
      expect(on.corners.joinStopped, `${seed}`).toBe(false);
      expect(on.corners.linkCount, `${seed}`).toBeGreaterThan(new WayFinder(graph.nodes, { joinWork: 0 }).corners.linkCount);
      expect(new WayFinder(graph.nodes, { joinWork: 256 * on.corners.points.length }).corners.joinStopped, `${seed}`).toBe(true);
    }
  });

  it("does no work on a board of one part", () => {
    const { graph } = reg.generate("tiny-uniform", 3);
    expect(new WayFinder(graph.nodes).corners.joinLooks).toBe(0);
  });

  it("counts the work on a board of closed regions, where the join adds no link", () => {
    const { graph } = reg.generate("maze", 59);
    const on = new WayFinder(graph.nodes);
    expect(on.corners.joinLooks).toBeGreaterThan(on.corners.points.length);
    expect(on.corners.linkCount).toBe(new WayFinder(graph.nodes, { joinWork: 0 }).corners.linkCount);
  });

  it("does not set the flag when 0 turns the join off", () => {
    const { graph } = reg.generate("maze", 181679);
    expect(new WayFinder(graph.nodes, { joinWork: 0 }).corners.joinStopped).toBe(false);
  });

  it("gives an equal distance to the lower index of the corners", () => {
    // The corners of `a` see the corners of `left` and `right`. The corner at (50, -30) has one corner of each at the same distance.
    const nodes = [
      { id: "left", box: { x: 27, y: 2, w: 16, h: 6 } },
      { id: "right", box: { x: 57, y: 2, w: 16, h: 6 } },
      { id: "a", box: { x: 52, y: -38, w: 6, h: 6 } },
    ];
    const options = { margin: 2, k: 2, lattice: 0 };
    const off = new CornerGraph(nodes, new Obstacles(nodes, 180), { ...options, joinWork: 0 });
    const on = new CornerGraph(nodes, new Obstacles(nodes, 180), options);
    const at = (x: number, y: number): number => on.points.findIndex((p) => p.x === x && p.y === y);
    const [corner, near, far] = [at(50, -30), at(45, 0), at(55, 0)];
    expect(Math.min(corner, near, far)).toBeGreaterThanOrEqual(0);
    expect(near).toBeLessThan(far);
    expect([...off.neighbours(corner)]).not.toContain(near);
    expect([...off.neighbours(corner)]).not.toContain(far);
    expect([...on.neighbours(corner)]).toContain(near);
    expect([...on.neighbours(corner)]).not.toContain(far);
  });

  it("gives one graph and one result for one input", () => {
    const { graph } = reg.generate("maze", 25284);
    const links = (w: WayFinder): number[][] => w.corners.points.map((_, i) => [...w.corners.neighbours(i)]);
    expect(links(new WayFinder(graph.nodes))).toEqual(links(new WayFinder(graph.nodes)));
    expect(JSON.stringify(cornersRouter({ name: "corners" }).route(graph))).toBe(JSON.stringify(cornersRouter({ name: "corners" }).route(graph)));
  });

  it("does no work on the board of the speed claim H3, so that claim does not read the join", () => {
    const { nodes } = makeFixture(FIXTURES.find((f) => f.name === "large-clustered")!);
    expect(new WayFinder(nodes).corners.joinLooks).toBe(0);
  });
});
