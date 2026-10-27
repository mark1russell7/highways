import { describe, expect, it } from "vitest";
import { checkProperties } from "../bench/properties.ts";
import type { Box, Point } from "../geom.ts";
import type { Graph } from "../model.ts";
import { follow } from "./follow.ts";
import { checkPlan, lengthBetween, memberAt, pointAt, type HighwayPlan } from "./model.ts";

const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });

// Two sources on the left and two targets on the right. The edge "c" goes back from the right to the left. The edge "d" is not a member.
const lanes: Graph = {
  nodes: [
    { id: "s0", box: box(0, -80) },
    { id: "s1", box: box(0, 80) },
    { id: "t0", box: box(400, -80) },
    { id: "t1", box: box(400, 80) },
    { id: "u", box: box(200, 200) },
  ],
  edges: [
    { id: "a", source: { node: "s0" }, target: { node: "t0" } },
    { id: "b", source: { node: "s1" }, target: { node: "t1" } },
    { id: "c", source: { node: "t1" }, target: { node: "s0" } },
    { id: "d", source: { node: "u" }, target: { node: "t1" } },
  ],
};

const spine: readonly Point[] = [
  { x: 100, y: 10 },
  { x: 200, y: 10 },
  { x: 300, y: 10 },
];

const plan: HighwayPlan = {
  highways: [{ id: "h0", key: "k", spine, lanes: ["a", "c", "b"], members: [memberAt(spine, "a", 0, 2), memberAt(spine, "c", 2, 0), memberAt(spine, "b", 0.5, 2)] }],
};

/** This function gives the index of the first point of a route that is equal to a point, or -1. */
const indexOf = (points: readonly Point[], p: Point): number => points.findIndex((q) => Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9);

describe("the places of a highway", () => {
  it("give the points and the lengths along the spine", () => {
    expect(pointAt(spine, 0.5)).toEqual({ x: 150, y: 10 });
    expect(pointAt(spine, -1)).toEqual(spine[0]);
    expect(pointAt(spine, 9)).toEqual(spine[2]);
    expect(lengthBetween(spine, 0.5, 2)).toBeCloseTo(150, 9);
    expect(lengthBetween(spine, 2, 0)).toBe(0);
  });
});

describe("checkPlan", () => {
  it("finds no problem in a good plan", () => {
    expect(checkPlan(lanes, plan)).toEqual([]);
  });

  it("finds each problem of a bad plan", () => {
    const bad: HighwayPlan = {
      highways: [
        { id: "h", key: "k", spine: [spine[0]!], lanes: ["a"], members: [memberAt(spine, "a", 1, 1)] },
        { id: "h", key: "k", spine, lanes: ["x", "a"], members: [memberAt(spine, "x", 0, 1), memberAt(spine, "a", 0, 7)] },
      ],
    };
    expect(checkPlan(lanes, bad)).toEqual([
      'The highway "h" has a spine with fewer than two points.',
      'The highway "h" has fewer than two members.',
      'The member "a" of the highway "h" has a place off the spine.',
      'The member "a" of the highway "h" joins and leaves the spine at one place.',
      'Two highways have the id "h".',
      'The highway "h" has the member "x", which is not an edge of the graph.',
      'The member "a" of the highway "h" has a place off the spine.',
    ]);
  });
});

describe("follow", () => {
  it("routes each member from its plug to its merge point, along the spine to its split point, and then to its target", () => {
    const result = follow(lanes, plan);
    expect(checkProperties(lanes, result)).toEqual([]);
    const route = (id: string): readonly Point[] => result.routes.find((r) => r.edge === id)!.points;
    // The stops of the spine are its points and the merge point of "b" at the place 0.5.
    const stops = [spine[0]!, { x: 150, y: 10 }, spine[1]!, spine[2]!];
    const a = route("a");
    const first = indexOf(a, spine[0]!);
    expect(first).toBeGreaterThan(0);
    expect(stops.map((p) => indexOf(a, p))).toEqual([first, first + 1, first + 2, first + 3]);
    // The edge "c" goes along the spine from its last point to its first point.
    const c = route("c");
    const back = indexOf(c, spine[2]!);
    expect(back).toBeGreaterThan(0);
    expect([...stops].reverse().map((p) => indexOf(c, p))).toEqual([back, back + 1, back + 2, back + 3]);
    // The edge "b" joins at the place 0.5.
    const b = route("b");
    expect(indexOf(b, { x: 150, y: 10 })).toBeGreaterThan(0);
    expect(indexOf(b, spine[0]!)).toBe(-1);
  });

  it("gives runs where two members or more share the spine, with the key of the highway", () => {
    const result = follow(lanes, plan);
    expect(result.runs?.map((r) => ({ key: r.key, edges: [...r.edges].sort() }))).toEqual([
      { key: "k", edges: ["a", "c"] },
      { key: "k", edges: ["a", "b", "c"] },
    ]);
  });

  it("routes an edge that is not a member as the way finder does, or with its first route", () => {
    const alone = follow(lanes, { highways: [] });
    expect(alone.runs).toBeUndefined();
    const d = alone.routes.find((r) => r.edge === "d")!;
    expect(follow(lanes, plan).routes.find((r) => r.edge === "d")).toEqual(d);
    const given = { routes: [{ edge: "d", points: [{ x: 220, y: 200 }, { x: 420, y: 100 }] }] };
    expect(follow(lanes, plan, { routes: given }).routes.find((r) => r.edge === "d")).toEqual(given.routes[0]);
  });

  it("gives the same routes two times", () => {
    expect(follow(lanes, plan)).toEqual(follow(lanes, plan));
  });
});
