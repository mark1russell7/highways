import { expect, it } from "vitest";
import { checkProperties } from "../bench/properties.ts";
import { inputGraph } from "../bench/screen/forms.ts";
import { screenInputs } from "../bench/screen/set.ts";
import { CASES } from "../cases.ts";
import type { Box } from "../geom.ts";
import type { Graph } from "../model.ts";
import { STRATEGIES } from "../strategies/builtins.ts";
import { getStrategy } from "../strategies/model.ts";
import { checkPlan, type HighwayInput, type HighwayPlan } from "./model.ts";
import { highwayRouterStrategy } from "./router.ts";

/** This function gives a box at `x`, `y` with the size `w` by `h`. */
export const box = (x: number, y: number, w = 40, h = 20): Box => ({ x, y, w, h });

/** The case `case-hub-chain`. */
export const hub: Graph = CASES.find((c) => c.name === "case-hub-chain")!.make();

/** The input `screen-v1/small-clustered/s0`. */
export const clustered: Graph = inputGraph(screenInputs().find((i) => i.id === "screen-v1/small-clustered/s0")!);

/** Three edges from one area on the left to one area on the right (one of them reversed), and two edges from the top to the bottom. Two keys alternate. */
export const flows: Graph = {
  nodes: [
    ...[0, 1, 2].flatMap((i) => [
      { id: `l${i}`, box: box(0, 30 * i) },
      { id: `r${i}`, box: box(600, 30 * i) },
    ]),
    ...[0, 1].flatMap((i) => [
      { id: `u${i}`, box: box(250 + 60 * i, -400) },
      { id: `d${i}`, box: box(250 + 60 * i, 400) },
    ]),
  ],
  edges: [
    { id: "a", source: { node: "l0" }, target: { node: "r0" }, data: { collection: "p" } },
    { id: "b", source: { node: "l1" }, target: { node: "r1" }, data: { collection: "q" } },
    { id: "c", source: { node: "r2" }, target: { node: "l2" }, data: { collection: "p" } },
    { id: "x", source: { node: "u0" }, target: { node: "d0" }, data: { collection: "p" } },
    { id: "y", source: { node: "u1" }, target: { node: "d1" }, data: { collection: "q" } },
  ],
};

/** Three thin nodes on the left and three on the right, with three near horizontal edges between them. */
export const parallel: Graph = {
  nodes: [0, 1, 2].flatMap((i) => [
    { id: `l${i}`, box: box(0, 8 * i, 40, 6) },
    { id: `r${i}`, box: box(600, 8 * i, 40, 6) },
  ]),
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `l${i}` }, target: { node: `r${i}` } })),
};

/**
 * This function adds the common tests of a highway strategy: it is in the registry, it gives a correct plan the same each time,
 * and its routes break no hard rule after `follow`.
 */
export function commonTests<O>(name: string, defaults: O, plan: (input: HighwayInput, o: O) => HighwayPlan, graphs: readonly Graph[]): void {
  it("is in the registry, and gives a correct plan, the same each time", () => {
    const strategy = getStrategy(STRATEGIES, "highway", name);
    for (const graph of [...graphs, hub, clustered]) {
      const made = strategy.run({ graph }, { ...defaults });
      expect(checkPlan(graph, made)).toEqual([]);
      expect(plan({ graph }, defaults)).toEqual(made);
    }
  });

  it("gives routes with no break of a hard rule after follow", () => {
    const router = highwayRouterStrategy(getStrategy(STRATEGIES, "highway", name));
    expect(checkProperties(hub, router.run(hub), 1_000_000)).toEqual([]);
    expect(checkProperties(clustered, router.run(clustered), 1_000_000)).toEqual([]);
  });
}
