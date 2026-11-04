import { describe, expect, it } from "vitest";
import { HIGHWAYS_FAMILIES } from "../families/index.ts";
import { listStrategies, STEPS, type AnyStrategy } from "../strategies/model.ts";
import { KEYED_STRATEGIES } from "../strategies/opt-in.ts";
import { MEASURES } from "./screen/measures.ts";
import { fitCounts, spaceCoverage, spaceDimensions, type SpaceFit } from "./space-coverage.ts";

const strategies = STEPS.flatMap((step) => listStrategies(KEYED_STRATEGIES, step) as readonly AnyStrategy[]);
const dims = spaceDimensions(KEYED_STRATEGIES, HIGHWAYS_FAMILIES);
const keys = MEASURES.map((m) => m.key);
const [first, second] = [dims[0]!.id, dims[1]!.id];
const fit = (over: Partial<SpaceFit> = {}): SpaceFit => ({ measure: keys[0]!, dimensions: [first, second], heldOutError: 0.1, sobol: { [first]: 0.4, [second]: 0.2 }, run: "1", ...over });

describe("the space", () => {
  it("has one dimension for each strategy, each option and each input dimension, and each id once", () => {
    const options = strategies.reduce((n, s) => n + Object.keys(s.schema ?? {}).length, 0);
    const inputs = HIGHWAYS_FAMILIES.reduce((n, f) => n + f.dimensions.length, 0);
    expect(dims).toHaveLength(strategies.length + options + inputs);
    expect(new Set(dims.map((d) => d.id)).size).toBe(dims.length);
  });

  it("has the true value of 0 with no fit, and its denominator is the product", () => {
    const c = spaceCoverage(keys, dims, []);
    expect(c.value).toBe(0);
    expect(c.fitted).toBe(0);
    expect(c.cells).toBe(keys.length * dims.length);
    expect(c.strategies + c.options + c.inputs).toBe(dims.length);
  });

  it("counts a fit on each of its dimensions, and two fits of one cell once", () => {
    const c = spaceCoverage(keys, dims, [fit(), fit({ run: "2" })]);
    expect(c.fitted).toBe(2);
    expect(c.value).toBe(2 / c.cells);
  });

  it("does not count a fit with no held-out error or with a missing Sobol index", () => {
    expect(fitCounts(fit({ heldOutError: Number.NaN }))).toBe(false);
    expect(fitCounts(fit({ sobol: { [first]: 0.4 } }))).toBe(false);
    expect(fitCounts(fit({ dimensions: [] }))).toBe(false);
    expect(spaceCoverage(keys, dims, [fit({ heldOutError: Number.POSITIVE_INFINITY })]).fitted).toBe(0);
  });

  it("refuses a fit that names a measure or a dimension outside the space", () => {
    expect(() => spaceCoverage(keys, dims, [fit({ measure: "made-up" })])).toThrow(/made-up/);
    expect(() => spaceCoverage(keys, dims, [fit({ dimensions: ["strategy:router/made-up"] })])).toThrow(/made-up/);
  });
});
