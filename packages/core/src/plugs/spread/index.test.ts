import { describe, expect, it } from "vitest";
import type { Edge, Graph, Node } from "../../model.ts";
import { rowCardsBoard } from "../row-cards.ts";
import { spreadEnds } from "./index.ts";

/** A card of 60 by 100 at the origin, and `n` far boxes to its east, at the heights `ys`. The edges go from the card to the boxes in the order of `order`. */
function fan(ys: readonly number[], order: readonly number[]): Graph {
  const nodes: Node[] = [{ id: "card", box: { x: 0, y: 0, w: 60, h: 100 } }, ...ys.map((y, i) => ({ id: `far${i}`, box: { x: 800, y, w: 20, h: 20 } }))];
  const edges: Edge[] = order.map((i) => ({ id: `e${i}`, source: { node: "card" }, target: { node: `far${i}` } }));
  return { nodes, edges };
}

describe("the plug strategy spread (PLUG-SPREAD)", () => {
  it("puts 14 ends on one wall of 100 px, in the order of the far ends, with equal gaps, and drops none", () => {
    const ys = Array.from({ length: 14 }, (_, i) => -300 + i * 50);
    const order = [5, 12, 0, 9, 3, 13, 7, 1, 10, 4, 8, 11, 2, 6];
    const pairs = spreadEnds({ graph: fan(ys, order) });
    expect(pairs).toHaveLength(14);
    const plugs = pairs.map((p) => p.source);
    for (const p of plugs) {
      expect(p.point.x).toBe(60);
      expect(p.normal).toEqual({ x: 1, y: 0 });
      expect(p.point.y).toBeGreaterThanOrEqual(6 - 1e-9);
      expect(p.point.y).toBeLessThanOrEqual(94 + 1e-9);
    }
    // The far box i is higher than the far box i + 1, so the plug of e<i> is higher than the plug of e<i + 1>.
    const byFar = order.map((far, j) => [far, plugs[j]!.point.y] as const).sort((a, b) => a[0] - b[0]);
    const y = byFar.map(([, v]) => v);
    for (let i = 1; i < y.length; i++) expect(y[i]! - y[i - 1]!).toBeCloseTo(88 / 13, 9);
  });

  it("keeps the ideal places of a few plugs with room, at the gap", () => {
    // Two far boxes at one height: the two plugs face them, 8 apart around the facing place.
    const pairs = spreadEnds({ graph: fan([40, 40], [0, 1]) });
    expect(pairs.map((p) => p.source.point.y)).toEqual([46, 54]);
    expect(spreadEnds({ graph: fan([40, 40], [0, 1]) }, { plugGap: 12 }).map((p) => p.source.point.y)).toEqual([44, 56]);
  });

  it("keeps a fixed port, and spreads the free plugs in the room that is left", () => {
    const g = fan([0, 20, 40, 60], [0, 1, 2, 3]);
    const card: Node = { ...g.nodes[0]!, ports: [{ id: "pin", side: "east", along: 0.5 }] };
    const graph: Graph = { nodes: [card, ...g.nodes.slice(1), { id: "pinned", box: { x: 800, y: 300, w: 20, h: 20 } }], edges: [...g.edges, { id: "pin", source: { node: "card", port: "pin" }, target: { node: "pinned" } }] };
    const pairs = spreadEnds({ graph });
    expect(pairs.find((p) => p.edge === "pin")!.source.point).toEqual({ x: 60, y: 50 });
    const free = pairs.filter((p) => p.edge !== "pin").map((p) => p.source.point.y);
    for (const v of free) expect(Math.abs(v - 50)).toBeGreaterThanOrEqual(8 - 1e-9);
    expect(free).toEqual([...free].sort((a, b) => a - b));
  });

  it("gives the ends of one port one plug, and keeps a free port with a side on that side", () => {
    const graph: Graph = {
      nodes: [
        { id: "a", box: { x: 0, y: 0, w: 60, h: 100 }, ports: [{ id: "p" }, { id: "s", side: "south" }] },
        { id: "b", box: { x: 300, y: 0, w: 60, h: 100 } },
        { id: "c", box: { x: 300, y: 200, w: 60, h: 100 } },
      ],
      edges: [
        { id: "ab", source: { node: "a", port: "p" }, target: { node: "b" } },
        { id: "ac", source: { node: "a", port: "p" }, target: { node: "c" } },
        { id: "as", source: { node: "a", port: "s" }, target: { node: "b" } },
      ],
    };
    const [ab, ac, as] = spreadEnds({ graph });
    expect(ab!.source).toEqual(ac!.source);
    expect(as!.source.normal).toEqual({ x: 0, y: 1 });
    expect(as!.source.point.y).toBe(100);
  });

  it("orders the plugs of two cards with rows the same way on the two walls, so the straight lines do not cross", () => {
    // The row r of the card a links to the row 9 - r of the card b. The facing plugs of the two walls tie.
    const rows = 10;
    const ports = Array.from({ length: rows }, (_, r) => ({ id: `r${r}` }));
    const graph: Graph = {
      nodes: [
        { id: "a", box: { x: 0, y: 0, w: 100, h: 120 }, ports },
        { id: "b", box: { x: 300, y: 0, w: 100, h: 120 }, ports },
      ],
      edges: ports.map((p, r) => ({ id: `e${r}`, source: { node: "a", port: p.id }, target: { node: "b", port: `r${rows - 1 - r}` } })),
    };
    const pairs = spreadEnds({ graph });
    const bySource = [...pairs].sort((x, y) => x.source.point.y - y.source.point.y).map((p) => p.edge);
    const byTarget = [...pairs].sort((x, y) => x.target.point.y - y.target.point.y).map((p) => p.edge);
    expect(bySource).toEqual(byTarget);
    expect(new Set(pairs.map((p) => p.source.point.y)).size).toBe(rows);
  });

  it("gives the same plugs two times, one entry for each edge in the order of the edges", () => {
    const graph = rowCardsBoard();
    const a = spreadEnds({ graph });
    expect(a.map((p) => p.edge)).toEqual(graph.edges.map((e) => e.id));
    expect(spreadEnds({ graph })).toEqual(a);
  });
});
