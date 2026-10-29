import { describe, expect, it } from "vitest";
import type { Edge, Graph, Node } from "../../model.ts";
import { spreadEnds } from "../spread/index.ts";
import { leaderEnds } from "./index.ts";

/** A card of 60 by 100 at the origin, and far boxes to its east at the points `far`. The edges go from the card to the boxes in order. */
function fan(far: readonly { x: number; y: number }[]): Graph {
  const nodes: Node[] = [{ id: "card", box: { x: 0, y: 0, w: 60, h: 100 } }, ...far.map((p, i) => ({ id: `far${i}`, box: { x: p.x, y: p.y, w: 20, h: 20 } }))];
  const edges: Edge[] = far.map((_, i) => ({ id: `e${i}`, source: { node: "card" }, target: { node: `far${i}` } }));
  return { nodes, edges };
}

describe("the plug strategy leaders (EDA-041)", () => {
  it("gives the plugs of spread with the leader s", () => {
    const g = fan([
      { x: 400, y: -200 },
      { x: 120, y: 30 },
      { x: 500, y: 300 },
    ]);
    expect(leaderEnds({ graph: g }, { leader: "s" })).toEqual(spreadEnds({ graph: g }));
  });

  it("orders the po-leaders of a wall by the places of the far ends along the wall", () => {
    // The near box is higher on the screen, but the angle to the far box is less steep. The angles have the other order.
    const g = fan([
      { x: 150, y: 110 },
      { x: 2000, y: 130 },
    ]);
    const s = leaderEnds({ graph: g }, { leader: "s" }).map((p) => p.source.point.y);
    const po = leaderEnds({ graph: g }).map((p) => p.source.point.y);
    expect(s[0]!).toBeGreaterThan(s[1]!);
    expect(po[0]!).toBeLessThan(po[1]!);
  });

  it("puts the opo plugs of a wall at even places", () => {
    const g = fan([
      { x: 400, y: 0 },
      { x: 400, y: 10 },
      { x: 400, y: 20 },
      { x: 400, y: 30 },
    ]);
    const y = leaderEnds({ graph: g }, { leader: "opo" })
      .map((p) => p.source.point.y)
      .sort((a, b) => a - b);
    for (let i = 1; i < y.length; i++) expect(y[i]! - y[i - 1]!).toBeCloseTo(22, 9);
    for (const p of leaderEnds({ graph: g }, { leader: "opo" })) expect(p.source.point.x).toBe(60);
  });

  it("keeps the least gap of slotSpacing", () => {
    const g = fan(Array.from({ length: 5 }, () => ({ x: 400, y: 40 })));
    const y = leaderEnds({ graph: g }, { slotSpacing: 3 })
      .map((p) => p.source.point.y)
      .sort((a, b) => a - b);
    for (let i = 1; i < y.length; i++) expect(y[i]! - y[i - 1]!).toBeGreaterThanOrEqual(3 - 1e-9);
  });
});
