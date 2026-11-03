import { describe, expect, it } from "vitest";
import { segmentHitsBox, segmentHitsRect, segmentsCross } from "../src/geom.ts";
import { crossing } from "../src/highways/mesh/index.ts";
import { nearestCentre } from "../src/highways/territories/index.ts";
import type { Graph } from "../src/model.ts";
import { CALL_SITE_RULES, predicateSink } from "../src/predicate-sink.ts";
import { graphInput, type LayoutInput } from "../src/bench/screen/index.ts";
import { boxIsNear, clipLength, crossIsNear, dumpBoards, PredicateRecorder, screenBoard, segmentDepth, sideIsNear, summaryText } from "./predicate-dump.ts";

// Made-up tiny boards only. The predicates of the tests take made-up points.
const P = (x: number, y: number): { x: number; y: number } => ({ x, y });

/** This function dumps one made-up board, with `run` as the work on the board, and gives its lines. */
function dumpOne(run: () => void, maxLines?: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const input = { id: "test/board", set: "test", family: "board", seed: 0 } as LayoutInput;
  dumpBoards(
    [input],
    () => {
      run();
      return [];
    },
    (lines) => out.push(...lines),
    maxLines === undefined ? {} : { maxLines },
  );
  return out;
}

describe("predicate dump", () => {
  it("writes an exact collinear pair as a near line with its float answer", () => {
    const lines = dumpOne(() => {
      expect(segmentsCross(P(0, 0), P(2, 0), P(1, 0), P(3, 0))).toBe(false);
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ case: "test/board", fn: "geom.segmentsCross", a: [0, 0], b: [2, 0], c: [1, 0], d: [3, 0], floatAnswer: false, n: 1 });
    expect(String(lines[0]!["via"])).toMatch(/predicate-dump\.test\.ts:\d+$/);
    expect(lines[0]).not.toHaveProperty("rule");
    expect(Object.keys(lines[0]!)).toEqual(["case", "fn", "a", "b", "c", "d", "floatAnswer", "via", "n"]);
    expect(lines[1]).toMatchObject({ case: "test/board", totalSegmentPairs: 1, nearSegmentPairs: 1, totalBoxTests: 0, lines: 1 });
  });

  it("gives the key of the rule to a line of mesh.crossing, a site of CALL_SITE_RULES", () => {
    const lines = dumpOne(() => {
      // A touch at an inner point: the closed test of the mesh gives a crossing.
      expect(crossing(P(0, 0), P(2, 0), P(1, 0), P(1, 3))).toBeDefined();
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ fn: "mesh.crossing", floatAnswer: true, rule: "mesh.crossing", n: 1 });
    expect(Object.keys(lines[0]!)).toEqual(["case", "fn", "a", "b", "c", "d", "floatAnswer", "rule", "via", "n"]);
    expect(Object.keys(CALL_SITE_RULES)).toContain(lines[0]!["rule"]);
  });

  it("gives the key of the rule to a side line of physics.outOf, and no rule to the other side lines", () => {
    const lines = dumpOne(() => {
      predicateSink!.side("physics.outOf", P(1, 1), P(0, 0), P(2, 2), CALL_SITE_RULES["physics.outOf"].zero);
      predicateSink!.side("test.side", P(1, 1), P(0, 0), P(2, 2), 0);
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ fn: "physics.outOf", floatAnswer: -1, rule: "physics.outOf" });
    expect(lines[1]).toMatchObject({ fn: "test.side", floatAnswer: 0 });
    expect(lines[1]).not.toHaveProperty("rule");
  });

  it("finds a near pair at a large scale with the relative tolerance", () => {
    const s = 1e8;
    // The point c is 1e-7 off the line of a b, far below 1e-9 * scale^2.
    expect(crossIsNear(P(s, s), P(s + 2, s + 2), P(s + 1, s + 1 + 1e-7), P(s, s + 3))).toBe(true);
    // The same shape at the scale 1 is far.
    expect(crossIsNear(P(0, 0), P(2, 2), P(1, 1.5), P(0, 3))).toBe(false);
    const lines = dumpOne(() => segmentsCross(P(s, s), P(s + 2, s + 2), P(s + 1, s + 1 + 1e-7), P(s, s + 3)));
    expect(lines[0]).toMatchObject({ fn: "geom.segmentsCross", a: [s, s], c: [s + 1, s + 1 + 1e-7] });
    expect(lines[1]).toMatchObject({ totalSegmentPairs: 1, nearSegmentPairs: 1 });
  });

  it("writes a box test at the distance 5e-7 of a side, and keeps the exact floats of the box", () => {
    const box = { x: 0.1, y: 0.2, w: 10, h: 10 };
    expect(segmentDepth(P(0.1, 0.2 - 5e-7), P(10, 0.2 - 5e-7), 0.1, 0.2, 10.1, 10.2)).toBeCloseTo(-5e-7, 12);
    const lines = dumpOne(() => {
      expect(segmentHitsBox(P(0.1, 0.2 - 5e-7), P(10, 0.2 - 5e-7), box)).toBe(false);
      // A segment through the middle of the box is far.
      expect(segmentHitsBox(P(-5, 5), P(15, 5), box)).toBe(true);
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ fn: "geom.segmentHitsBox", a: [0.1, 0.2 - 5e-7], b: [10, 0.2 - 5e-7], box, eps: 1e-6, floatAnswer: false });
    expect(lines[1]).toMatchObject({ totalBoxTests: 2, nearBoxTests: 1, totalSegmentPairs: 0 });
    expect(JSON.parse(JSON.stringify(lines[0]))).toEqual(lines[0]);
  });

  it("gives the 4 sides of segmentHitsRect, and counts one test for one call", () => {
    const lines = dumpOne(() => segmentHitsRect(P(0, 0), P(0, 5), 0, 0, 10, 10));
    expect(lines[0]).toMatchObject({ fn: "geom.segmentHitsRect", rect: [0, 0, 10, 10], floatAnswer: false });
    expect(lines[1]).toMatchObject({ totalBoxTests: 1, tests: { "geom.segmentHitsRect": 1 } });
  });

  it("finds a short segment deep in the box with a clipped length near eps", () => {
    expect(clipLength(P(5, 5), P(5 + 1e-6, 5), 0, 0, 10, 10)).toBeCloseTo(1e-6, 12);
    expect(boxIsNear(P(5, 5), P(5 + 1e-6, 5), 0, 0, 10, 10, 1e-6)).toBe(true);
    expect(boxIsNear(P(5, 5), P(6, 5), 0, 0, 10, 10, 1e-6)).toBe(false);
  });

  it("counts a far pair and writes only the total line", () => {
    const lines = dumpOne(() => {
      expect(segmentsCross(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBe(true);
    });
    expect(lines).toEqual([
      {
        case: "test/board",
        totalSegmentPairs: 1,
        totalBoxTests: 0,
        totalNearestTests: 0,
        totalPointSideTests: 0,
        nearSegmentPairs: 0,
        nearSharedEnd: 0,
        nearBoxTests: 0,
        nearNearestTests: 0,
        nearPointSideTests: 0,
        lines: 0,
        tests: { "geom.segmentsCross": 1 },
        near: {},
      },
    ]);
  });

  it("marks a near pair with a common end", () => {
    const lines = dumpOne(() => segmentsCross(P(0, 0), P(4, 1), P(4, 1), P(9, 7)));
    expect(lines[0]).toMatchObject({ fn: "geom.segmentsCross", sharedEnd: true, floatAnswer: false });
    expect(lines[1]).toMatchObject({ nearSegmentPairs: 1, nearSharedEnd: 1 });
  });

  it("keeps one line for the repeats of a board, with their count n", () => {
    const lines = dumpOne(() => {
      for (let i = 0; i < 3; i++) segmentsCross(P(0, 0), P(2, 0), P(1, 0), P(3, 0));
    });
    expect(lines[0]).toMatchObject({ n: 3 });
    expect(lines[1]).toMatchObject({ totalSegmentPairs: 3, nearSegmentPairs: 3, lines: 1 });
  });

  it("stops the new lines at the limit, keeps the counts and marks the total line", () => {
    const lines = dumpOne(() => {
      for (let i = 0; i < 5; i++) segmentsCross(P(0, i), P(2, i), P(1, i), P(3, i));
    }, 2);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatchObject({ totalSegmentPairs: 5, nearSegmentPairs: 5, lines: 2, truncated: true });
  });

  it("writes a near tie of the nearest centre as its own fn", () => {
    const lines = dumpOne(() => {
      expect(nearestCentre([P(0, 0), P(2, 0), P(9, 9)], P(1, 5))).toBe(0);
      expect(nearestCentre([P(0, 0), P(9, 9)], P(1, 1))).toBe(0);
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ fn: "territories.nearestCentre", p: [1, 5], c1: [0, 0], c2: [2, 0], i1: 0, i2: 1, floatAnswer: 0 });
    expect(lines[1]).toMatchObject({ totalNearestTests: 2, nearNearestTests: 1 });
  });

  it("writes a point exactly on a line as a near side line", () => {
    const lines = dumpOne(() => predicateSink!.side("test.side", P(1, 1), P(0, 0), P(2, 2), true));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ case: "test/board", fn: "test.side", p: [1, 1], a: [0, 0], b: [2, 2], floatAnswer: true, n: 1 });
    expect(String(lines[0]!["via"])).toMatch(/predicate-dump\.test\.ts:\d+$/);
    expect(lines[1]).toMatchObject({ totalPointSideTests: 1, nearPointSideTests: 1, totalSegmentPairs: 0, lines: 1, tests: { "test.side": 1 } });
  });

  it("finds a point near a line at a large scale, with a sign as the answer", () => {
    const s = 1e8;
    // The point p is 1e-7 off the line of a b, far below 1e-9 * scale^2.
    expect(sideIsNear(P(s + 1, s + 1 + 1e-7), P(s, s), P(s + 2, s + 2))).toBe(true);
    expect(sideIsNear(P(1, 1.5), P(0, 0), P(2, 2))).toBe(false);
    const lines = dumpOne(() => {
      for (let i = 0; i < 2; i++) predicateSink!.side("test.side", P(s + 1, s + 1 + 1e-7), P(s, s), P(s + 2, s + 2), -1);
    });
    expect(lines[0]).toMatchObject({ fn: "test.side", p: [s + 1, s + 1 + 1e-7], floatAnswer: -1, n: 2 });
    expect(lines[1]).toMatchObject({ totalPointSideTests: 2, nearPointSideTests: 2, lines: 1 });
  });

  it("counts a far point and writes only the total line", () => {
    const lines = dumpOne(() => predicateSink!.side("test.side", P(1, 5), P(0, 0), P(10, 0), 1));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ totalPointSideTests: 1, nearPointSideTests: 0, lines: 0, tests: { "test.side": 1 }, near: {} });
  });

  it("starts no more boards after stop gives true", () => {
    const boards = ["test/one", "test/two", "test/three"].map((id) => ({ id, set: "test", family: "board", seed: 0 }) as LayoutInput);
    const out: Record<string, unknown>[] = [];
    let asked = 0;
    const done = dumpBoards(boards, () => [], (lines) => out.push(...lines), { stop: () => asked++ >= 1 });
    expect(done).toBe(1);
    expect(out.map((l) => l["case"])).toEqual(["test/one"]);
  });

  it("sums the total lines in the Markdown summary", () => {
    const totals = [dumpOne(() => segmentsCross(P(0, 0), P(2, 0), P(1, 0), P(3, 0)))[1]!, { ...dumpOne(() => segmentsCross(P(0, 0), P(10, 10), P(0, 10), P(10, 0)))[0]!, truncated: true }];
    const text = summaryText("test", totals, 3, 1);
    expect(text).toContain("2 of 3 boards");
    expect(text).toContain("| segment pairs | 2 | 1 | 0 |");
    expect(text).toContain("| geom.segmentsCross | 2 | 1 |");
    expect(text).toContain("| point-side tests | 0 | 0 | |");
    expect(text).toContain("Boards with truncated lines: test/board.");
  });

  it("sets the sink only during the work of a board", () => {
    const seen: boolean[] = [];
    dumpOne(() => seen.push(predicateSink instanceof PredicateRecorder));
    expect(seen).toEqual([true]);
    expect(predicateSink).toBe(null);
    // Without the sink, the predicates give the same answers.
    expect(segmentsCross(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBe(true);
    expect(segmentHitsBox(P(-5, 5), P(15, 5), { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
  });

  it("counts the tests of the screen of the routers, with the opt-in routers, on a made-up board of 4 boxes", () => {
    const graph: Graph = {
      nodes: [
        { id: "a", box: { x: 0, y: 0, w: 40, h: 20 } },
        { id: "b", box: { x: 200, y: 0, w: 40, h: 20 } },
        { id: "c", box: { x: 0, y: 200, w: 40, h: 20 } },
        { id: "d", box: { x: 200, y: 200, w: 40, h: 20 } },
      ],
      // The two diagonals cross, so the routers test the crossings of their routes.
      edges: [
        { id: "ad", source: { node: "a" }, target: { node: "d" } },
        { id: "bc", source: { node: "b" }, target: { node: "c" } },
        { id: "ab", source: { node: "a" }, target: { node: "b" } },
      ],
    };
    const input = graphInput(graph, { id: "test/three", set: "test", family: "three", seed: 0, generator: null });
    const out: Record<string, unknown>[] = [];
    dumpBoards([input], (i) => screenBoard(i, ["router"], true), (lines) => out.push(...lines));
    const total = out[out.length - 1]!;
    expect(total).toMatchObject({ case: "test/three" });
    expect(total["errors"]).toBeUndefined();
    expect(Number(total["totalSegmentPairs"])).toBeGreaterThan(0);
    expect(Number(total["totalBoxTests"])).toBeGreaterThan(0);
    // The opt-in router `annealing` has its own copy of the crossing test.
    expect(Object.keys(total["tests"] as object)).toContain("annealing.properCross");
    expect(predicateSink).toBe(null);
  }, 60_000);

  it("counts the side tests of the step levels on the made-up board of 4 boxes", () => {
    const graph: Graph = {
      nodes: [
        { id: "a", box: { x: 0, y: 0, w: 40, h: 20 } },
        { id: "b", box: { x: 200, y: 0, w: 40, h: 20 } },
        { id: "c", box: { x: 0, y: 200, w: 40, h: 20 } },
        { id: "d", box: { x: 200, y: 200, w: 40, h: 20 } },
      ],
      edges: [
        { id: "ad", source: { node: "a" }, target: { node: "d" } },
        { id: "bc", source: { node: "b" }, target: { node: "c" } },
        { id: "ab", source: { node: "a" }, target: { node: "b" } },
      ],
    };
    const input = graphInput(graph, { id: "test/levels", set: "test", family: "levels", seed: 0, generator: null });
    const out: Record<string, unknown>[] = [];
    dumpBoards([input], (i) => screenBoard(i, ["levels"]), (lines) => out.push(...lines));
    const total = out[out.length - 1]!;
    expect(total["errors"]).toBeUndefined();
    expect(Number(total["totalPointSideTests"])).toBeGreaterThan(0);
    // The measure of the symmetry finds the corners of each route with a side test.
    expect(Object.keys(total["tests"] as object)).toContain("symmetry.cornersOf");
  }, 60_000);
});
