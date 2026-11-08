import type { CorpusDimension } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { inputDimensionId } from "../src/bench/space-coverage.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import { DRAWN_SET, drawInputs, drawnDimensions, drawRange, FAMILY_DIMENSION, inputDimensions } from "./sweep-inputs.ts";

const registry = highwaysRegistry();
const dim = (fields: Partial<CorpusDimension>): CorpusDimension => ({ name: "d", kind: "real", min: 0, max: 10, default: 5, meaning: "", engines: [], ...fields }) as CorpusDimension;

describe("the range of a drawn dimension (SPACE-INPUTS)", () => {
  it("takes the range of an int or a real dimension, inside its supported range", () => {
    expect(drawRange(dim({}))).toEqual([0, 10]);
    expect(drawRange(dim({ kind: "int", supported: { min: 2, max: 20 } }))).toEqual([2, 10]);
  });

  it("gives no range for an enum, a dimension with a when, and a range of one value", () => {
    expect(drawRange(dim({ kind: "enum", values: ["a", "b"], default: "a" }))).toBeUndefined();
    expect(drawRange(dim({ when: { param: "x", in: [1] } }))).toBeUndefined();
    expect(drawRange(dim({ supported: { min: 10 } }))).toBeUndefined();
  });

  it("draws the 4 number dimensions of a fixture family", () => {
    expect(drawnDimensions(registry.family("tiny-uniform").dimensions).map((d) => d.dimension.name)).toEqual(["nodes", "edgesPerNode", "locality", "fixedPorts"]);
  });
});

describe("the drawn inputs (SPACE-INPUTS)", () => {
  const drawn = drawInputs(registry, ["tiny-uniform"], 4, 1);

  it("gives each member its own id, seed and values, in the range of each dimension", () => {
    expect(drawn.map((d) => d.input.id)).toEqual([0, 1, 2, 3].map((k) => `${DRAWN_SET}/tiny-uniform/d${k}`));
    expect(new Set(drawn.map((d) => d.input.seed)).size).toBe(4);
    const nodes = drawn.map((d) => d.values[inputDimensionId("tiny-uniform", "nodes")]!);
    expect(new Set(nodes).size).toBeGreaterThan(1);
    for (const n of nodes) {
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(400);
    }
    for (const d of drawn) expect(d.values[inputDimensionId("tiny-uniform", "locality")]!).toBeLessThanOrEqual(1);
  });

  it("makes each board with its drawn values", () => {
    for (const d of drawn) expect(d.input.boxes).toHaveLength(d.values[inputDimensionId("tiny-uniform", "nodes")]!);
  });

  it("gives the same inputs for the same seed, and other inputs for another seed", () => {
    expect(drawInputs(registry, ["tiny-uniform"], 4, 1).map((d) => d.input.hash)).toEqual(drawn.map((d) => d.input.hash));
    expect(drawInputs(registry, ["tiny-uniform"], 4, 2).map((d) => d.values)).not.toEqual(drawn.map((d) => d.values));
  });

  it("refuses a count below 1 and an unknown family", () => {
    expect(() => drawInputs(registry, ["tiny-uniform"], 0, 1)).toThrow(/whole number/);
    expect(() => drawInputs(registry, ["no-such-family"], 1, 1)).toThrow();
  });

  it("gives the dimension family first, then each drawn dimension with a when on its family", () => {
    const dims = inputDimensions(registry, ["tiny-uniform", "packed-grid"]);
    expect(dims[0]).toMatchObject({ id: FAMILY_DIMENSION, kind: "categorical", levels: ["tiny-uniform", "packed-grid"] });
    const nodes = dims.find((d) => d.id === inputDimensionId("tiny-uniform", "nodes"));
    expect(nodes).toMatchObject({ kind: "continuous", range: [2, 400], log: true, when: { dimension: FAMILY_DIMENSION, levels: ["tiny-uniform"] } });
    expect(dims.filter((d) => d.id.startsWith("input:packed-grid.")).every((d) => d.kind === "continuous" && d.when?.levels[0] === "packed-grid")).toBe(true);
  });
});
