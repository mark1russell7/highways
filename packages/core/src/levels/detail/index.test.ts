import { describe, expect, it } from "vitest";
import { checkLevels, checkProperties } from "../../bench/properties.ts";
import { resultHash } from "../../bench/screen/exercise.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs } from "../../bench/screen/set.ts";
import type { LevelItem, LevelLink } from "../../model.ts";
import { asRouter, checkOptions, levelStrategies, routerStrategies, type Strategy } from "../../strategies/index.ts";
import { collapseLinks, DETAIL_DEFAULTS, detailWidth } from "./index.ts";

const sections = routerStrategies.sections as Strategy<"router">;
const boards = screenInputs()
  .slice(0, 6)
  .map((i) => ({ id: i.id, graph: inputGraph(i) }));

/** Two items on the left and two on the right. The two links run side by side, 3 units apart, in the middle. */
const items: LevelItem[] = [
  { id: "a", box: { x: 0, y: 0, w: 20, h: 20 }, nodes: ["a"] },
  { id: "b", box: { x: 0, y: 40, w: 20, h: 20 }, nodes: ["b"] },
  { id: "c", box: { x: 200, y: 0, w: 20, h: 20 }, nodes: ["c"] },
  { id: "d", box: { x: 200, y: 40, w: 20, h: 20 }, nodes: ["d"] },
];
const links: LevelLink[] = [
  {
    source: "a",
    target: "c",
    count: 3,
    points: [
      { x: 20, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 28 },
      { x: 150, y: 28 },
      { x: 150, y: 10 },
      { x: 200, y: 10 },
    ],
  },
  {
    source: "b",
    target: "d",
    count: 1,
    points: [
      { x: 20, y: 50 },
      { x: 60, y: 50 },
      { x: 60, y: 31 },
      { x: 140, y: 31 },
      { x: 140, y: 50 },
      { x: 200, y: 50 },
    ],
  },
];

describe("the level strategy detail (WILD-016 with EDA-038)", () => {
  it("gives the width of a stroke by its count", () => {
    expect(detailWidth(1)).toBeCloseTo(1.5, 9);
    expect(detailWidth(4)).toBeCloseTo(4.5, 9);
    expect(detailWidth(4, { w0: 2, widthScale: "sqrt" })).toBeCloseTo(4, 9);
    expect(detailWidth(4, { w0: 2, widthScale: "linear" })).toBeCloseTo(8, 9);
  });

  it("moves the leg of the smaller count onto the leg of the larger count", () => {
    const out = collapseLinks(items, links, 4, 2);
    expect(out[0]).toBe(links[0]);
    expect(out[1]!.points[2]).toEqual({ x: 60, y: 28 });
    expect(out[1]!.points[3]).toEqual({ x: 140, y: 28 });
    // The ends stay on their items.
    expect(out[1]!.points[0]).toEqual(links[1]!.points[0]);
    expect(out[1]!.points[out[1]!.points.length - 1]).toEqual(links[1]!.points[5]);
  });

  it("keeps the legs that are far apart, and a cluster below minCount", () => {
    expect(collapseLinks(items, links, 2, 2)).toEqual(links);
    expect(collapseLinks(items, links, 4, 5)).toEqual(links);
  });

  it("keeps the routes of sections, and gives levels with no break of a hard rule", () => {
    for (const { id, graph } of boards) {
      const plain = asRouter(sections).route(graph);
      const detail = asRouter(sections, { level: levelStrategies.detail, levelOptions: { ...DETAIL_DEFAULTS } }).route(graph);
      expect(resultHash({ ...detail, levels: [] }), id).toBe(resultHash({ ...plain, levels: [] }));
      expect(checkLevels(graph, detail.levels ?? [], 1_000_000), id).toEqual([]);
      expect(checkProperties(graph, detail, 1_000_000), id).toEqual(checkProperties(graph, plain, 1_000_000));
    }
  }, 60_000);

  // The items of `packed-grid` touch, so some links have no length. Each level link still starts on the box of its source.
  it("gives links that start and end on their items when the items touch", () => {
    for (const input of screenInputs().filter((i) => i.id.includes("packed-grid")).slice(0, 2)) {
      const graph = inputGraph(input);
      const detail = asRouter(sections, { level: levelStrategies.detail, levelOptions: { ...DETAIL_DEFAULTS, pxMin: 4 } }).route(graph);
      expect(checkLevels(graph, detail.levels ?? [], 1_000_000), input.id).toEqual([]);
    }
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(levelStrategies.detail, DETAIL_DEFAULTS)).toEqual([]);
  });
});
