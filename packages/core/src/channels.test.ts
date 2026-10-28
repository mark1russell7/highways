import { describe, expect, it } from "vitest";
import { CHANNEL_REACH, channelWidth, rayToBox } from "./channels.ts";
import { Obstacles } from "./visibility.ts";

describe("channelWidth", () => {
  it("gives the distance along a ray to a box, or Infinity", () => {
    const b = { x: 10, y: -5, w: 10, h: 10 };
    expect(rayToBox({ x: 0, y: 0 }, { x: 1, y: 0 }, b)).toBe(10);
    expect(rayToBox({ x: 0, y: 0 }, { x: -1, y: 0 }, b)).toBe(Infinity);
    expect(rayToBox({ x: 15, y: 0 }, { x: 1, y: 0 }, b)).toBe(0);
  });

  it("gives the gap between two walls, and the reach on an open side", () => {
    const walls = new Obstacles(
      [
        { id: "a", box: { x: 0, y: -30, w: 100, h: 20 } },
        { id: "b", box: { x: 0, y: 12, w: 100, h: 20 } },
      ],
      50,
    );
    expect(channelWidth(walls, { x: 10, y: 0 }, { x: 90, y: 0 })).toBeCloseTo(22);
    const one = new Obstacles([{ id: "a", box: { x: 0, y: -30, w: 100, h: 20 } }], 50);
    expect(channelWidth(one, { x: 10, y: 0 }, { x: 90, y: 0 })).toBeCloseTo(10 + CHANNEL_REACH);
  });
});
