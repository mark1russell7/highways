import { describe, expect, it } from "vitest";
import type { Graph } from "../../model.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { box, commonTests, flows } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { MANIFOLD_DEFAULTS, manifoldPlan } from "./index.ts";

/** One node at the top with edges to a row of five nodes below it. */
const row: Graph = {
  nodes: [{ id: "s", box: box(200, 0) }, ...[0, 1, 2, 3, 4].map((i) => ({ id: `t${i}`, box: box(100 * i, 300) }))],
  edges: [0, 1, 2, 3, 4].map((i) => ({ id: `e${i}`, source: { node: "s" }, target: { node: `t${i}` } })),
};

describe("the highway strategy manifolds (WILD-036)", () => {
  it("gives one horizontal header for a fan to a row, in the gap before the row", () => {
    const plan = manifoldPlan({ graph: row }, { from: "none" });
    expect(checkPlan(row, plan)).toEqual([]);
    expect(plan.highways).toHaveLength(1);
    const h = plan.highways[0]!;
    expect(h.key).toBe("manifold:s:x");
    for (const p of h.spine) {
      expect(p.y).toBeGreaterThan(20);
      expect(p.y).toBeLessThan(300);
    }
    // The header is straight and horizontal, and the near side puts it in the third of the gap next to the row.
    expect(h.spine).toHaveLength(2);
    expect(h.spine[0]!.y).toBeCloseTo(300 - 280 / 3, 6);
    expect(h.spine[1]!.y).toBeCloseTo(h.spine[0]!.y, 9);
  });

  it("puts the header near the feed node with the side far", () => {
    const plan = manifoldPlan({ graph: row }, { from: "none", side: "far" });
    expect(plan.highways[0]!.spine[0]!.y).toBeCloseTo(300 - (2 * 280) / 3, 6);
  });

  it("makes no manifold for a fan smaller than kMin", () => {
    expect(manifoldPlan({ graph: row }, { from: "none", kMin: 6 }).highways).toHaveLength(0);
  });

  it("drops the taps whose way is too long", () => {
    const plan = manifoldPlan({ graph: row }, { from: "none", detour: 1.05 });
    const members = plan.highways.flatMap((h) => h.members.map((m) => m.edge));
    expect(members).not.toContain("e0");
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(highwayStrategies.manifolds, MANIFOLD_DEFAULTS)).toEqual([]);
  });

  commonTests("manifolds", MANIFOLD_DEFAULTS, manifoldPlan, [flows, row]);
});
