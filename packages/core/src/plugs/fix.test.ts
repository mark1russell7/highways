import { describe, expect, it } from "vitest";
import { dist } from "../geom.ts";
import { fixedPortPoint, nodeIndex, type Graph, type Result } from "../model.ts";
import { cornersRouter } from "../routers/corners.ts";
import { ROUTERS } from "../routers/index.ts";
import { listStrategies, STRATEGIES } from "../strategies/index.ts";
import { plugStrategies } from "../strategies/builtins.ts";
import { fixPorts } from "./fix.ts";
import { rowCardsBoard } from "./row-cards.ts";

/** This function counts the routes that start at the fixed plug of their source and end at the fixed plug of their target, within 0.5 px. */
function anchored(graph: Graph, result: Result): number {
  const byId = nodeIndex(graph);
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  let n = 0;
  for (const r of result.routes) {
    const e = edges.get(r.edge)!;
    const ps = fixedPortPoint(byId.get(e.source.node)!, e.source);
    const pt = fixedPortPoint(byId.get(e.target.node)!, e.target);
    if (ps && pt && dist(r.points[0]!, ps) <= 0.5 && dist(r.points[r.points.length - 1]!, pt) <= 0.5) n++;
  }
  return n;
}

describe("fixPorts (FIX-PORTS)", () => {
  const board = rowCardsBoard();

  it("anchors each of the 120 routes of sections at its fixed plug, after the rule spread", () => {
    expect(board.edges).toHaveLength(120);
    const fixed = fixPorts(board, "spread");
    const sections = ROUTERS.find((r) => r.name === "sections")!;
    const result = sections.route(fixed);
    expect(result.routes).toHaveLength(120);
    expect(anchored(fixed, result)).toBe(120);
  });

  it("gives each router routes that start and end at the fixed plugs", () => {
    const fixed = fixPorts(board, plugStrategies.spread);
    for (const router of ROUTERS) expect(anchored(fixed, router.route(fixed)), router.name).toBe(120);
  });

  it("gives the routes of corners with the rule, for each plug rule of the registry", () => {
    for (const rule of listStrategies(STRATEGIES, "plugs")) {
      const direct = cornersRouter({ name: "corners", plug: rule }).route(board);
      expect(cornersRouter({ name: "corners" }).route(fixPorts(board, rule)), rule.name).toEqual(direct);
    }
  });

  it("keeps each fixed port and each port of no edge, and does not change the input", () => {
    const graph: Graph = {
      nodes: [
        { id: "a", box: { x: 0, y: 0, w: 60, h: 100 }, ports: [{ id: "at", at: { x: 60, y: 10 } }, { id: "along", side: "east", along: 0.75 }, { id: "free" }, { id: "idle" }] },
        { id: "b", box: { x: 300, y: 0, w: 60, h: 100 } },
      ],
      edges: [
        { id: "e1", source: { node: "a", port: "at" }, target: { node: "b" } },
        { id: "e2", source: { node: "a", port: "along" }, target: { node: "b" } },
        { id: "e3", source: { node: "a", port: "free" }, target: { node: "b" } },
      ],
    };
    const before = structuredClone(graph);
    const fixed = fixPorts(graph, "spread");
    expect(graph).toEqual(before);
    const ports = fixed.nodes[0]!.ports!;
    expect(ports[0]).toBe(graph.nodes[0]!.ports![0]);
    expect(ports[1]).toBe(graph.nodes[0]!.ports![1]);
    expect(ports[2]).toEqual({ id: "free", side: "east", at: { x: 60, y: expect.any(Number) } });
    expect(ports[3]).toBe(graph.nodes[0]!.ports![3]);
    expect(fixed.nodes[1]).toBe(graph.nodes[1]);
    expect(fixed.edges).toEqual(graph.edges);
  });

  it("gives an end without a port a new fixed port with the option newPorts", () => {
    const graph: Graph = {
      nodes: [
        { id: "a", box: { x: 0, y: 0, w: 60, h: 100 }, ports: [{ id: "e:source" }] },
        { id: "b", box: { x: 300, y: 0, w: 60, h: 100 } },
      ],
      edges: [{ id: "e", source: { node: "a" }, target: { node: "b" } }],
    };
    const fixed = fixPorts(graph, "facing", { newPorts: true });
    expect(fixed.edges[0]).toEqual({ id: "e", source: { node: "a", port: "e:source#2" }, target: { node: "b", port: "e:target" } });
    expect(fixed.nodes[0]!.ports).toEqual([{ id: "e:source" }, { id: "e:source#2", side: "east", at: { x: 60, y: 50 } }]);
    expect(fixed.nodes[1]!.ports).toEqual([{ id: "e:target", side: "west", at: { x: 0, y: 50 } }]);
    expect(fixPorts(graph, "facing").edges).toEqual(graph.edges);
  });

  it("throws for a rule that the registry does not have", () => {
    expect(() => fixPorts(board, "none")).toThrow(/no plugs "none"/);
  });
});

describe("the plug rules of the registry (PLUG-REGISTER)", () => {
  it("lists facing, side, justify and spread, and side and justify give the plugs of the options of corners", () => {
    expect(listStrategies(STRATEGIES, "plugs").map((s) => s.name)).toEqual(["facing", "side", "justify", "spread"]);
    const graph = rowCardsBoard({ cards: 4, rows: 6, columns: 2 });
    const route = (o: object): Result => cornersRouter({ name: "corners", ...o }).route(graph);
    expect(route({ plug: plugStrategies.side })).toEqual(route({ plugs: "side" }));
    expect(route({ plug: plugStrategies.justify })).toEqual(route({ plugGap: 8 }));
    expect(route({ plug: plugStrategies.justify, plugOptions: { plugGap: 4 } })).toEqual(route({ plugGap: 4 }));
  });
});
