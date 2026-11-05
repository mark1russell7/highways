import { describe, expect, it } from "vitest";
import { stepRouterStrategy } from "../../bench/compare.ts";
import { checkProperties } from "../../bench/properties.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import type { Edge, Graph, Node, Port } from "../../model.ts";
import { plugStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { AUCTION_DEFAULTS, auctionAssign, auctionEnds } from "./index.ts";

/** A card of 60 by 100 at the origin, and far boxes at the points `far`. The edges go from the card to the boxes in order. */
function fan(far: readonly { x: number; y: number }[], ports?: readonly Port[]): Graph {
  const card: Node = ports ? { id: "card", box: { x: 0, y: 0, w: 60, h: 100 }, ports } : { id: "card", box: { x: 0, y: 0, w: 60, h: 100 } };
  const nodes: Node[] = [card, ...far.map((p, i) => ({ id: `far${i}`, box: { x: p.x, y: p.y, w: 20, h: 20 } }))];
  const edges: Edge[] = far.map((_, i) => ({ id: `e${i}`, source: ports?.[i] ? { node: "card", port: ports[i]!.id } : { node: "card" }, target: { node: `far${i}` } }));
  return { nodes, edges };
}

describe("the plug strategy auction (WILD-003)", () => {
  it("gives the assignment with the least sum of the costs", () => {
    // Bidder 0 wants place 0 a little, and bidder 1 wants place 0 a lot. The best sum gives place 0 to bidder 1.
    const costs = [
      [1, 2],
      [0, 5],
    ];
    const pick = auctionAssign(2, 2, (i) => costs[i]!.map((c, j) => [j, c] as const), 0.01);
    expect(pick).toEqual([1, 0]);
  });

  it("gives each free plug of a box its own slot, on the side of its far end", () => {
    const g = fan([
      { x: 400, y: -200 },
      { x: 400, y: 40 },
      { x: 400, y: 300 },
      { x: -400, y: 40 },
    ]);
    const pairs = auctionEnds({ graph: g });
    expect(pairs.map((p) => p.edge)).toEqual(["e0", "e1", "e2", "e3"]);
    const points = pairs.map((p) => `${p.source.point.x},${p.source.point.y}`);
    expect(new Set(points).size).toBe(4);
    // The far box to the west gets a slot on the west side.
    expect(pairs[3]!.source.point.x).toBe(0);
    expect(pairs[1]!.source.point.x).toBe(60);
  });

  it("keeps a fixed plug at its point, a plug with a side on its side, and a plug with a range in its range", () => {
    const ports: Port[] = [
      { id: "p0", side: "east", at: { x: 60, y: 50 } },
      { id: "p1", side: "east", range: [0.6, 0.9] },
      { id: "p2", side: "south" },
    ];
    const g = fan(
      [
        { x: 400, y: -200 },
        { x: 400, y: -150 },
        { x: 400, y: -300 },
      ],
      ports,
    );
    const pairs = auctionEnds({ graph: g });
    expect(pairs[0]!.source.point).toEqual({ x: 60, y: 50 });
    const p1 = pairs[1]!.source.point;
    expect(p1.x).toBe(60);
    expect(p1.y).toBeGreaterThanOrEqual(60 - 1e-9);
    expect(p1.y).toBeLessThanOrEqual(90 + 1e-9);
    expect(pairs[2]!.source.point.y).toBe(100);
  });

  it("gives the same plugs each time, and routes with no break of a hard rule", () => {
    const router = stepRouterStrategy(plugStrategies.auction);
    for (const graph of [hub, clustered]) {
      expect(auctionEnds({ graph })).toEqual(auctionEnds({ graph }));
      expect(plugStrategies.auction.run({ graph }, { ...AUCTION_DEFAULTS })).toEqual(auctionEnds({ graph }));
      expect(checkProperties(graph, router.run(graph, {}), 1_000_000)).toEqual([]);
    }
  }, 30_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(plugStrategies.auction, AUCTION_DEFAULTS)).toEqual([]);
  });
});
