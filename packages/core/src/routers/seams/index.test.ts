import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { inputGraph } from "../../bench/screen/forms.ts";
import { screenInputs, SCREEN_V2 } from "../../bench/screen/set.ts";
import type { Graph } from "../../model.ts";
import { checkOptions } from "../../strategies/options.ts";
import { SEAM_DEFAULTS, seamGraph, seamsRouter, seamsStrategy } from "./index.ts";

const board = (seed: number): Graph => inputGraph(screenInputs(SCREEN_V2).find((i) => i.id === `screen-v2/packed-grid/s${seed}`)!);
const passes = (g: Graph): number => checkProperties(g, seamsRouter({ name: "seams" }).route(g), Number.POSITIVE_INFINITY).filter((v) => v.rule === "no-pass-through").length;

describe("the router seams (PASS-SEAMS)", () => {
  it("has corners inside a packed board, on the corners of the real boxes", () => {
    const g = board(8);
    const graph = seamGraph(g.nodes, SEAM_DEFAULTS.k);
    expect(graph.points.filter((p) => p.x > 0 && p.y > 0).length).toBeGreaterThan(100);
    expect(graph.points.some((p) => p.x === 140 && p.y === 90)).toBe(true);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])("gives no pass-through on the packed-grid seed %i", (seed) => {
    expect(passes(board(seed))).toBe(0);
  });

  it("keeps the way of the plain finder on a board with room", () => {
    const g: Graph = {
      nodes: [
        { id: "a", box: { x: 0, y: 0, w: 40, h: 20 } },
        { id: "wall", box: { x: 120, y: -60, w: 20, h: 140 } },
        { id: "b", box: { x: 240, y: 0, w: 40, h: 20 } },
      ],
      edges: [{ id: "e", source: { node: "a" }, target: { node: "b" } }],
    };
    const route = seamsRouter({ name: "seams" }).route(g).routes[0]!;
    expect(route.points.length).toBeGreaterThan(2);
    expect(checkProperties(g, { routes: [route] }, 10)).toEqual([]);
  });

  it("gives the same routes each time", () => {
    const g = board(4);
    expect(seamsRouter({ name: "seams" }).route(g)).toEqual(seamsRouter({ name: "seams" }).route(g));
  });

  it("declares its options", () => {
    expect(checkOptions(seamsStrategy, SEAM_DEFAULTS)).toEqual([]);
  });
});
