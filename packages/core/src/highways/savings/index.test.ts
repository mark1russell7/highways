import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import type { Graph } from "../../model.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { box, commonTests, flows, parallel, rows } from "../fixtures.test-util.ts";
import { follow } from "../follow.ts";
import { checkPlan } from "../model.ts";
import { fairMerge, SAVINGS_DEFAULTS, savingsBundles, savingsPlan } from "./index.ts";

/** Two long edges side by side, one of them in the opposite direction, and a short edge next to them. */
const board: Graph = {
  nodes: [
    { id: "l0", box: box(0, 0) },
    { id: "r0", box: box(800, 0) },
    { id: "l1", box: box(0, 30) },
    { id: "r1", box: box(800, 30) },
    { id: "s", box: box(370, 70) },
    { id: "t", box: box(450, 70) },
  ],
  edges: [
    { id: "a", source: { node: "l0" }, target: { node: "r0" } },
    { id: "b", source: { node: "r1" }, target: { node: "l1" } },
    { id: "c", source: { node: "s" }, target: { node: "t" } },
  ],
};

describe("the highway strategy savings (WILD-033)", () => {
  it("accepts a merge only when each edge pays no more than alone", () => {
    const two = [
      { own: 0, alone: 100 },
      { own: 0, alone: 100 },
    ];
    expect(fairMerge(two, 100, { detour: 1.5, share: "equal" })).toBe(true);
    // The short edge pays half of the trunk, which is more than its way alone.
    const short = [
      { own: 0, alone: 100 },
      { own: 0, alone: 30 },
    ];
    expect(fairMerge(short, 100, { detour: 4, share: "equal" })).toBe(false);
    // The detour pays with the share, so a long ride costs more than the way alone.
    expect(fairMerge([{ own: 80, alone: 100 }, { own: 80, alone: 100 }], 100, { detour: 2, share: "equal" })).toBe(false);
    // The cap of the way along the bundle.
    expect(fairMerge(two, 120, { detour: 1.1, share: "equal" })).toBe(false);
    // By length, the short edge pays a small share.
    expect(fairMerge([{ own: 0, alone: 400 }, { own: 0, alone: 60 }], 60, { detour: 2, share: "length" })).toBe(true);
    expect(fairMerge([{ own: 0, alone: 400 }, { own: 0, alone: 60 }], 200, { detour: 4, share: "equal" })).toBe(false);
  });

  it("merges the long edges, flips an edge in the opposite direction, and keeps the short edge out by the fair share", () => {
    const groups = savingsBundles({ graph: board }, SAVINGS_DEFAULTS);
    const [a, b, c] = ["a", "b", "c"].map((e) => groups.get(e)!);
    expect(a!.key).toBe(b!.key);
    expect(a!.flip).not.toBe(b!.flip);
    expect(c!.key).not.toBe(a!.key);
    const plan = savingsPlan({ graph: board }, SAVINGS_DEFAULTS);
    expect(plan.highways).toHaveLength(1);
    expect(plan.highways[0]!.lanes.toSorted()).toEqual(["a", "b"]);
    expect(checkPlan(board, plan)).toEqual([]);
    expect(checkProperties(board, follow(board, plan), 1_000_000)).toEqual([]);
  });

  it("takes the largest saving first: a pair with a low saving does not stop a pair with a high saving", () => {
    const three: Graph = {
      nodes: [0, 1, 2].flatMap((i) => [
        { id: `l${i}`, box: box(0, 30 * i) },
        { id: `r${i}`, box: box(i === 2 ? 300 : 800, 30 * i) },
      ]),
      edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `l${i}` }, target: { node: `r${i}` } })),
    };
    const groups = savingsBundles({ graph: three }, SAVINGS_DEFAULTS);
    expect(groups.get("e0")!.key).toBe(groups.get("e1")!.key);
  });

  it("gives no highway when the way alone is cheaper for an edge", () => {
    const apart: Graph = {
      nodes: [
        { id: "a", box: box(0, 0) },
        { id: "b", box: box(100, 0) },
        { id: "c", box: box(0, 500) },
        { id: "d", box: box(100, 500) },
      ],
      edges: [
        { id: "x", source: { node: "a" }, target: { node: "b" } },
        { id: "y", source: { node: "c" }, target: { node: "d" } },
      ],
    };
    expect(savingsPlan({ graph: apart }, SAVINGS_DEFAULTS).highways).toEqual([]);
  });

  it("declares its options", () => {
    expect(checkOptions(highwayStrategies.savings, SAVINGS_DEFAULTS)).toEqual([]);
  });

  commonTests("savings", SAVINGS_DEFAULTS, savingsPlan, [flows, parallel, rows, board]);
});
