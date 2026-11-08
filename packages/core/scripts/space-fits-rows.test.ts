import type { ResponseData } from "@mark1russell7/rigor-statistics";
import { describe, expect, it } from "vitest";
import { fitCounts } from "../src/bench/space-coverage.ts";
import { fitsFile, foldSkills, recordDigest, recordFits, spaceIdsOf, stepOf } from "./space-fits-rows.ts";

// A made-up sweep record of the step router: two strategies, one option of `a`, and 6 inputs.
// The crossings follow the option and the strategy. The bends are only noise. The time has no key in the measures.
const noise = (i: number): number => (((i * 7919) % 13) - 6) / 6;
const points = Array.from({ length: 6 }, (_, g) =>
  [0, 2, 4, 6, 8, 10].flatMap((k, j) => {
    const i = g * 12 + j;
    return [
      { id: `a/${k}/${g}`, group: `in-${g}`, values: { step: "router", strategy: "a", "a.k": k }, measures: { crossings: 3 * k + 0.1 * noise(i), "crossings.ratio": 1 + k / 10, bends: noise(i), ms: 1 } },
      { id: `b/${k}/${g}`, group: `in-${g}`, values: { step: "router", strategy: "b", "a.k": null }, measures: { crossings: 40 + 0.1 * noise(i + 6), "crossings.ratio": 1, bends: noise(i + 6), ms: 1 } },
    ];
  }),
).flat();
const data: ResponseData = {
  schema: "response-records/1",
  name: "made-up",
  dimensions: [
    { id: "step", label: "Step", unit: "", kind: "categorical", levels: ["router"] },
    { id: "strategy", label: "Strategy", unit: "", kind: "categorical", levels: ["a", "b"] },
    { id: "a.k", label: "k (a)", unit: "", kind: "continuous", range: [0, 10], when: { dimension: "strategy", levels: ["a"] } },
  ],
  measures: ["crossings", "crossings.ratio", "bends", "ms"].map((id) => ({ id, label: id, unit: "", direction: "lower" as const })),
  points,
} as ResponseData;
const MEASURE_KEYS = new Map([
  ["route.crossings", "R1.crossings"],
  ["route.bends", "R3.bends"],
]);
const KNOWN = new Set(["strategy:router/a", "strategy:router/b", "option:router/a.k"]);

describe("the fits of the sweep records", () => {
  it("maps each level of the dimension strategy and each option to the space, and the step to nothing", () => {
    expect(stepOf(data)).toBe("router");
    expect(spaceIdsOf(data, "router", "strategy")).toEqual(["strategy:router/a", "strategy:router/b"]);
    expect(spaceIdsOf(data, "router", "a.k")).toEqual(["option:router/a.k"]);
    expect(spaceIdsOf(data, "router", "step")).toEqual([]);
  });

  it("refuses a record whose dimension step has more than one level", () => {
    const two = { dimensions: [{ id: "step", label: "", unit: "", kind: "categorical", levels: ["router", "curve"] }] } as unknown as ResponseData;
    expect(() => stepOf(two)).toThrow(/one level/);
  });

  const result = recordFits(data, "made-up.json", MEASURE_KEYS, KNOWN);
  const by = (source: string) => result.fits.find((f) => f.source === source)!;

  it("skips a measure with no key, and gives a ratio the key of its raw measure", () => {
    expect(result.skipped).toEqual([{ run: "made-up.json", measure: "ms", reason: "The measure has no key in MEASURES." }]);
    expect(by("crossings.ratio").measure).toBe("R1.crossings");
    expect(by("crossings").measure).toBe("R1.crossings");
  });

  it("gives a fit of a true effect a fold for each input, a skill above 0 on each, and an index for each dimension", () => {
    const fit = by("crossings");
    expect(fit.foldSkill).toHaveLength(6);
    expect(Math.min(...fit.foldSkill)).toBeGreaterThan(0.5);
    expect(Object.keys(fit.sobol).sort()).toEqual([...KNOWN].sort());
    expect(fit.sobol["strategy:router/a"]).toBe(fit.sobol["strategy:router/b"]);
    expect(fitCounts(fit)).toBe(true);
  });

  it("gives a fit of noise no Sobol index, so it does not count", () => {
    const fit = by("bends");
    expect(fit.sobol).toEqual({});
    expect(fitCounts(fit)).toBe(false);
  });

  it("names a dimension that the space does not have, and leaves it out of the fits", () => {
    const less = recordFits(data, "made-up.json", MEASURE_KEYS, new Set(["strategy:router/a", "strategy:router/b"]));
    expect(less.unmapped).toEqual([{ run: "made-up.json", dimension: "option:router/a.k" }]);
    expect(less.fits.every((f) => !f.dimensions.includes("option:router/a.k"))).toBe(true);
  });

  it("gives a fold where the mean has no error a skill of 0", () => {
    const folds = [{ errors: { m: { mae: 0, baselineMae: 0 } } }, { errors: { m: { mae: 1, baselineMae: 2 } } }, { errors: {} }];
    expect(foldSkills({ folds } as never, "m")).toEqual([0, 0.5]);
  });

  it("gives a file with the digest of each record, which changes with a point", () => {
    const file = fitsFile([{ run: "made-up.json", data }], MEASURE_KEYS, KNOWN);
    expect(file.records).toEqual([{ run: "made-up.json", digest: recordDigest(data) }]);
    const changed = { ...data, points: data.points.slice(1) };
    expect(recordDigest(changed)).not.toBe(recordDigest(data));
  });
});
