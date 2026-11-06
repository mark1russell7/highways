// The tests of the true shapes in the link measures (TRUE-SHAPE-MEASURE): the rule of the contract, the box corner, the circle pairs and the input shapes.
import { countLinksThroughShapes, type LayoutBox, type Region } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import type { Box, Point } from "../geom.ts";
import type { Graph } from "../model.ts";
import { asRouter, getStrategy } from "../strategies/model.ts";
import { STRATEGIES } from "../strategies/builtins.ts";
import { inputGraph } from "./screen/forms.ts";
import { measureLinks, measureRouteFaults } from "./links.ts";
import { TOLERANCE } from "./properties.ts";

const pts = (...xy: number[]): Point[] => xy.flatMap((_, i) => (i % 2 === 0 ? [{ x: xy[i]!, y: xy[i + 1]! }] : []));
const circle = (r: number): Region => ({ kind: "circle", cx: r, cy: r, r });

describe("the link measures with true shapes", () => {
  // The fixtures of 1,000 nodes or fewer. The larger fixtures are for the benchmark.
  const fixtures = FIXTURES.filter((f) => f.nodes <= 1000);

  for (const name of ["straight", "shared", "corners"]) {
    it(`gives the count of countLinksThroughShapes of the contract on each fixture for ${name}`, () => {
      const router = asRouter(getStrategy(STRATEGIES, "router", name));
      for (const spec of fixtures) {
        const graph = makeFixture(spec);
        const result = router.route(graph);
        const boxes: LayoutBox[] = graph.nodes.map((n) => ({ id: n.id, ...n.box }));
        const edges = new Map(graph.edges.map((e) => [e.id, e]));
        const links = result.routes.flatMap((r) => {
          const e = edges.get(r.edge);
          return e ? [{ source: e.source.node, target: e.target.node, points: r.points }] : [];
        });
        expect(measureRouteFaults(graph, result).through, `${name} ${spec.name}`).toBe(countLinksThroughShapes(boxes, links, TOLERANCE));
      }
    });
  }

  // A circle of radius 50 in the box from (100, 0) to (200, 100). A route cuts the corner of the box near (100, 0).
  const boxes = new Map<string, Box>([
    ["a", { x: 0, y: 0, w: 20, h: 20 }],
    ["round", { x: 100, y: 0, w: 100, h: 100 }],
    ["b", { x: 300, y: 0, w: 20, h: 20 }],
  ]);
  const middle = { source: "a", target: "b", points: pts(20, 10, 20, 50, 300, 50, 300, 10) };

  it("does not count a route through a corner of the box and outside the circle", () => {
    // The route goes into the box at its top-left corner and out at its top side. Each point of it is 63 units or more from the center (150, 50).
    const corner2 = { source: "a", target: "b", points: pts(20, 10, 100, 10, 105, 5, 105, -10, 300, -10) };
    expect(measureLinks(boxes, [corner2]).through).toBe(1);
    expect(measureLinks(boxes, [corner2], { shapes: new Map([["round", circle(50)]]) }).through).toBe(0);
  });

  it("counts a route through the circle with the shape and without it", () => {
    expect(measureLinks(boxes, [middle]).through).toBe(1);
    expect(measureLinks(boxes, [middle], { shapes: new Map([["round", circle(50)]]) }).through).toBe(1);
  });

  it("splits the links through two circles by the distance of their centers", () => {
    // First, the circle `near` touches the circle of the source `a`.
    // Then `near` moves down: its box overlaps a corner of the box of `a`, but the two circles do not touch.
    const round = new Map<string, Box>([
      ["a", { x: 0, y: 0, w: 100, h: 100 }],
      ["near", { x: 90, y: 0, w: 100, h: 100 }],
      ["b", { x: 400, y: 0, w: 20, h: 20 }],
    ]);
    const link = { source: "a", target: "b", points: pts(100, 50, 400, 10) };
    const shapes = new Map([["a", circle(50)], ["near", circle(50)]]);
    const touching = measureLinks(round, [link], { shapes });
    expect([touching.through, touching.unavoidable, touching.avoidable]).toEqual([1, 1, 0]);
    const apart = new Map<string, Box>([...round, ["near", { x: 90, y: 90, w: 100, h: 100 }]]);
    const link2 = { source: "a", target: "b", points: pts(50, 100, 140, 140, 400, 10) };
    const split = measureLinks(apart, [link2], { shapes });
    expect([split.through, split.unavoidable, split.avoidable]).toEqual([1, 0, 1]);
    expect(measureLinks(apart, [link2]).unavoidable).toBe(1);
  });

  it("gives the same faults without shapes and with an empty map", () => {
    const f = measureLinks(boxes, [middle]);
    expect(measureLinks(boxes, [middle], { shapes: new Map() })).toEqual(f);
  });

  it("reads the shapes of the boxes and of the obstacles of an input", () => {
    const graph: Graph = inputGraph({
      id: "shapes",
      boxes: [
        { id: "a", x: 0, y: 0, w: 20, h: 20 },
        { id: "round", x: 100, y: 0, w: 100, h: 100, shape: circle(50) },
        { id: "b", x: 300, y: 0, w: 20, h: 20 },
      ],
      obstacles: [{ id: "pond", region: { kind: "circle", cx: 150, cy: 250, r: 40 } }],
      edges: [{ id: "e", source: "a", target: "b" }],
    });
    expect(graph.nodes.find((n) => n.id === "round")?.shape).toEqual(circle(50));
    expect(graph.nodes.find((n) => n.id === "pond")).toEqual({ id: "pond", box: { x: 110, y: 210, w: 80, h: 80 }, shape: circle(40) });
    expect(graph.nodes.find((n) => n.id === "a")?.shape).toBeUndefined();
    const route = { edge: "e", points: pts(20, 10, 100, 10, 105, 5, 105, -10, 300, -10) };
    expect(measureRouteFaults(graph, { routes: [route] }).through).toBe(0);
  });
});
