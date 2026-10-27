import { describe, expect, it } from "vitest";
import { benchCurves, benchCurveStrategies } from "../bench/curves.ts";
import { benchRoom, measureBoard } from "../bench/room.ts";
import { runBenchmark, sameData, type BenchRow } from "../bench/run.ts";
import { CASES, packedGridBoard } from "../cases.ts";
import { curveOf, CURVE_TYPES, curveSpace } from "../curves/index.ts";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import { center } from "../geom.ts";
import { nodeIndex } from "../model.ts";
import { nearestSide, SIDE_NORMAL } from "../plugs.ts";
import { makeRoom, roomDemand, roomLinks } from "../room/index.ts";
import { ROUTERS } from "../routers/index.ts";
import {
  BUILT_IN_STRATEGIES,
  checkSchema,
  createRegistry,
  curveStrategies,
  defineStrategy,
  findStrategy,
  getStrategy,
  listStrategies,
  register,
  routersOf,
  STEPS,
  STRATEGIES,
  sweepOf,
  type Strategy,
} from "./index.ts";

// A consumer strategy: a router with one bend on each edge. It is the example of the README.
const elbow = defineStrategy({
  step: "router",
  name: "elbow",
  describe: "Each edge goes along one axis, then along the other, from center to center.",
  defaults: { turn: "x" as "x" | "y" },
  schema: { turn: { type: "enum", values: ["x", "y"], describe: "The axis of the first leg." } },
  run(graph, o) {
    const box = new Map(graph.nodes.map((n) => [n.id, n.box]));
    const routes = graph.edges.map((e) => {
      const a = center(box.get(e.source.node)!);
      const b = center(box.get(e.target.node)!);
      const knee = o.turn === "x" ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
      return { edge: e.id, points: [a, knee, b] };
    });
    return { routes };
  },
});

// A test curve for the registry of version 0.1.5: the polyline as lines.
const zigzagLike = defineStrategy({
  step: "curve",
  name: "zigzag-like",
  describe: "A test curve: the polyline as lines.",
  defaults: {},
  run: (input) => [{ kind: "move" as const, to: input.points[0]! }, ...input.points.slice(1).map((to) => ({ kind: "line" as const, to }))],
});

const tiny = makeFixture(FIXTURES.find((f) => f.name === "tiny-uniform")!);
const small = FIXTURES.filter((f) => f.nodes <= 100);
const withoutTime = (rows: readonly BenchRow[]): unknown[] => rows.map(({ ms: _ms, ...rest }) => rest);

describe("the built-in registry", () => {
  it("holds each router of ROUTERS, with its name, its limit and its output", () => {
    const routers = listStrategies(STRATEGIES, "router");
    expect(routers.map((s) => s.name)).toEqual(ROUTERS.map((r) => r.name));
    expect(routersOf(STRATEGIES).map((r) => r.maxNodes)).toEqual(ROUTERS.map((r) => r.maxNodes));
    const graphs = [tiny, ...CASES.map((c) => c.make())];
    for (const r of ROUTERS) for (const g of graphs) expect(sameData(getStrategy(STRATEGIES, "router", r.name).run(g), r.route(g)), r.name).toBe(true);
  });

  it("holds each curve type, with the segments of curveOf", () => {
    expect(listStrategies(STRATEGIES, "curve").map((s) => s.name)).toEqual([...CURVE_TYPES, "highway"]);
    const space = curveSpace(tiny.nodes.map((n) => n.box));
    const byId = nodeIndex(tiny);
    const result = ROUTERS.find((r) => r.name === "corners")!.route(tiny);
    for (const type of CURVE_TYPES)
      for (const route of result.routes) {
        const edge = tiny.edges.find((e) => e.id === route.edge)!;
        const p = route.points;
        const startNormal = SIDE_NORMAL[nearestSide(byId.get(edge.source.node)!.box, p[0]!)];
        const endNormal = SIDE_NORMAL[nearestSide(byId.get(edge.target.node)!.box, p[p.length - 1]!)];
        const s = getStrategy(STRATEGIES, "curve", type);
        expect(s.run({ points: p })).toEqual(curveOf(p, { type }));
        expect(s.run({ points: p, startNormal, endNormal, space })).toEqual(curveOf(p, { type, startNormal, endNormal, space }));
      }
    expect(curveStrategies.rounded.run({ points: result.routes[0]!.points }, { radius: 4 })).toEqual(
      curveOf(result.routes[0]!.points, { type: "rounded", radius: 4 }),
    );
    // One polyline alone has no bundle. So the curve "highway" gives the curve "arc".
    for (const route of result.routes) {
      const p = route.points;
      expect(curveStrategies.highway.run({ points: p, space })).toEqual(curveOf(p, { type: "arc", space }));
      expect(curveStrategies.highway.run({ points: p }, { radius: 6, minRadius: 2 })).toEqual(curveOf(p, { type: "arc", radius: 6 }));
    }
  });

  it("holds each method of roomDemand", () => {
    const board = packedGridBoard();
    const links = roomLinks(board);
    expect(listStrategies(STRATEGIES, "room").map((s) => s.name)).toEqual(["routes", "lines", "levels"]);
    for (const method of ["routes", "lines"] as const)
      expect(getStrategy(STRATEGIES, "room", method).run({ items: board.nodes, links }, { gutter: 8 })).toEqual(roomDemand(board.nodes, links, { gutter: 8, method }));
  });

  it("gives the same benchmark rows as before, except the times", () => {
    const fixtures = small.slice(0, 1);
    expect(withoutTime(runBenchmark(routersOf(STRATEGIES), fixtures, { repeat: 2 }))).toEqual(withoutTime(runBenchmark(ROUTERS, fixtures, { repeat: 2 })));
    const router = ROUTERS.find((r) => r.name === "shared")!;
    const strip = (rows: readonly { ms: number }[]): unknown[] => rows.map(({ ms: _ms, ...rest }) => rest);
    const types = listStrategies(STRATEGIES, "curve").filter((s) => (CURVE_TYPES as readonly string[]).includes(s.name));
    expect(strip(benchCurveStrategies(router, "tiny-uniform", tiny, types))).toEqual(strip(benchCurves(router, "tiny-uniform", tiny)));
  });

  it("gives the same rows of the room benchmark as makeRoom with each method", () => {
    const board = packedGridBoard();
    const options = { gutter: 8, spacing: 4 };
    const rows = benchRoom("packed-grid", board, options);
    expect(rows.map((r) => r.board)).toEqual(["packed", "gutter", "routes", "lines"]);
    for (const method of ["routes", "lines"] as const) {
      const open = makeRoom(board.nodes, roomLinks(board), { ...options, method });
      const { fixture: _f, board: _b, area: _a, ms: _ms, ...measures } = rows.find((r) => r.board === method)!;
      expect(measures).toEqual(measureBoard({ nodes: open.items, edges: board.edges }, 4));
    }
  });

  it("is data that no caller can change", () => {
    expect(Object.isFrozen(STRATEGIES)).toBe(true);
    for (const step of STEPS) expect(Object.isFrozen(STRATEGIES[step])).toBe(true);
    expect(Object.isFrozen(getStrategy(STRATEGIES, "curve", "spline"))).toBe(true);
  });
});

describe("a consumer strategy", () => {
  it("is in its own registry, in the list of the benchmark and in a row of the benchmark", () => {
    const mine = createRegistry([...BUILT_IN_STRATEGIES, elbow]);
    expect(listStrategies(mine, "router").map((s) => s.name)).toEqual([...ROUTERS.map((r) => r.name), "elbow"]);
    expect(routersOf(mine).map((r) => r.name)).toContain("elbow");
    const rows = runBenchmark(routersOf(mine), small.slice(0, 1), { repeat: 2 });
    const row = rows.find((r) => r.router === "elbow")!;
    expect(row.fixture).toBe("tiny-uniform");
    expect(row.deterministic).toBe(true);
    expect(findStrategy(STRATEGIES, "router", "elbow")).toBeUndefined();
  });

  it("gets typed options, with the defaults for each missing option", () => {
    const edge = { nodes: [{ id: "a", box: { x: 0, y: 0, w: 10, h: 10 } }, { id: "b", box: { x: 100, y: 50, w: 10, h: 10 } }], edges: [{ id: "ab", source: { node: "a" }, target: { node: "b" } }] };
    expect(elbow.run(edge).routes[0]!.points[1]).toEqual({ x: 105, y: 5 });
    expect(elbow.run(edge, { turn: "y" }).routes[0]!.points[1]).toEqual({ x: 5, y: 55 });
    expect(elbow.defaults).toEqual({ turn: "x" });
    expect(checkSchema(elbow)).toEqual([]);
    expect(sweepOf(elbow, "turn").map((s) => s.options)).toEqual([{ turn: "x" }, { turn: "y" }]);
    // @ts-expect-error The option `turn` takes only "x" or "y".
    elbow.run(edge, { turn: "z" });
  });

  it("is added with register, which does not change the registry before it", () => {
    const zigzag: Strategy<"curve", { amplitude: number }> = defineStrategy({
      step: "curve",
      name: "zigzag",
      describe: "A test curve: the polyline as lines.",
      defaults: { amplitude: 2 },
      run: (input) => [{ kind: "move", to: input.points[0]! }, ...input.points.slice(1).map((to) => ({ kind: "line" as const, to }))],
    });
    const more = register(STRATEGIES, zigzag);
    expect(listStrategies(more, "curve").map((s) => s.name)).toEqual([...CURVE_TYPES, "highway", "zigzag"]);
    expect(listStrategies(STRATEGIES, "curve")).toHaveLength(CURVE_TYPES.length + 1);
    expect(benchCurveStrategies(ROUTERS[0]!, "tiny-uniform", tiny, listStrategies(more, "curve")).map((r) => r.type)).toEqual([...CURVE_TYPES, "highway", "zigzag"]);
  });

  it("works with a registry of version 0.1.5, which has no list group", () => {
    const old = { router: STRATEGIES.router, curve: STRATEGIES.curve, room: STRATEGIES.room };
    expect(listStrategies(old, "group")).toEqual([]);
    expect(listStrategies(register(old, zigzagLike), "curve").map((s) => s.name)).toEqual([...CURVE_TYPES, "highway", "zigzag-like"]);
    expect(STEPS).toEqual(["group", "router", "curve", "room"]);
  });

  it("must have a name that no other strategy of its step has", () => {
    const twin = defineStrategy({ ...elbow, name: "corners", run: (g) => elbow.run(g) });
    expect(() => createRegistry([...BUILT_IN_STRATEGIES, twin])).toThrow(/two strategies with the name "corners"/);
    expect(() => getStrategy(STRATEGIES, "router", "nowhere")).toThrow(/There is no router "nowhere"/);
    expect(() => defineStrategy({ ...elbow, name: "", run: (g) => elbow.run(g) })).toThrow(/no name/);
  });
});
