import { describe, expect, it } from "vitest";
import { isotonic, justifyPlugs } from "./justify.ts";

describe("isotonic", () => {
  it("keeps a sequence that does not fall, and pools the pairs that fall", () => {
    expect(isotonic([1, 2, 3])).toEqual([1, 2, 3]);
    expect(isotonic([3, 1, 2])).toEqual([2, 2, 2]);
    expect(isotonic([1, 4, 2, 5])).toEqual([1, 3, 3, 5]);
  });
});

describe("justifyPlugs (WILD-002)", () => {
  it("keeps the plugs that are far enough apart", () => {
    expect(justifyPlugs([10, 30, 50], 0, 100, 8)).toEqual([10, 30, 50]);
  });

  it("spreads two plugs at one place around that place, at the gap", () => {
    expect(justifyPlugs([50, 50], 0, 100, 8)).toEqual([46, 54]);
  });

  it("keeps the order of the plugs and gives the result in the order of the input", () => {
    expect(justifyPlugs([52, 48, 50], 0, 100, 6)).toEqual([56, 44, 50]);
  });

  it("orders two plugs at one place by the tie", () => {
    const tie = [5, 1];
    expect(justifyPlugs([50, 50], 0, 100, 8, (i) => tie[i]!)).toEqual([54, 46]);
  });

  it("keeps the plugs on the side, and divides a short side evenly", () => {
    expect(justifyPlugs([0, 0, 0], 0, 100, 10)).toEqual([0, 10, 20]);
    expect(justifyPlugs([100, 100], 0, 100, 10)).toEqual([90, 100]);
    expect(justifyPlugs([5, 5, 5, 5, 5], 0, 20, 10)).toEqual([0, 5, 10, 15, 20]);
  });

  it("moves the plugs the least distance (the sum of the squares)", () => {
    const ideal = [20, 22, 23, 60];
    const x = justifyPlugs(ideal, 0, 100, 6);
    const cost = (p: readonly number[]): number => p.reduce((s, v, i) => s + (v - ideal[i]!) ** 2, 0);
    for (let i = 1; i < x.length; i++) expect(x[i]! - x[i - 1]!).toBeGreaterThanOrEqual(6 - 1e-9);
    // Each other answer with the gaps costs more: shift the first three plugs together.
    for (const d of [-1, -0.5, 0.5, 1]) expect(cost([x[0]! + d, x[1]! + d, x[2]! + d, x[3]!])).toBeGreaterThan(cost(x));
  });
});
