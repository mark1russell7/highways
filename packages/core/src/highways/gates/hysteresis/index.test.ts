import { describe, expect, it } from "vitest";
import type { Graph } from "../../../model.ts";
import { STRATEGIES } from "../../../strategies/builtins.ts";
import { getStrategy } from "../../../strategies/model.ts";
import { CORRIDOR_DEFAULTS } from "../../corridors/index.ts";
import { memberAt, type Highway, type HighwayPlan } from "../../model.ts";
import { HYSTERESIS_DEFAULTS, hysteresisPlan } from "./index.ts";

const spine = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];
const highway = (id: string, edges: readonly string[]): Highway => ({ id, key: id, spine, lanes: [...edges], members: edges.map((e, i) => memberAt(spine, e, 0, 100, i)) });
const graph: Graph = {
  nodes: [],
  edges: ["a", "b", "c", "d", "e"].map((id) => ({ id, source: { node: "s" }, target: { node: id } })),
};
const ids = (p: HighwayPlan): string[] => p.highways.map((h) => h.id);

describe("the gate hysteresis (HWY-046)", () => {
  const now: HighwayPlan = { highways: [highway("big", ["a", "b", "c"]), highway("pair", ["d", "e"])] };

  it("keeps only the highways with `kOn` edges or more when no earlier plan is present", () => {
    expect(ids(hysteresisPlan({ graph }, now, { kOn: 3, kOff: 2 }))).toEqual(["big"]);
  });

  it("keeps a highway between the limits when it was in the earlier plan", () => {
    const previous = { graph, plan: { highways: [highway("old", ["d", "e", "a"])] } };
    expect(ids(hysteresisPlan({ graph, previous }, now, { kOn: 3, kOff: 2 }))).toEqual(["big", "pair"]);
  });

  it("drops a highway below `kOff` edges, also when it was in the earlier plan", () => {
    const previous = { graph, plan: now };
    expect(ids(hysteresisPlan({ graph, previous }, now, { kOn: 4, kOff: 3 }))).toEqual(["big"]);
  });

  it("is in the registry as `corridors+hysteresis`", () => {
    const s = getStrategy(STRATEGIES, "highway", "corridors+hysteresis");
    expect(s.defaults).toEqual({ ...CORRIDOR_DEFAULTS, ...HYSTERESIS_DEFAULTS });
  });
});
