import { describe, expect, it } from "vitest";
import { stepRouterStrategy } from "../../bench/compare.ts";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import type { Edge, Graph, Node, Port } from "../../model.ts";
import { plugStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { fixPorts } from "../fix.ts";
import { ESCAPE_DEFAULTS, escapeEnds, placeSlots } from "./index.ts";

/** A card of 60 by 100 at the origin, and far boxes to its east at the points `far`. The edges go from the card to the boxes in order. */
function fan(far: readonly { x: number; y: number }[], ports?: readonly Port[]): Graph {
  const card: Node = ports ? { id: "card", box: { x: 0, y: 0, w: 60, h: 100 }, ports } : { id: "card", box: { x: 0, y: 0, w: 60, h: 100 } };
  const nodes: Node[] = [card, ...far.map((p, i) => ({ id: `far${i}`, box: { x: p.x, y: p.y, w: 20, h: 20 } }))];
  const edges: Edge[] = far.map((_, i) => ({ id: `e${i}`, source: ports?.[i] ? { node: "card", port: ports[i]!.id } : { node: "card" }, target: { node: `far${i}` } }));
  return { nodes, edges };
}

/** Three far boxes east of the card, from the top to the bottom. */
const three = fan([
  { x: 400, y: -200 },
  { x: 400, y: 40 },
  { x: 400, y: 300 },
]);

describe("the plug strategy escape (EDA-022)", () => {
  it("places the plugs of a wall in their order on slots, with the least sum of the moves", () => {
    const at = placeSlots([10, 11, 30], 0, 40, 4);
    expect(at).toEqual([8, 12, 28]);
    expect(at.reduce((s, v, i) => s + Math.abs(v - [10, 11, 30][i]!), 0)).toBe(5);
    // Two slots hold no three plugs, so the gap shrinks evenly.
    expect(placeSlots([5, 5, 5], 0, 4, 4)).toEqual([0, 2, 4]);
    expect(placeSlots([], 0, 4, 4)).toEqual([]);
  });

  it("gives the plugs of one wall the order of their ways, with the gap of the slots", () => {
    for (const method of ["sort", "flow"] as const) {
      const pairs = escapeEnds({ graph: three }, { method });
      expect(pairs.map((p) => p.edge)).toEqual(["e0", "e1", "e2"]);
      const ys = pairs.map((p) => p.source.point.y);
      for (const p of pairs) expect(p.source.point.x, method).toBe(60);
      expect(ys[0]!, method).toBeLessThan(ys[1]!);
      expect(ys[1]!, method).toBeLessThan(ys[2]!);
      for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!, method).toBeGreaterThanOrEqual(ESCAPE_DEFAULTS.slotSpacing - 1e-9);
      // The reserve of each corner: 0.1 of the side of 100.
      for (const y of ys) expect(y, method).toBeGreaterThanOrEqual(10 - 1e-9);
      for (const y of ys) expect(y, method).toBeLessThanOrEqual(90 + 1e-9);
    }
  });

  it("keeps a fixed plug at its point, and a plug of a port with a range in its range", () => {
    const ports: Port[] = [
      { id: "p0", side: "east", at: { x: 60, y: 50 } },
      { id: "p1", side: "east", range: [0.6, 0.9] },
      { id: "p2", side: "east" },
    ];
    const g = fan(
      [
        { x: 400, y: -200 },
        { x: 400, y: -150 },
        { x: 400, y: 300 },
      ],
      ports,
    );
    const pairs = escapeEnds({ graph: g });
    expect(pairs[0]!.source.point).toEqual({ x: 60, y: 50 });
    const y1 = pairs[1]!.source.point.y;
    expect(y1).toBeGreaterThanOrEqual(60 - 1e-9);
    expect(y1).toBeLessThanOrEqual(90 + 1e-9);
    expect(Math.abs(y1 - 50)).toBeGreaterThanOrEqual(ESCAPE_DEFAULTS.slotSpacing - 1e-9);
  });

  it("gives the same plugs each time, and routes with no break of a hard rule", () => {
    const router = stepRouterStrategy(plugStrategies.escape);
    for (const graph of [three, hub, clustered]) {
      expect(escapeEnds({ graph })).toEqual(escapeEnds({ graph }));
      expect(plugStrategies.escape.run({ graph }, { ...ESCAPE_DEFAULTS })).toEqual(escapeEnds({ graph }));
      expect(checkProperties(graph, router.run(graph, {}), 1_000_000)).toEqual([]);
    }
  });

  it("fixes the plugs of the ports with fixPorts", () => {
    const fixed = fixPorts(three, "escape");
    expect(fixed.edges.length).toBe(three.edges.length);
    expect(checkProperties(fixed, stepRouterStrategy(plugStrategies.facing).run(fixed, {}), 1_000_000)).toEqual([]);
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(plugStrategies.escape, ESCAPE_DEFAULTS)).toEqual([]);
  });
});
