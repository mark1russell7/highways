import { describe, expect, it } from "vitest";
import { rng } from "./fixtures.ts";
import { center, pointBoxDistance } from "./geom.ts";
import type { Node } from "./model.ts";
import { placePlug, sideToward } from "./plugs.ts";

const node: Node = {
  id: "n",
  box: { x: 100, y: 100, w: 80, h: 40 },
  ports: [
    { id: "fixed", at: { x: 0, y: 10 } },
    { id: "south", side: "south" },
  ],
};

describe("placePlug", () => {
  it("puts a free plug on the side that faces the target", () => {
    expect(placePlug(node, { node: "n" }, { x: 400, y: 120 })).toEqual({ point: { x: 180, y: 120 }, normal: { x: 1, y: 0 } });
    expect(placePlug(node, { node: "n" }, { x: 140, y: -300 }).normal).toEqual({ x: 0, y: -1 });
  });

  it("keeps a fixed plug in its place, with the normal of its side", () => {
    expect(placePlug(node, { node: "n", port: "fixed" }, { x: 400, y: 400 })).toEqual({ point: { x: 100, y: 110 }, normal: { x: -1, y: 0 } });
  });

  it("keeps a plug with a side on that side", () => {
    const p = placePlug(node, { node: "n", port: "south" }, { x: 400, y: 0 });
    expect(p.point.y).toBe(140);
    expect(p.normal).toEqual({ x: 0, y: 1 });
  });

  it("puts a free plug on the border, at 45° or less from the target (property)", () => {
    const R = rng(3);
    const c = center(node.box);
    for (let k = 0; k < 2000; k++) {
      const t = { x: R() * 600 - 150, y: R() * 600 - 150 };
      if (pointBoxDistance(t, node.box) === 0) continue;
      const p = placePlug(node, { node: "n" }, t);
      expect(pointBoxDistance(p.point, node.box)).toBe(0);
      const dx = t.x - c.x;
      const dy = t.y - c.y;
      const cos = (dx * p.normal.x + dy * p.normal.y) / Math.hypot(dx, dy);
      expect(cos).toBeGreaterThanOrEqual(Math.SQRT1_2 - 1e-9);
      expect(sideToward(node.box, t)).toBeDefined();
    }
  });
});
