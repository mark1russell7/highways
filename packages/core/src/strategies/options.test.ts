import { describe, expect, it } from "vitest";
import { sameData } from "../bench/run.ts";
import { stretchSettings, sweepSections, type SectionsBenchRow } from "../bench/sections.ts";
import { CASES, packedGridBoard } from "../cases.ts";
import { curveSpace } from "../curves/index.ts";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import type { Graph } from "../model.ts";
import { roomLinks } from "../room/index.ts";
import { ROUTERS } from "../routers/index.ts";
import {
  BUILT_IN_STRATEGIES,
  checkOptions,
  checkSchema,
  clampOptions,
  curveStrategies,
  defineStrategy,
  groupStrategies,
  listOptions,
  optionDefaults,
  roomStrategies,
  routerStrategies,
  sweepGrid,
  sweepOf,
  sweepValues,
  type AnyStrategy,
  type OptionSchema,
} from "./index.ts";

const tiny = makeFixture(FIXTURES.find((f) => f.name === "tiny-uniform")!);
const board = (name: string): Graph => CASES.find((c) => c.name === name)!.make();

/** This function runs a built-in strategy on a small input of its step, with the options. */
function runOn(s: AnyStrategy, options?: object): unknown[] {
  switch (s.step) {
    case "group":
      return [tiny, board("case-many-groups")].map((g) => s.run(g, options));
    case "router":
      return [tiny, board("case-hub-chain")].map((g) => s.run(g, options));
    case "curve": {
      const space = curveSpace(tiny.nodes.map((n) => n.box));
      const routes = ROUTERS.find((r) => r.name === "corners")!.route(tiny).routes;
      return routes.map((r) => s.run({ points: r.points, space }, options));
    }
    case "room": {
      const grid = packedGridBoard();
      return [s.run({ items: grid.nodes, links: roomLinks(grid) }, options)];
    }
  }
}

describe("the declarations of the built-in strategies (OPTS)", () => {
  it("declare each option of the defaults, with a good range, and a test fails for an option without a declaration", () => {
    for (const s of BUILT_IN_STRATEGIES) {
      expect(s.schema, s.name).toBeDefined();
      expect(checkSchema(s), `${s.step} ${s.name}`).toEqual([]);
    }
    const bare = { ...curveStrategies.rounded, defaults: { radius: 12, extra: 1 } };
    expect(checkSchema(bare)).toEqual(['The strategy "rounded" has the option "extra" in its defaults, without a declaration.']);
    const { schema: _schema, ...none } = routerStrategies.trunks;
    expect(checkSchema(none)).toHaveLength(1);
  });

  it("give the true defaults: each strategy gives the same output with optionDefaults as with no option", () => {
    for (const s of BUILT_IN_STRATEGIES) {
      const defaults = optionDefaults(s);
      expect(checkOptions(s, defaults), s.name).toEqual([]);
      expect(sameData(runOn(s, defaults), runOn(s)), `${s.step} ${s.name}`).toBe(true);
    }
  });

  it("keep the defaults of version 0.2.0", () => {
    expect(routerStrategies.sections.defaults).toEqual({});
    expect(routerStrategies["sections-tree"].defaults).toEqual({ stretch: Infinity });
    expect(roomStrategies.routes.defaults).toEqual({});
    expect(optionDefaults(routerStrategies["sections-tree"])).toMatchObject({ stretch: Infinity, hubSlack: 80, cap: 8, margin: 5 });
    expect(optionDefaults(routerStrategies["shared-all"])).not.toHaveProperty("rule");
    expect(optionDefaults(routerStrategies["corners-smooth"])).toEqual({ margin: 5, k: 8, smooth: true });
  });

  it("list the options in the order of the schema, with the effective defaults", () => {
    expect(listOptions(curveStrategies.spline).map((o) => [o.key, o.declaration.type, o.value])).toEqual([["tension", "number", 0]]);
    expect(listOptions(roomStrategies.routes).find((o) => o.key === "lanes")).toMatchObject({ declaration: { type: "enum", values: ["link", "count"] }, value: "link" });
    expect(listOptions(routerStrategies.sections).find((o) => o.key === "group")!.declaration).toMatchObject({ type: "strategy", step: "group" });
    expect(listOptions(routerStrategies.straight)).toEqual([]);
  });
});

describe("the sweeps from the declarations", () => {
  it("give the same table as the hub-limit sweep of CUSTOM on case-hub-chain", () => {
    const graph = board("case-hub-chain");
    const strip = (rows: readonly SectionsBenchRow[]): unknown[] => rows.map((r) => ({ ...r, ms: 0 }));
    const fromSchema = sweepSections("case-hub-chain", graph, sweepOf(routerStrategies.sections, "stretch"));
    expect(strip(fromSchema)).toEqual(strip(sweepSections("case-hub-chain", graph, stretchSettings())));
    expect(fromSchema.map((r) => r.setting)).toEqual(["defaults", "stretch 1.25", "stretch 1.5", "stretch 2", "stretch 3", "stretch Infinity"]);
  });

  it("give values on the range, on the scale and on the step", () => {
    const sections = routerStrategies.sections.schema!;
    expect(sweepValues(sections.cap, { count: 6 })).toEqual([1, 2, 4, 8, 16, 32]);
    expect(sweepValues(sections.cap)).toEqual([4, 6, 8, 12, 16]);
    expect(sweepValues(sections.stretch, { count: 4 })).toEqual([1, 2, 3, 4]);
    expect(sweepValues(sections.stretch, { count: 3, special: true })).toEqual([1, 2.5, 4, Infinity]);
    expect(sweepValues(curveStrategies.spline.schema!.tension)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(sweepValues(sections.k, { count: 4 })).toEqual([2, 7, 11, 16]);
    expect(sweepValues(sections.smooth)).toEqual([false, true]);
    expect(sweepValues(roomStrategies.routes.schema!.lanes)).toEqual(["link", "count"]);
    expect(() => sweepValues(sections.group)).toThrow(/has no sweep/);
    expect(() => sweepOf(routerStrategies.sections, "nowhere" as "cap")).toThrow(/no declaration/);
  });

  it("give a grid of each combination of the keys", () => {
    const grid = sweepGrid(roomStrategies.routes, ["gutter", "passes"]);
    expect(grid).toHaveLength(4 * 2);
    expect(grid[0]).toEqual({ name: "gutter 4, passes 1", options: { gutter: 4, passes: 1 } });
    expect(grid[7]).toEqual({ name: "gutter 16, passes 2", options: { gutter: 16, passes: 2 } });
    expect(sweepGrid(roomStrategies.routes, [])).toEqual([]);
  });
});

describe("the checks of the option values", () => {
  it("report each value without a declaration, of the wrong type or out of the range, and change no value", () => {
    const options = { stretch: 9, hubs: 1.5, cap: 4, smooth: "yes", nowhere: 1 } as unknown as object;
    const issues = checkOptions(routerStrategies.sections, options);
    expect(issues.map((i) => [i.key, i.problem])).toEqual([
      ["stretch", "range"],
      ["hubs", "integer"],
      ["smooth", "type"],
      ["nowhere", "unknown"],
    ]);
    expect(checkOptions(routerStrategies.sections, { stretch: Infinity, hubSlack: 0, levels: [0, 1] })).toEqual([]);
    expect(checkOptions(roomStrategies.routes, { lanes: "all" as "link" })[0]!.problem).toBe("value");
    expect(checkOptions(groupStrategies.keys, { key: 3 as unknown as () => string })[0]!.problem).toBe("type");
  });

  it("clamp each number into its range, and keep the special values", () => {
    expect(clampOptions(routerStrategies.sections, { stretch: 9, hubs: 2.6, hubSlack: Infinity, cap: -3 })).toEqual({ stretch: 4, hubs: 3, hubSlack: Infinity, cap: 1 });
    expect(clampOptions(curveStrategies.spline, { tension: -1 })).toEqual({ tension: 0 });
  });

  it("find the bad declarations of a consumer strategy", () => {
    const bad = defineStrategy({
      step: "curve",
      name: "bad",
      describe: "A test curve with bad declarations.",
      defaults: { size: 50, kind: "a" as "a" | "b" },
      schema: {
        size: { type: "number", min: 10, max: 0, scale: "log", describe: "The size." },
        kind: { type: "enum", values: [], default: "b", describe: "" },
      },
      run: () => [],
    });
    // The range of `size` is bad, and its default 50 is out of it. The enum `kind` has no description and no values, so neither "a" nor "b" fits.
    const issues = checkSchema(bad);
    expect(issues).toHaveLength(6);
    expect(issues.join("\n")).toMatch(/bad range 10 to 0/);
    expect(issues.join("\n")).toMatch(/"size" is 50, out of the range/);
  });
});

describe("the types of the declarations", () => {
  it("match the keys and the value types of the options", () => {
    const good: OptionSchema<{ readonly n?: number; readonly on: boolean; readonly turn: "x" | "y" }> = {
      n: { type: "integer", min: 0, max: 4, describe: "A number." },
      on: { type: "boolean", describe: "A switch." },
      turn: { type: "enum", values: ["x", "y"], describe: "An axis." },
    };
    expect(Object.keys(good)).toEqual(["n", "on", "turn"]);
    // @ts-expect-error The schema has no declaration of the option `on`.
    const missing: OptionSchema<{ readonly n: number; readonly on: boolean }> = { n: { type: "number", min: 0, max: 1, describe: "A number." } };
    const extra: OptionSchema<{ readonly n: number }> = {
      n: { type: "number", min: 0, max: 1, describe: "A number." },
      // @ts-expect-error The options have no key `m`.
      m: { type: "number", min: 0, max: 1, describe: "Not an option." },
    };
    // @ts-expect-error An enum declaration does not fit a number option.
    const wrong: OptionSchema<{ readonly n: number }> = { n: { type: "enum", values: ["a"], describe: "A number." } };
    // @ts-expect-error The value "z" is not a value of the option.
    const value: OptionSchema<{ readonly turn: "x" | "y" }> = { turn: { type: "enum", values: ["x", "z"], describe: "An axis." } };
    expect([missing, extra, wrong, value]).toHaveLength(4);
  });
});
