import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { CASES } from "../../cases.ts";
import { dist } from "../../geom.ts";
import { lineDensity } from "../../highways/ridges/index.ts";
import type { Graph } from "../../model.ts";
import { sectionsRouter } from "../../routers/sections.ts";
import { allSections, buildSections, checkSections } from "../../sections.ts";
import { groupStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { depositPeaks, growDeposit, TERMITE_DEFAULTS, termiteGroups, termitePeaks } from "./index.ts";

const node = (id: string, x: number, y: number): Graph["nodes"][number] => ({ id, box: { x, y, w: 40, h: 20 } });

/** Three edges that cross near the point (400, 300), and a row of nodes with no edge far to the right. So the mean of the nodes is far from the crossing. */
const crossing: Graph = {
  nodes: [
    node("a", 100, 100),
    node("b", 660, 480),
    node("c", 660, 100),
    node("d", 100, 480),
    node("e", 380, 40),
    node("f", 380, 560),
    ...[0, 1, 2, 3, 4, 5].map((i) => node(`far${i}`, 2_000, 60 * i)),
  ],
  edges: [
    { id: "x", source: { node: "a" }, target: { node: "b" } },
    { id: "y", source: { node: "c" }, target: { node: "d" } },
    { id: "z", source: { node: "e" }, target: { node: "f" } },
  ],
};

describe("the group strategy termites (NAT-010)", () => {
  it("grows the strong deposit against the weak deposit", () => {
    const lines = [
      [{ x: 0, y: 50 }, { x: 200, y: 50 }],
      [{ x: 100, y: 0 }, { x: 100, y: 200 }],
    ];
    const image = lineDensity(lines, { x: 0, y: 0, w: 200, h: 200 }, 10, 10);
    const at = (v: Float64Array, x: number, y: number): number => v[Math.floor((y - image.y0) / 10) * image.w + Math.floor((x - image.x0) / 10)]!;
    const start = at(image.rho, 20, 50) / at(image.rho, 100, 50);
    const grown = growDeposit(image, 10, 0.2);
    expect(at(grown, 20, 50) / at(grown, 100, 50)).toBeLessThan(start);
  });

  it("keeps the peaks apart by the radius", () => {
    const image = lineDensity([[{ x: 0, y: 100 }, { x: 400, y: 100 }], [{ x: 100, y: 0 }, { x: 100, y: 200 }], [{ x: 300, y: 0 }, { x: 300, y: 200 }]], { x: 0, y: 0, w: 400, h: 200 }, 10, 10);
    const peaks = depositPeaks(image, growDeposit(image, 5, 0.2), 60);
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < peaks.length; i++) for (let j = 0; j < i; j++) expect(dist(peaks[i]!.at, peaks[j]!.at)).toBeGreaterThanOrEqual(60);
    expect(dist(peaks[0]!.at, { x: 100, y: 100 })).toBeLessThanOrEqual(30);
  });

  it("finds the crossing of the lines as the strongest peak, and puts the hub of the root there", () => {
    const peaks = termitePeaks(crossing, TERMITE_DEFAULTS);
    expect(dist(peaks[0]!.at, { x: 400, y: 290 })).toBeLessThanOrEqual(60);
    const root = termiteGroups(crossing, TERMITE_DEFAULTS);
    checkSections(root, crossing.nodes.length);
    expect(root.hub).toEqual(peaks[0]!.at);
    // The mean of the nodes is far to the right of the hub.
    const mean = crossing.nodes.reduce((s, n) => s + n.box.x, 0) / crossing.nodes.length;
    expect(mean - root.hub!.x).toBeGreaterThan(400);
  });

  it("keeps the tree of the quadtree, and gives only hubs", () => {
    const strip = (s: ReturnType<typeof buildSections>): unknown => ({ id: s.id, nodes: s.nodes, children: s.children.map(strip) });
    expect(strip(termiteGroups(crossing))).toEqual(strip(buildSections(crossing.nodes)));
    const hubs = [...allSections(termiteGroups(crossing))].filter((s) => s.hub !== undefined);
    for (const s of hubs) {
      expect(s.nodes.length).toBeGreaterThanOrEqual(2);
      expect(s.hub!.x).toBeGreaterThanOrEqual(s.cell.x);
      expect(s.hub!.x).toBeLessThan(s.cell.x + s.cell.w);
    }
  });

  it("moves the routes of the router sections, with no break of a hard rule", () => {
    const board = CASES.find((c) => c.name === "case-hub-chain")!.make();
    const plain = sectionsRouter({ name: "sections", group: groupStrategies.quadtree }).route(board);
    const moved = sectionsRouter({ name: "sections", group: groupStrategies.termites }).route(board);
    expect(checkProperties(board, moved, 1_000_000)).toEqual([]);
    expect(JSON.stringify(moved.routes)).not.toBe(JSON.stringify(plain.routes));
  });

  it("declares its options", () => {
    expect(checkOptions(groupStrategies.termites, TERMITE_DEFAULTS)).toEqual([]);
  });
});
