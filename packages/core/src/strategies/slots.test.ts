import { describe, expect, it } from "vitest";
import { stepRouterStrategy } from "../bench/compare.ts";
import { resultHash } from "../bench/screen/exercise.ts";
import { inputGraph } from "../bench/screen/forms.ts";
import { screenInputs } from "../bench/screen/set.ts";
import { highwayRouterStrategy } from "../highways/router.ts";
import { openGaps, roomLinks } from "../room/index.ts";
import { strategyKey } from "../whole/pipeline/index.ts";
import {
  asRouter,
  checkSchema,
  getStrategy,
  groupStrategies,
  highwayStrategies,
  levelStrategies,
  listStrategies,
  plugStrategies,
  roomStrategies,
  routerStrategies,
  STEPS,
  STRATEGIES,
  wholeStrategies,
  type Strategy,
} from "./index.ts";

const boards = screenInputs().map((i) => ({ id: i.id, graph: inputGraph(i) }));
const corners = routerStrategies.corners as Strategy<"router">;
const sections = routerStrategies.sections as Strategy<"router">;
const hash = (router: Strategy<"router">, graph: ReturnType<typeof inputGraph>, options?: object): string =>
  resultHash(asRouter(router, options).route(graph));

describe("the strategy slots of the steps plugs, levels and whole (STEP-SLOTS)", () => {
  it("give a list of strategies for each step of STEPS", () => {
    for (const step of STEPS) expect(listStrategies(STRATEGIES, step).length, step).toBeGreaterThan(0);
    expect(getStrategy(STRATEGIES, "plugs", "facing")).toBe(plugStrategies.facing);
    expect(getStrategy(STRATEGIES, "levels", "depths")).toBe(levelStrategies.depths);
    expect(getStrategy(STRATEGIES, "whole", "pipeline")).toBe(wholeStrategies.pipeline);
    for (const s of [plugStrategies.facing, levelStrategies.depths, wholeStrategies.pipeline]) expect(checkSchema(s), s.name).toEqual([]);
  });

  it("find the option of a router that takes a strategy of one step", () => {
    expect(strategyKey(corners, "plugs")).toBe("plug");
    expect(strategyKey(sections, "levels")).toBe("level");
    expect(strategyKey(sections, "group")).toBe("group");
    expect(strategyKey(corners, "levels")).toBeUndefined();
  });

  it("give the routes of today with each default, on each board of screen-v1", () => {
    for (const { id, graph } of boards) {
      const before = hash(corners, graph);
      expect(hash(corners, graph, { plug: plugStrategies.facing }), id).toBe(before);
      expect(hash(stepRouterStrategy(plugStrategies.facing), graph), id).toBe(before);
      expect(resultHash(wholeStrategies.pipeline.run(graph).result), id).toBe(before);
      expect(hash(stepRouterStrategy(wholeStrategies.pipeline), graph), id).toBe(before);
      expect(wholeStrategies.pipeline.run(graph).graph).toBe(graph);
      const levels = hash(sections, graph);
      expect(hash(sections, graph, { level: levelStrategies.depths }), id).toBe(levels);
      expect(hash(stepRouterStrategy(levelStrategies.depths), graph), id).toBe(levels);
    }
  }, 120_000);

  it("give the routes of today with the default plug rule and plug gaps, and with the level options of the router", () => {
    for (const { id, graph } of boards.slice(0, 4)) {
      expect(hash(corners, graph, { plugGap: 4, plug: plugStrategies.facing }), id).toBe(hash(corners, graph, { plugGap: 4 }));
      const own = { levels: [0, 2], margin: 7, tightMargin: 2 };
      expect(hash(sections, graph, { ...own, level: levelStrategies.depths }), id).toBe(hash(sections, graph, own));
    }
  });

  it("run the strategies of the other steps in the pipeline as the demo of the site does", () => {
    const { graph } = boards[0]!;
    const quadtree = groupStrategies.quadtree as Strategy<"group">;
    const withGroup = wholeStrategies.pipeline.run(graph, { router: sections, group: quadtree, groupOptions: { cap: 4 } }).result;
    expect(resultHash(withGroup)).toBe(hash(sections, graph, { group: quadtree, groupOptions: { cap: 4 } }));
    // A router without an option of the step takes no rule of that step.
    expect(resultHash(wholeStrategies.pipeline.run(graph, { router: corners, levels: levelStrategies.depths }).result)).toBe(hash(corners, graph));
    const keys = highwayStrategies.keys as Strategy<"highway">;
    expect(resultHash(wholeStrategies.pipeline.run(graph, { router: corners, highway: keys }).result)).toBe(resultHash(asRouter(highwayRouterStrategy(keys) as Strategy<"router">).route(graph)));
    const room = roomStrategies.routes as Strategy<"room">;
    const opened = wholeStrategies.pipeline.run(graph, { router: corners, room });
    expect(opened.graph.nodes).toEqual(openGaps(graph.nodes, room.run({ items: graph.nodes, links: roomLinks(graph) })));
    expect(resultHash(opened.result)).toBe(hash(corners, opened.graph));
  });
});
