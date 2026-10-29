import { describe, expect, it } from "vitest";
import { fixedPortPoint, resolvePorts, type Graph, type Node, type Port } from "../model.ts";
import { fixPorts } from "./fix.ts";
import { placeInIntervals, rangeInterval } from "./range.ts";
import { tallCardsBoard } from "./row-cards.ts";

/** A card of height 260 with four ports on its east side, and four small far cards. The ranges of the ports give the reach `[16, 244]`. */
function reachBoard(range: [number, number] | undefined): Graph {
  const ports: Port[] = [0, 1, 2, 3].map((i) => ({ id: `o${i}`, side: "east", ...(range ? { range } : {}) }));
  const far = [-700, -80, 1000, 1100];
  const nodes: Node[] = [{ id: "a", box: { x: 0, y: 0, w: 100, h: 260 }, ports }, ...far.map((y, i): Node => ({ id: `b${i}`, box: { x: 395, y: y - 5, w: 10, h: 10 } }))];
  return { nodes, edges: far.map((_, i) => ({ id: `e${i}`, source: { node: "a", port: `o${i}` }, target: { node: `b${i}` } })) };
}

/** This function gives the places of the fixed ports of the card `a` on the axis along the east side. */
function placesOfA(graph: Graph): number[] {
  const a = graph.nodes.find((n) => n.id === "a")!;
  return graph.edges.map((e) => fixedPortPoint(a, e.source)!.y);
}

describe("placeInIntervals (PORT-RANGE)", () => {
  it("gives the fixture of the reach: rule plugs at [4, 100, 252, 258], reach [16, 244], gap 6", () => {
    const at = placeInIntervals([4, 100, 252, 258], [16, 16, 16, 16], [244, 244, 244, 244], 6);
    expect(at.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([16, 100, 238, 244]);
  });

  it("shrinks the gap evenly when the interval is too short, and drops no plug", () => {
    const at = placeInIntervals([0, 1, 2, 3, 4], [10, 10, 10, 10, 10], [30, 30, 30, 30, 30], 8);
    expect(at).toHaveLength(5);
    for (let i = 1; i < 5; i++) expect(at[i]! - at[i - 1]!).toBeCloseTo(5, 9);
    expect(at[0]).toBeCloseTo(10, 9);
    expect(at[4]).toBeCloseTo(30, 9);
  });

  it("keeps the order and the gap, and moves the plugs the least distance", () => {
    const at = placeInIntervals([50, 51, 52], [0, 0, 0], [100, 100, 100], 10);
    expect(at.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([41, 51, 61]);
  });
});

describe("Port.range (PORT-RANGE)", () => {
  it("refuses a range with its start after its end, or out of the side, with a RangeError", () => {
    const bad = (range: [number, number]): Graph => ({ nodes: [{ id: "a", box: { x: 0, y: 0, w: 10, h: 10 }, ports: [{ id: "p", side: "east", range }] }], edges: [] });
    expect(() => resolvePorts(bad([0.6, 0.4]))).toThrow(RangeError);
    expect(() => resolvePorts(bad([-0.1, 0.5]))).toThrow(RangeError);
    expect(() => resolvePorts(bad([0.5, 1.2]))).toThrow(RangeError);
    expect(() => resolvePorts(bad([Number.NaN, 0.5]))).toThrow(RangeError);
    expect(() => resolvePorts(bad([0.2, 0.8]))).not.toThrow();
  });

  it("gives the fixture of the reach through fixPorts with justify and gap 6: [16, 100, 238, 244]", () => {
    const fixed = fixPorts(reachBoard([16 / 260, 244 / 260]), "justify", { plugOptions: { plugGap: 6 } });
    expect(placesOfA(fixed).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([16, 100, 238, 244]);
  });

  it("keeps the plugs of facing, side, justify and spread in the reach", () => {
    for (const rule of ["facing", "side", "justify", "spread"]) {
      const at = placesOfA(fixPorts(reachBoard([16 / 260, 244 / 260]), rule));
      for (const v of at) {
        expect(v, rule).toBeGreaterThanOrEqual(16 - 1e-6);
        expect(v, rule).toBeLessThanOrEqual(244 + 1e-6);
      }
    }
  });

  it("gives the plugs of today to ports without a range", () => {
    const at = placesOfA(fixPorts(reachBoard(undefined), "justify", { plugOptions: { plugGap: 6 } }));
    expect(Math.min(...at)).toBeLessThan(16);
    expect(Math.max(...at)).toBeGreaterThan(244);
  });

  it("keeps the gaps of spread in each range, also at the ends of the range", () => {
    const board = tallCardsBoard();
    const fixed = fixPorts(board, "spread");
    for (const node of fixed.nodes) {
      for (const side of ["east", "west"] as const) {
        const ports = (node.ports ?? []).filter((p) => p.side === side);
        const [lo, hi] = rangeInterval(node.box, side, ports[0], 6)!;
        const at = ports.map((p) => node.box.y + p.at!.y).sort((a, b) => a - b);
        // The gap of the wall: 8, or less when the range is too short for its plugs.
        const gap = Math.min(8, (hi - lo) / (at.length - 1));
        expect(at[0]!).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(at[at.length - 1]!).toBeLessThanOrEqual(hi + 1e-6);
        for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!, `${node.id} ${side} ${i}`).toBeGreaterThanOrEqual(gap - 1e-6);
      }
    }
  });
});
