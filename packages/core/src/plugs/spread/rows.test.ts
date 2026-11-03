import { describe, expect, it } from "vitest";
import { rowFit } from "../../bench/measures/rows.ts";
import { resolvePorts, type Edge, type Graph, type Node, type Port, type Route } from "../../model.ts";
import type { PlugPair } from "../../strategies/model.ts";
import { spreadEnds, spreadWith } from "./index.ts";

/** This function gives one straight route from the two plugs of each pair. */
const routesOf = (pairs: readonly PlugPair[]): Route[] => pairs.map((p) => ({ edge: p.edge, points: [p.source.point, p.target.point] }));

/** This function gives the board without the row heights of its ports: the input of the plugs of today. */
function withoutRows(graph: Graph): Graph {
  const strip = ({ rowHeight: _, ...p }: Port): Port => p;
  return { ...graph, nodes: graph.nodes.map((n) => (n.ports ? { ...n, ports: n.ports.map(strip) } : n)) };
}

/** Four cards of 160 by 240. Each card has two free ports on its east wall, with rows of `row`, and each port links to a box in the east. */
function tallRows(row: number): Graph {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  for (let c = 0; c < 4; c++) {
    const y = c * 400;
    nodes.push({
      id: `card${c}`,
      box: { x: 0, y, w: 160, h: 240 },
      ports: ["a", "b"].map((id) => ({ id, side: "east", rowHeight: row })),
    });
    for (const id of ["a", "b"]) {
      nodes.push({ id: `far${c}${id}`, box: { x: 800, y: y + 110, w: 20, h: 20 } });
      edges.push({ id: `e${c}${id}`, source: { node: `card${c}`, port: id }, target: { node: `far${c}${id}` } });
    }
  }
  return { nodes, edges };
}

/** One card of 160 by 240 with a fixed row, and one free plug that faces a box at the height `y`. */
function rowAndPlug(along: number, y: number): Graph {
  const card: Node = { id: "card", box: { x: 0, y: 0, w: 160, h: 240 }, ports: [{ id: "row", side: "east", along, rowHeight: 55 }] };
  return {
    nodes: [card, { id: "far", box: { x: 800, y: y - 10, w: 20, h: 20 } }, { id: "west", box: { x: -800, y: 90, w: 20, h: 20 } }],
    edges: [
      { id: "free", source: { node: "card" }, target: { node: "far" } },
      { id: "other", source: { node: "card" }, target: { node: "west" } },
    ],
  };
}

describe("the row height of a port in the plug strategy spread (PLUG-ROW-GAP)", () => {
  it("raises R17 on a board of tall rows: from 0 of 8 rows to 8 of 8, and the gap from 8/55 to 1", () => {
    const graph = tallRows(55);
    const before = rowFit(graph, routesOf(spreadEnds({ graph: withoutRows(graph) })));
    const after = rowFit(graph, routesOf(spreadEnds({ graph })));
    expect(before).toEqual({ fit: 0, gap: 8 / 55 });
    expect(after?.fit).toBe(1);
    expect(after?.gap).toBeCloseTo(1, 9);
  });

  it("moves a plug out of a fixed row, and keeps the plug of the other wall", () => {
    const graph = rowAndPlug(200 / 240, 190);
    const before = spreadEnds({ graph: withoutRows(graph) });
    const after = spreadEnds({ graph });
    expect(before[0]!.source.point.y).toBe(190);
    expect(after[0]!.source.point.y).toBeCloseTo(200 - 55 / 2, 9);
    expect(after[1]).toEqual(before[1]);
    expect(rowFit(graph, routesOf(before))?.fit).toBe(0);
    expect(rowFit(graph, routesOf(after))?.fit).toBe(1);
  });

  it("moves a plug past a fixed row when the near part has no room", () => {
    const graph = rowAndPlug(30 / 240, 20);
    const after = spreadEnds({ graph });
    expect(after[0]!.source.point.y).toBeCloseTo(30 + 55 / 2, 9);
    expect(rowFit(graph, routesOf(after))?.fit).toBe(1);
  });

  it("shrinks the distances evenly on a wall with too little room, and drops no plug", () => {
    const ports: Port[] = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, side: "east", rowHeight: 55 }));
    const nodes: Node[] = [{ id: "card", box: { x: 0, y: 0, w: 60, h: 100 }, ports }];
    const edges: Edge[] = ports.map((p, i) => ({ id: `e${i}`, source: { node: "card", port: p.id }, target: { node: `far${i}` } }));
    for (let i = 0; i < 6; i++) nodes.push({ id: `far${i}`, box: { x: 800, y: i * 40, w: 20, h: 20 } });
    const graph: Graph = { nodes, edges };
    const pairs = spreadEnds({ graph });
    const y = pairs.map((p) => p.source.point.y);
    expect(y).toHaveLength(6);
    for (let i = 1; i < 6; i++) expect(y[i]! - y[i - 1]!).toBeCloseTo(88 / 5, 9);
    expect(rowFit(graph, routesOf(pairs))?.fit).toBe(0);
  });

  it("keeps a plug in its range, and the gap shrinks to the range", () => {
    const ports: Port[] = [
      { id: "a", side: "east", rowHeight: 55, range: [0.25, 0.5] },
      { id: "b", side: "east", rowHeight: 55, range: [0.25, 0.5] },
    ];
    const graph: Graph = {
      nodes: [{ id: "card", box: { x: 0, y: 0, w: 160, h: 240 }, ports }, { id: "f0", box: { x: 800, y: 100, w: 20, h: 20 } }, { id: "f1", box: { x: 800, y: 110, w: 20, h: 20 } }],
      edges: [
        { id: "e0", source: { node: "card", port: "a" }, target: { node: "f0" } },
        { id: "e1", source: { node: "card", port: "b" }, target: { node: "f1" } },
      ],
    };
    const y = spreadEnds({ graph }).map((p) => p.source.point.y);
    expect(y[0]).toBeCloseTo(60, 9);
    expect(y[1]).toBeCloseTo(115, 9);
    const short: Graph = { ...graph, nodes: [{ ...graph.nodes[0]!, ports: ports.map((p) => ({ ...p, range: [0.25, 0.3] as const })) }, ...graph.nodes.slice(1)] };
    const z = spreadEnds({ graph: short }).map((p) => p.source.point.y);
    expect(z[0]).toBeCloseTo(60, 9);
    expect(z[1]).toBeCloseTo(72, 9);
  });

  it("holds in the even places of the strategy leaders", () => {
    const graph = tallRows(55);
    expect(rowFit(graph, routesOf(spreadWith({ graph }, {}, "opo")))?.fit).toBe(1);
  });

  it("gives the plugs of today for a board without a row, and for a row height of 0", () => {
    const graph = tallRows(0);
    expect(spreadEnds({ graph })).toEqual(spreadEnds({ graph: withoutRows(graph) }));
    expect(rowFit(graph, routesOf(spreadEnds({ graph })))).toBeUndefined();
  });

  it("refuses a bad row height", () => {
    const graph = tallRows(-1);
    expect(() => resolvePorts(graph)).toThrow(RangeError);
    expect(() => resolvePorts(tallRows(Number.NaN))).toThrow(RangeError);
  });
});
