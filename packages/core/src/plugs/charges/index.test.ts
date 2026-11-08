import { describe, expect, it } from "vitest";
import type { Edge, Graph, Node, Port } from "../../model.ts";
import { plugStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { facingEnds } from "../facing/index.ts";
import { CHARGE_DEFAULTS, chargeEnds, chargePlugs } from "./index.ts";

/** A card of 60 by 100 at the origin, and far boxes to its east at the points `far`. The edges go from the card to the boxes in order. */
function fan(far: readonly { x: number; y: number }[], ports?: readonly Port[]): Graph {
  const card: Node = ports ? { id: "card", box: { x: 0, y: 0, w: 60, h: 100 }, ports } : { id: "card", box: { x: 0, y: 0, w: 60, h: 100 } };
  const nodes: Node[] = [card, ...far.map((p, i) => ({ id: `far${i}`, box: { x: p.x, y: p.y, w: 20, h: 20 } }))];
  const edges: Edge[] = far.map((_, i) => ({ id: `e${i}`, source: ports?.[i] ? { node: "card", port: ports[i]!.id } : { node: "card" }, target: { node: `far${i}` } }));
  return { nodes, edges };
}

const all = (k: number, v: number): number[] => Array.from({ length: k }, () => v);

describe("chargePlugs (RULE-054)", () => {
  it("rests two plugs with one ideal place at the spacing, around that place", () => {
    const [a, b] = chargePlugs([50, 50], all(2, 0), all(2, 100), { spacing: 8 });
    expect(a).toBeCloseTo(46, 9);
    expect(b).toBeCloseTo(54, 9);
  });

  it("moves far plugs only a little, and away from each other", () => {
    const x = chargePlugs([10, 50, 90], all(3, 0), all(3, 100));
    expect(x[0]).toBeLessThan(10);
    expect(x[2]).toBeGreaterThan(90);
    expect(x[1]).toBeCloseTo(50, 9);
    for (const [i, v] of [10, 50, 90].entries()) expect(Math.abs(x[i]! - v)).toBeLessThan(0.5);
  });

  it("keeps the order of the plugs and gives the result in the order of the input", () => {
    const x = chargePlugs([52, 48, 50], all(3, 0), all(3, 100));
    expect(x[1]!).toBeLessThan(x[2]!);
    expect(x[2]!).toBeLessThan(x[0]!);
  });

  it("orders two plugs with one ideal place by the tie", () => {
    const tie = [5, 1];
    const [a, b] = chargePlugs([50, 50], all(2, 0), all(2, 100), {}, (i) => tie[i]!);
    expect(a!).toBeGreaterThan(b!);
  });

  it("keeps each plug in its interval, so a plug at the end of a side pushes the next one out to the cube root of the charge", () => {
    const [a, b] = chargePlugs([0, 0], all(2, 0), all(2, 100), { spacing: 8, rounds: 200 });
    expect(a).toBe(0);
    // At rest the spring pulls back as hard as the charge pushes: d = q / d^2 with q = 8^3 / 2.
    expect(b).toBeCloseTo(Math.cbrt(256), 6);
  });

  it("keeps the ideal places with 0 rounds or a spacing of 0", () => {
    expect(chargePlugs([52, 48, 50], all(3, 0), all(3, 100), { rounds: 0 })).toEqual([52, 48, 50]);
    expect(chargePlugs([50, 50], all(2, 0), all(2, 100), { spacing: 0 })).toEqual([50, 50]);
    expect(chargePlugs([], [], [])).toEqual([]);
  });

  it("gives the same result for the same input", () => {
    const ideal = [3, 3, 4, 20, 21, 21, 60, 61];
    expect(chargePlugs(ideal, all(8, 0), all(8, 64))).toEqual(chargePlugs(ideal, all(8, 0), all(8, 64)));
  });
});

describe("the plug strategy charges (RULE-054)", () => {
  // Three far boxes east of the card at almost one height, so `facing` puts the three plugs within 4 of each other.
  const crowd = fan([
    { x: 400, y: 36 },
    { x: 400, y: 38 },
    { x: 400, y: 40 },
  ]);

  it("spreads the free plugs of a crowded side, in their order, and keeps the side and the far ends", () => {
    const facing = facingEnds({ graph: crowd });
    const pairs = chargeEnds({ graph: crowd });
    expect(pairs.map((p) => p.edge)).toEqual(["e0", "e1", "e2"]);
    const ys = pairs.map((p) => p.source.point.y);
    expect(ys[0]!).toBeLessThan(ys[1]!);
    expect(ys[1]!).toBeLessThan(ys[2]!);
    expect(ys[2]! - ys[0]!).toBeGreaterThan(facing[2]!.source.point.y - facing[0]!.source.point.y + 8);
    for (const [i, p] of pairs.entries()) {
      expect(p.source.point.x).toBe(facing[i]!.source.point.x);
      expect(p.source.normal).toEqual(facing[i]!.source.normal);
      expect(p.target).toEqual(facing[i]!.target);
      expect(p.source.point.y).toBeGreaterThanOrEqual(6);
      expect(p.source.point.y).toBeLessThanOrEqual(94);
    }
  });

  it("does not move a fixed plug, and keeps a plug of a port with a range in its range", () => {
    const ports: Port[] = [
      { id: "p0", side: "east", along: 0.5 },
      { id: "p1", side: "east", range: [0.4, 0.5] },
      { id: "p2", side: "east", range: [0.4, 0.5] },
    ];
    const graph = fan(
      [
        { x: 400, y: 36 },
        { x: 400, y: 38 },
        { x: 400, y: 40 },
      ],
      ports,
    );
    const facing = facingEnds({ graph });
    const pairs = chargeEnds({ graph });
    expect(pairs[0]!.source).toEqual(facing[0]!.source);
    for (const p of pairs.slice(1)) {
      expect(p.source.point.y).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(p.source.point.y).toBeLessThanOrEqual(50 + 1e-9);
    }
  });

  it("is the plug strategy charges of the registry, with defaults that its schema accepts", () => {
    expect(plugStrategies.charges.run({ graph: crowd }, { ...CHARGE_DEFAULTS })).toEqual(chargeEnds({ graph: crowd }));
    expect(checkOptions(plugStrategies.charges, CHARGE_DEFAULTS)).toEqual([]);
  });
});
