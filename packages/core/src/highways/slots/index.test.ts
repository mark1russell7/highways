import { describe, expect, it } from "vitest";
import type { Point } from "../../geom.ts";
import type { Graph } from "../../model.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { basePlan } from "../base.ts";
import { box, clustered, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan, memberAt, type HighwayPlan } from "../model.ts";
import { SLOT_DEFAULTS, slotPlan, slotsOf } from "./index.ts";

/** Five edges from the left to the right: `a` and `c` ride the trunk, `d` and `e` run near it, and `f` runs far from it. */
const lanes: Graph = {
  nodes: ["a", "c", "d", "e", "f"].flatMap((id, i) => [
    { id: `l${id}`, box: box(0, 200 * i) },
    { id: `r${id}`, box: box(600, 200 * i) },
  ]),
  edges: [
    { id: "a", source: { node: "la" }, target: { node: "ra" }, data: { collection: "p" } },
    { id: "c", source: { node: "lc" }, target: { node: "rc" }, data: { collection: "p" } },
    { id: "d", source: { node: "ld" }, target: { node: "rd" }, data: { collection: "p" } },
    { id: "e", source: { node: "le" }, target: { node: "re" }, data: { collection: "q" } },
    { id: "f", source: { node: "lf" }, target: { node: "rf" }, data: { collection: "p" } },
  ],
};

const spine: Point[] = [
  { x: 60, y: 40 },
  { x: 560, y: 40 },
];

/** The plan with one trunk of the key `p`, with the riders `a` and `c`. */
const trunk: HighwayPlan = { highways: [{ id: "h0", key: "p", spine, lanes: ["a", "c"], members: [memberAt(spine, "a", 0, 1), memberAt(spine, "c", 0, 1)] }] };

/** The first routes of the edges outside the trunk: `d` and `e` 12 from the spine, and `f` 60 from it. */
const routes = new Map<string, readonly Point[]>([
  [
    "d",
    [
      { x: 40, y: 52 },
      { x: 600, y: 52 },
    ],
  ],
  [
    "e",
    [
      { x: 40, y: 28 },
      { x: 600, y: 28 },
    ],
  ],
  [
    "f",
    [
      { x: 40, y: 100 },
      { x: 600, y: 100 },
    ],
  ],
]);

const riders = (plan: HighwayPlan): string[] => plan.highways.flatMap((h) => h.members.map((m) => m.edge)).sort();

describe("the highway strategy slots (RULE-047)", () => {
  it("adds a near edge of the key of the trunk on a new outer lane, and keeps a far edge off", () => {
    const plan = slotsOf(lanes, trunk, routes);
    expect(checkPlan(lanes, plan)).toEqual([]);
    expect(riders(plan)).toEqual(["a", "c", "d"]);
    expect(plan.highways[0]!.lanes).toEqual(["a", "c", "d"]);
  });

  it("adds a near edge of another key only with the keys any", () => {
    expect(riders(slotsOf(lanes, trunk, routes, { keys: "any" }))).toEqual(["a", "c", "d", "e"]);
  });

  it("adds no edge when the pull is smaller than the detour, or the stretch is too large", () => {
    expect(riders(slotsOf(lanes, trunk, routes, { pull: 0.25 }))).toEqual(["a", "c"]);
    expect(riders(slotsOf(lanes, trunk, routes, { maxStretch: 1.005 }))).toEqual(["a", "c"]);
  });

  it("keeps each rider of the plan from", () => {
    const first = basePlan({ graph: clustered }, "shared-ways");
    const plan = slotPlan({ graph: clustered });
    const kept = new Set(riders(plan));
    for (const e of riders(first)) expect(kept.has(e), e).toBe(true);
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(highwayStrategies.slots, SLOT_DEFAULTS)).toEqual([]);
  });

  commonTests("slots", SLOT_DEFAULTS, slotPlan, [flows, lanes]);
});
