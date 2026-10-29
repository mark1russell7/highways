import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { pointSegmentDistance } from "../../geom.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import type { Graph } from "../../model.ts";
import { checkOptions } from "../../strategies/options.ts";
import { resample, simplify } from "../physics.ts";
import { REPEL_DEFAULTS, REPEL_SCHEMA, repelStrategy } from "./index.ts";

/** Two nodes with a third node on the straight line between them. The center of the third node is below the line. */
const blocked: Graph = {
  nodes: [
    { id: "a", box: { x: 0, y: 0, w: 40, h: 20 } },
    { id: "m", box: { x: 120, y: -6, w: 40, h: 40 } },
    { id: "b", box: { x: 240, y: 0, w: 40, h: 20 } },
  ],
  edges: [{ id: "ab", source: { node: "a" }, target: { node: "b" } }],
};

describe("the router repel (PHYSICAL)", () => {
  it("gives the same routes each time, with no break of a hard rule", () => {
    for (const graph of [hub, clustered, blocked]) {
      const first = repelStrategy.run(graph, { ...REPEL_DEFAULTS });
      expect(repelStrategy.run(graph, { ...REPEL_DEFAULTS })).toEqual(first);
      expect(first.routes.length).toBe(graph.edges.length);
      expect(checkProperties(graph, first, 1_000_000)).toEqual([]);
    }
  }, 30_000);

  it("keeps a straight line where no box is near", () => {
    const free: Graph = { nodes: [blocked.nodes[0]!, blocked.nodes[2]!], edges: blocked.edges };
    const { routes } = repelStrategy.run(free, { ...REPEL_DEFAULTS });
    expect(routes[0]!.points.length).toBe(2);
  });

  it("gives a small move of the route for a small move of a node", () => {
    const moved: Graph = { ...blocked, nodes: blocked.nodes.map((n) => (n.id === "m" ? { ...n, box: { ...n.box, y: n.box.y + 1 } } : n)) };
    const a = repelStrategy.run(blocked, { ...REPEL_DEFAULTS }).routes[0]!.points;
    const b = repelStrategy.run(moved, { ...REPEL_DEFAULTS }).routes[0]!.points;
    const far = Math.max(...b.map((p) => Math.min(...a.slice(1).map((q, i) => pointSegmentDistance(p, a[i]!, q)))));
    expect(far).toBeLessThan(4);
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(repelStrategy, REPEL_DEFAULTS)).toEqual([]);
    expect(Object.keys(REPEL_SCHEMA).sort()).toEqual(Object.keys(REPEL_DEFAULTS).sort());
  });
});

describe("the helpers of the forces (PHYSICAL)", () => {
  it("resamples a polyline to legs of equal length, with the same ends", () => {
    const p = resample([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 4);
    expect(p).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 10 }]);
  });

  it("removes the points near the line of their neighbors", () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 5, y: 0.1 }, { x: 10, y: 0 }], 0.5)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(simplify([{ x: 0, y: 0 }, { x: 5, y: 2 }, { x: 10, y: 0 }], 0.5)).toHaveLength(3);
  });
});
