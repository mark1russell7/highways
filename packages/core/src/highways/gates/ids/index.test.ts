import { describe, expect, it } from "vitest";
import type { Graph } from "../../../model.ts";
import { STRATEGIES } from "../../../strategies/builtins.ts";
import { getStrategy } from "../../../strategies/model.ts";
import { CORRIDOR_DEFAULTS } from "../../corridors/index.ts";
import { memberAt, type Highway, type HighwayPlan } from "../../model.ts";
import { STABLE_ID_DEFAULTS, stableIdPlan } from "./index.ts";

const spine = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];
const highway = (id: string, edges: readonly string[]): Highway => ({ id, key: id, spine, lanes: [...edges], members: edges.map((e, i) => memberAt(spine, e, 0, 100, i)) });
const graph: Graph = {
  nodes: [],
  edges: ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ id, source: { node: "s" }, target: { node: id } })),
};

describe("the gate ids (HWY-054)", () => {
  const before: HighwayPlan = { highways: [highway("h0", ["a", "b", "c"]), highway("h1", ["d", "e"])] };

  it("changes nothing without an earlier plan", () => {
    expect(stableIdPlan({ graph }, before, STABLE_ID_DEFAULTS)).toBe(before);
  });

  it("gives each matched highway the id of its match, and a new id to the others", () => {
    // The new plan numbers its highways again from 0, in another order.
    const after: HighwayPlan = { highways: [highway("h0", ["d", "e", "f"]), highway("h1", ["a", "b", "c"]), highway("h2", ["f", "g"])] };
    const out = stableIdPlan({ graph, previous: { graph, plan: before } }, after, STABLE_ID_DEFAULTS);
    expect(out.highways.map((h) => h.id)).toEqual(["h1", "h0", "h3"]);
    expect(out.highways.map((h) => h.members)).toEqual(after.highways.map((h) => h.members));
  });

  it("is in the registry as `corridors+ids`", () => {
    const s = getStrategy(STRATEGIES, "highway", "corridors+ids");
    expect(s.defaults).toEqual({ ...CORRIDOR_DEFAULTS, ...STABLE_ID_DEFAULTS });
  });
});
