import { describe, expect, it } from "vitest";
import { checkLevels, checkProperties } from "../../bench/properties.ts";
import { resultHash } from "../../bench/screen/exercise.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import { asRouter, checkOptions, levelStrategies, routerStrategies, type Strategy } from "../../strategies/index.ts";
import { aroundBox, backboneLinks, VENATION_DEFAULTS } from "./index.ts";

const sections = routerStrategies.sections as Strategy<"router">;
const boards = screenInputs()
  .slice(0, 6)
  .map((i) => ({ id: i.id, graph: inputGraph(i) }));

describe("the level strategy venation (NAT-016)", () => {
  it("gives the relative neighbourhood graph and the Gabriel graph of a square with its center", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 1, y: 1 },
    ];
    // Each corner links only to the center: the center is nearer to both ends of each side.
    expect(backboneLinks(square, "rng")).toEqual([
      [0, 4],
      [1, 4],
      [2, 4],
      [3, 4],
    ]);
    // The center is on the circle of each side, not inside it, so the Gabriel graph keeps the four sides too.
    expect(backboneLinks(square, "gabriel").length).toBe(8);
  });

  it("goes around a box on the shorter side", () => {
    const way = aroundBox({ x: 0, y: 0, w: 10, h: 10 }, 1, { x: 0, y: 2 }, { x: 10, y: 2 });
    expect(way).toEqual([
      { x: -1, y: 2 },
      { x: -1, y: -1 },
      { x: 11, y: -1 },
      { x: 11, y: 2 },
    ]);
  });

  it("keeps the routes of sections, and gives levels with no break of a hard rule", () => {
    let changed = 0;
    for (const { id, graph } of boards) {
      const plain = asRouter(sections).route(graph);
      const vein = asRouter(sections, { level: levelStrategies.venation, levelOptions: { ...VENATION_DEFAULTS } }).route(graph);
      expect(resultHash({ ...vein, levels: [] }), id).toBe(resultHash({ ...plain, levels: [] }));
      expect(checkLevels(graph, vein.levels ?? [], 1_000_000), id).toEqual([]);
      expect(checkProperties(graph, vein, 1_000_000), id).toEqual(checkProperties(graph, plain, 1_000_000));
      if (JSON.stringify(vein.levels) !== JSON.stringify(plain.levels)) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(levelStrategies.venation, VENATION_DEFAULTS)).toEqual([]);
  });
});
