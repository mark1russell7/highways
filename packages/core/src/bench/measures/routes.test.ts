import { describe, expect, it } from "vitest";
import type { Graph, Route } from "../../model.ts";
import { countCrossings } from "../quality.ts";
import { ambiguity, inkSaved } from "./bundles.ts";
import { boardUnit, crossingAngle, crossingAngles, detourSpread, drawnSegments, plugSpacing, totalTurn } from "./routes.ts";

const P = (x: number, y: number) => ({ x, y });
const route = (edge: string, ...points: [number, number][]): Route => ({ edge, points: points.map(([x, y]) => P(x, y)) });
const box = (id: string, x: number, y: number, w = 10, h = 10) => ({ id, box: { x, y, w, h } });

describe("crossingAngles (R1, R2)", () => {
  it("gives 90 degrees for a right angle and 45 degrees for a half of it", () => {
    expect(crossingAngle(P(0, 0), P(10, 0), P(5, -5), P(5, 5))).toBeCloseTo(90);
    expect(crossingAngle(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBeCloseTo(90);
    expect(crossingAngle(P(0, 0), P(10, 0), P(5, -5), P(15, 5))).toBeCloseTo(45);
    // The angle is the smaller one, from 0 to 90, and the order of the segments does not change it.
    expect(crossingAngle(P(0, 0), P(10, 0), P(15, -5), P(5, 5))).toBeCloseTo(45);
    expect(crossingAngle(P(5, -5), P(15, 5), P(0, 0), P(10, 0))).toBeCloseTo(45);
  });

  it("counts the crossings as countCrossings does, and gives the mean angle over 90 degrees", () => {
    const routes = [route("a", [0, 0], [20, 0]), route("b", [10, -10], [10, 10]), route("c", [0, -15], [20, 5])];
    const segs = drawnSegments(routes);
    const ca = crossingAngles(segs);
    expect(ca.crossings).toBe(countCrossings(segs)[0]);
    // a-b at 90, b-c at 45, a-c at 45.
    expect(ca.crossings).toBe(3);
    expect(ca.min).toBeCloseTo(45);
    expect(ca.mean).toBeCloseTo((90 + 45 + 45) / 3 / 90);
  });

  it("gives a mean of 1 and a smallest angle of 90 without a crossing", () => {
    expect(crossingAngles(drawnSegments([route("a", [0, 0], [10, 0]), route("b", [0, 5], [10, 5])]))).toEqual({ crossings: 0, estimated: false, mean: 1, min: 90 });
  });
});

describe("totalTurn (R4) and detourSpread (R5)", () => {
  const straight = route("s", [0, 0], [10, 0]);
  const bent = route("l", [0, 0], [10, 0], [10, 10]);

  it("gives 0 for a straight route and a half turn for a right angle", () => {
    expect(totalTurn([straight])).toEqual({ mean: 0, max: 0 });
    const t = totalTurn([straight, bent]);
    expect(t.mean).toBeCloseTo(0.25);
    expect(t.max).toBeCloseTo(90);
  });

  it("gives the median and the tail of the detour", () => {
    const d = detourSpread([straight, bent]);
    expect(d.median).toBeCloseTo((1 + Math.SQRT2) / 2);
    expect(d.mean).toBeCloseTo((1 + Math.SQRT2) / 2);
    expect(d.q95).toBeCloseTo(1 + 0.95 * (Math.SQRT2 - 1));
    expect(detourSpread([])).toEqual({ median: 1, q95: 1, mean: 1 });
  });
});

describe("plugSpacing (R11)", () => {
  const graph = (xs: number[]): { graph: Graph; routes: Route[] } => ({
    graph: {
      nodes: [box("a", 0, 0, 90, 30), box("b", 0, 100, 90, 30)],
      edges: xs.map((_, i) => ({ id: `e${i}`, source: { node: "a" }, target: { node: "b" } })),
    },
    routes: xs.map((x, i) => route(`e${i}`, [x, 30], [x, 100])),
  });

  it("gives 1 for plugs at even spacing", () => {
    const g = graph([22.5, 45, 67.5]);
    expect(plugSpacing(g.graph, g.routes)).toEqual({ min: 1, q05: 1, sides: 2 });
  });

  it("gives the smallest gap over the even gap", () => {
    const g = graph([10, 20, 70]);
    const s = plugSpacing(g.graph, g.routes);
    expect(s.min).toBeCloseTo(10 / 22.5);
    expect(s.sides).toBe(2);
  });

  it("counts ends nearer than the tolerance as one plug, as a bundle shares its plug", () => {
    const g = graph([45, 45.2]);
    expect(plugSpacing(g.graph, g.routes)).toEqual({ min: 1, q05: 1, sides: 0 });
  });

  it("gives the median short side as the unit of the board", () => {
    expect(boardUnit({ nodes: [box("a", 0, 0, 40, 20), box("b", 0, 0, 10, 30), box("c", 0, 0, 50, 50)], edges: [] })).toBe(20);
    expect(boardUnit({ nodes: [], edges: [] })).toBe(1);
  });
});

describe("inkSaved (B1) and ambiguity (B4)", () => {
  it("gives the share of the ink that a shared segment saves", () => {
    expect(inkSaved([route("a", [0, 0], [10, 0], [20, 0]), route("b", [0, 0], [10, 0], [10, 10])])).toBeCloseTo(0.25);
    expect(inkSaved([route("a", [0, 0], [10, 0]), route("b", [0, 5], [10, 5])])).toBe(0);
  });

  const graph: Graph = {
    nodes: [box("a", -10, -5), box("b", 30, -5), box("c", -10, 5), box("d", 30, 5)],
    edges: [
      { id: "ab", source: { node: "a" }, target: { node: "b" } },
      { id: "cd", source: { node: "c" }, target: { node: "d" } },
    ],
  };

  it("gives 0 when no two routes share a segment", () => {
    expect(ambiguity(graph, [route("ab", [0, 0], [30, 0]), route("cd", [0, 10], [30, 10])])).toEqual({ value: 0, estimated: false });
  });

  it("counts the false neighbours that a shared segment makes", () => {
    // Each node sees three nodes along the shared segment, and only one of them is its neighbour.
    const routes = [route("ab", [0, 0], [10, 0], [20, 0], [30, 0]), route("cd", [0, 10], [10, 0], [20, 0], [30, 10])];
    expect(ambiguity(graph, routes).value).toBeCloseTo(2 / 3);
    expect(ambiguity(graph, routes, { exact: 1, sample: 50 }).estimated).toBe(true);
    expect(ambiguity(graph, routes, { exact: 1, sample: 50 }).value).toBeCloseTo(2 / 3);
  });
});
