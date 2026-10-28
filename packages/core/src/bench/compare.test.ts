import { describe, expect, it } from "vitest";
import { packedGridBoard } from "../cases.ts";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import { highwayRouterStrategy } from "../highways/router.ts";
import { STRATEGIES } from "../strategies/builtins.ts";
import { createRegistry, getStrategy, listStrategies, STEPS } from "../strategies/model.ts";
import { COMPARE_ALL_STEPS, compareAnyStep, compareStep, highwayRouters } from "./compare.ts";

/** The smallest fixture, with made-up data. */
const tiny = makeFixture(FIXTURES.find((f) => f.name === "tiny-uniform")!);

describe("compareAnyStep (COMPARE-ALL)", () => {
  it("compares each step of STEPS", () => {
    expect(COMPARE_ALL_STEPS).toEqual(STEPS);
  });

  it("gives a router for each highway strategy, in the order of the registry", () => {
    expect(highwayRouters(STRATEGIES).map((r) => r.name)).toEqual(listStrategies(STRATEGIES, "highway").map((s) => s.name));
  });

  it("measures a highway strategy as the router of its plan and `follow`", () => {
    const registry = createRegistry([getStrategy(STRATEGIES, "highway", "corridors"), getStrategy(STRATEGIES, "highway", "keys")]);
    const rows: string[] = [];
    const all = compareAnyStep("highway", tiny, { registry, stabilityMax: 0, onRow: (row, done, total) => rows.push(`${row.strategy} ${done}/${total}`) });
    expect(rows).toEqual(["corridors 1/2", "keys 2/2"]);
    const corridors = getStrategy(STRATEGIES, "highway", "corridors");
    const one = compareStep("router", tiny, { registry: createRegistry([highwayRouterStrategy(corridors)]), stabilityMax: 0 }).rows[0]!;
    const { ms: _a, ...fromAny } = all.rows[0]!.values;
    const { ms: _b, ...fromRouter } = one.values;
    expect(all.rows[0]!.step).toBe("highway");
    expect(all.rows[0]!.violations).toBe(one.violations);
    expect(fromAny).toEqual(fromRouter);
    expect(all.front.length).toBeGreaterThan(0);
  });

  it("opens the gaps of a packed board with each room strategy, and measures the open board", () => {
    const board = packedGridBoard();
    const all = compareAnyStep("room", board);
    expect(all.rows.map((r) => r.strategy)).toEqual(listStrategies(STRATEGIES, "room").map((s) => s.name));
    for (const row of all.rows) {
      expect(row.boxes, row.strategy).toHaveLength(board.nodes.length);
      for (const key of ["M1.area", "M4.laneThrough", "crossings", "through", "R6.worstDetour", "room-order"]) expect(row.values[key], `${row.strategy} ${key}`).toBeTypeOf("number");
      expect(row.values["M1.area"], row.strategy).toBeGreaterThanOrEqual(1);
    }
  });
});
