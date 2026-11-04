import { describe, expect, it } from "vitest";
import { highwaysRegistry } from "./families/index.ts";
import { edgePlugs } from "./highways/stretches.ts";
import type { Graph } from "./model.ts";
import { cornersRouter } from "./routers/index.ts";
import { WayFinder } from "./ways.ts";

const reg = highwaysRegistry();

/** The default members of `maze` where the nearest links of the corners cut one region into two parts. */
const FAILED = [181679, 25284, 39410, 60599, 85824, 123157, 138292, 157463, 185715, 186724];

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

  it("does not set the flag when 0 turns the join off", () => {
    const { graph } = reg.generate("maze", 181679);
    expect(new WayFinder(graph.nodes, { joinWork: 0 }).corners.joinStopped).toBe(false);
  });

  it("gives one graph and one result for one input", () => {
    const { graph } = reg.generate("maze", 25284);
    const links = (w: WayFinder): number[][] => w.corners.points.map((_, i) => [...w.corners.neighbours(i)]);
    expect(links(new WayFinder(graph.nodes))).toEqual(links(new WayFinder(graph.nodes)));
    expect(JSON.stringify(cornersRouter({ name: "corners" }).route(graph))).toBe(JSON.stringify(cornersRouter({ name: "corners" }).route(graph)));
  });
});
