import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Point } from "../../geom.ts";
import { highwaysRegistry, HIGHWAYS_FAMILIES } from "../../families/index.ts";
import type { Graph, Route } from "../../model.ts";
import { cornersRouter } from "../../routers/index.ts";
import { Obstacles } from "../../visibility.ts";
import { checkRoutes, closedDepth, deciding, falseThrough, flagged, type RouteCheck } from "./through-check.ts";

const box = (id: string, x: number, y: number, w: number, h: number, parent?: string) => ({ id, box: { x, y, w, h }, ...(parent !== undefined ? { parent } : {}) });
const SOURCE = box("s", 0, 40, 10, 20);
const TARGET = box("t", 90, 40, 10, 20);
const p = (x: number, y: number): Point => ({ x, y });

/** This function checks one route from `s` to `t` on a board with the end boxes and the boxes of `nodes`. */
function check(nodes: Graph["nodes"], points: readonly Point[], through?: readonly string[]): RouteCheck {
  const graph: Graph = { nodes: [SOURCE, TARGET, ...nodes], edges: [{ id: "e", source: { node: "s" }, target: { node: "t" } }] };
  const route: Route = { edge: "e", points, ...(through ? { through } : {}) };
  return checkRoutes(graph, [route])[0]!;
}

describe("closedDepth", () => {
  const b = { x: 0, y: 0, w: 10, h: 10 };

  it("gives 0 for a touch, a depth inside and a gap outside", () => {
    expect(closedDepth(p(10, -5), p(10, 15), b)).toBe(0);
    expect(closedDepth(p(9.6, -5), p(9.6, 15), b)).toBeCloseTo(0.4, 12);
    expect(closedDepth(p(5, -5), p(5, 15), b)).toBe(5);
    expect(closedDepth(p(10.1, -5), p(10.1, 15), b)).toBeCloseTo(-0.1, 12);
  });

  it("gives the depth of a stop and of a slanted line", () => {
    expect(closedDepth(p(20, 5), p(9.6, 5), b)).toBeCloseTo(0.4, 12);
    expect(closedDepth(p(-5, 5), p(5, 15), b)).toBe(0);
    expect(closedDepth(p(-5, 5), p(5, 15.2), b)).toBeLessThan(0);
    expect(closedDepth(p(-2, 2), p(12, 8), b)).toBeCloseTo(5, 10);
  });
});

describe("the class of a contact", () => {
  const LOW = box("low", 40, 50, 20, 40);
  const HIGH = box("high", 40, 10, 20, 40);

  it("holds a line along the seam of two boxes that touch", () => {
    const c = check([LOW, HIGH], [p(10, 50), p(90, 50)]);
    expect(flagged(c)).toBe(true);
    expect(c.contacts.map((x) => [x.box, x.class, x.depth])).toEqual([
      ["high", "seam", 0],
      ["low", "seam", 0],
    ]);
  });

  it("holds a stop 0.4 inside a box", () => {
    const c = check([LOW], [p(10, 50), p(50, 50), p(50, 50.4), p(90, 50.4)]);
    expect(deciding(c)?.class).toBe("band");
    expect(deciding(c)?.depth).toBeCloseTo(0.4, 12);
  });

  it("holds a line that grazes a corner", () => {
    const c = check([box("b", 40, 60, 20, 20)], [p(10, 45), p(40, 60), p(90, 45)]);
    expect(deciding(c)?.class).toBe("corner");
    const slant = check([box("b", 40, 60, 20, 20)], [p(30, 70), p(50, 50)]);
    expect(slant.contacts.map((x) => [x.class, x.depth])).toEqual([["corner", 0]]);
  });

  it("holds a line along one wall and a stop on a wall", () => {
    expect(deciding(check([LOW], [p(10, 45), p(10, 50), p(90, 50)]))?.class).toBe("wall");
    expect(deciding(check([LOW], [p(10, 45), p(50, 50), p(90, 45)]))?.class).toBe("wall");
  });

  it("keeps a line with a gap of 0.1 clear", () => {
    const c = check([box("b", 40, 50.1, 20, 40)], [p(10, 50), p(90, 50)]);
    expect(c.contacts).toEqual([]);
    expect(flagged(c)).toBe(false);
  });

  it("holds a line deep in a box with no field through as deep, and the field through as agreed", () => {
    const points = [p(10, 50), p(90, 50)];
    expect(deciding(check([box("b", 40, 40, 20, 20)], points))?.class).toBe("deep");
    const c = check([box("b", 40, 40, 20, 20)], points, ["b"]);
    expect([flagged(c), falseThrough(c), c.falseNames, c.namesMet]).toEqual([false, false, [], 1]);
  });

  it("holds a plug on a shared wall and an end box that overlaps a box apart", () => {
    const touch = box("b", -10, 40, 10, 20);
    expect(deciding(check([touch], [p(0, 50), p(50, 80), p(90, 50)]))?.class).toBe("plug-wall");
    const lap = box("b", 9.8, 40, 20, 20);
    expect(deciding(check([lap], [p(10, 39), p(10, 30), p(90, 30), p(90, 50)]))?.class).toBeUndefined();
    expect(deciding(check([lap], [p(10, 50), p(10, 30), p(90, 30), p(90, 50)]))?.class).toBe("end-overlap");
  });

  it("holds a route that runs along a seam from its plug apart", () => {
    const left = box("left", -20, 40, 20, 20);
    const seam = check([left], [p(0, 50), p(0, 30), p(90, 30), p(90, 50)]);
    expect(deciding(seam)?.class).toBe("plug-seam");
  });

  it("gives the class of the worst contact first", () => {
    const c = check([box("a", 20, 50, 10, 10), box("b", 60, 49.8, 10, 10)], [p(10, 50), p(90, 50)]);
    expect(c.contacts.map((x) => x.class)).toEqual(["band", "wall"]);
  });

  it("finds a false field through, by box and by route", () => {
    const c = check([box("b", 40, 60, 20, 20), box("far", 40, 0, 20, 10)], [p(10, 50), p(50, 70), p(90, 50)], ["b", "far"]);
    expect(c.falseNames).toEqual(["far"]);
    expect(falseThrough(c)).toBe(false);
    expect(falseThrough(check([box("far", 40, 0, 20, 10)], [p(10, 50), p(90, 50)], ["far"]))).toBe(true);
  });

  it("counts a box that the field through does not name", () => {
    const c = check([box("a", 20, 45, 10, 10), box("b", 60, 45, 10, 10)], [p(10, 50), p(90, 50)], ["a"]);
    expect(c.unnamed).toEqual(["b"]);
  });
});

describe("the boxes that count", () => {
  const graph: Graph = {
    nodes: [box("f", 0, 0, 100, 100), box("a", 10, 10, 20, 20, "f"), box("b", 70, 10, 20, 20, "f"), box("c", 40, 10, 20, 20, "f")],
    edges: [{ id: "e", source: { node: "a" }, target: { node: "b" } }],
  };

  it("skips the frame of an end, and counts a sibling", () => {
    const [c] = checkRoutes(graph, [{ edge: "e", points: [p(30, 20), p(70, 20)], frame: "f" }]);
    expect(c!.skipsFrame).toBe(true);
    expect(c!.inner).toBe(true);
    expect(c!.contacts.map((x) => x.box)).toEqual(["c"]);
  });

  it("gives no row for a route of an edge outside the graph", () => {
    expect(checkRoutes(graph, [{ edge: "none", points: [p(0, 0), p(1, 1)] }])).toEqual([]);
  });
});

describe("the check and the test behind through", () => {
  const b = box("b", 40, 50, 20, 40);
  const seen = (a: Point, q: Point, nodes: Graph["nodes"]): string[] => {
    const out: string[] = [];
    new Obstacles(nodes, 100).across(a, q, (n) => out.push(n.id));
    return out;
  };

  it("disagree in the band: a line 0.4 inside a box reads clear to across, and the check holds it", () => {
    expect(seen(p(10, 50.4), p(90, 50.4), [b])).toEqual([]);
    expect(deciding(check([b], [p(10, 50.4), p(90, 50.4)]))?.class).toBe("band");
  });

  it("disagree on a seam, and agree on a line deep in a box", () => {
    expect(seen(p(10, 50), p(90, 50), [b, box("up", 40, 10, 20, 40)])).toEqual([]);
    expect(deciding(check([b, box("up", 40, 10, 20, 40)], [p(10, 50), p(90, 50)]))?.class).toBe("seam");
    expect(seen(p(10, 60), p(90, 60), [b])).toEqual(["b"]);
  });
});

describe("the independence of the check", () => {
  const text = readFileSync(new URL("./through-check.ts", import.meta.url), "utf8");
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("imports types only, from the model and the geometry", () => {
    const imports = [...code.matchAll(/^import\s[^;]*;/gm)].map((m) => m[0]);
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) {
      expect(line, line).toMatch(/^import type \{/);
      expect(line, line).toMatch(/from "\.\.\/\.\.\/(geom|model)\.ts";$/);
    }
  });

  it("has no name of the test behind through", () => {
    for (const name of ["visibility", "segmentHitsBox", "segmentHitsRect", "segmentBoxDistance", "across", "Obstacles", "Grid", "inflate", "TOLERANCE"]) expect(code, name).not.toContain(name);
  });
});

describe("the record through-check/1", () => {
  const record = JSON.parse(readFileSync(new URL("../../../scripts/data/through-check/record.json", import.meta.url), "utf8")) as {
    readonly unmarked: readonly string[];
    readonly rows: readonly { readonly router: string }[];
    readonly unmarkedRows: readonly { readonly router: string; readonly family: string; readonly routes: number; readonly marked: number }[];
  };

  it("keeps the routers that do not mark through on their own rows", () => {
    expect(record.unmarked).toEqual(["straight", "plugs"]);
    expect(record.rows.filter((r) => record.unmarked.includes(r.router))).toEqual([]);
    for (const name of record.unmarked) {
      const rows = record.unmarkedRows.filter((r) => r.router === name);
      expect(rows.map((r) => r.family)).toEqual(expect.arrayContaining(HIGHWAYS_FAMILIES.map((f) => f.name)));
      for (const r of rows) expect([r.family, r.routes > 0, r.marked]).toEqual([r.family, true, 0]);
    }
  });
});

describe("the property no-false-through", () => {
  const reg = highwaysRegistry();
  const corners = cornersRouter({ name: "corners" });

  it.each(HIGHWAYS_FAMILIES.map((f) => f.name))("holds for corners on %s, over 2 seeds", (name) => {
    for (const seed of [0, 1]) {
      const { graph } = reg.generate(name, seed);
      const checks = checkRoutes(graph, corners.route(graph).routes);
      expect(checks.filter(falseThrough).map((c) => c.edge)).toEqual([]);
      expect(checks.flatMap((c) => c.falseNames)).toEqual([]);
    }
  }, 60_000);
});
