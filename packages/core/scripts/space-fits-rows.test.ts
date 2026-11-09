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

  it("maps an input dimension to its own id in the space, and the dimension family to nothing (SPACE-INPUTS)", () => {
    expect(spaceIdsOf(data, "router", "input:fam.nodes")).toEqual(["input:fam.nodes"]);
    expect(spaceIdsOf(data, "router", "family")).toEqual([]);
  });

  it("fits a raw measure that follows the size of its input only when the record has the input dimension (SPACE-INPUTS)", () => {
    // 10 drawn inputs of one family. The raw crossings follow the nodes of the input, and the option adds a little.
    const nodes = [12, 150, 40, 300, 25, 90, 200, 60, 18, 120];
    const raw = nodes.flatMap((n, g) =>
      [0, 5, 10].map((k, j) => ({
        id: `a/${k}/${g}`,
        group: `in-${g}`,
        values: { step: "router", strategy: "a", family: "fam", "a.k": k, "input:fam.nodes": n },
        measures: { crossings: 0.5 * n + 0.2 * k + 0.1 * noise(g * 3 + j) },
      })),
    );
    const head = [
      { id: "step", label: "Step", unit: "", kind: "categorical", levels: ["router"] },
      { id: "strategy", label: "Strategy", unit: "", kind: "categorical", levels: ["a"] },
      { id: "family", label: "Family", unit: "", kind: "categorical", levels: ["fam"] },
      { id: "a.k", label: "k (a)", unit: "", kind: "continuous", range: [0, 10], when: { dimension: "strategy", levels: ["a"] } },
    ];
    const input = { id: "input:fam.nodes", label: "nodes (fam)", unit: "", kind: "continuous", range: [2, 400], log: true, when: { dimension: "family", levels: ["fam"] } };
    const measures = [{ id: "crossings", label: "crossings", unit: "", direction: "lower" as const }];
    const known = new Set(["strategy:router/a", "option:router/a.k", "input:fam.nodes"]);
    const withInput = { schema: "response-records/1", name: "made-up", dimensions: [...head, input], measures, points: raw } as ResponseData;
    const without = { ...withInput, dimensions: head, points: raw.map((p) => ({ ...p, values: Object.fromEntries(Object.entries(p.values).filter(([k]) => k !== "input:fam.nodes")) })) } as ResponseData;
    const fit = recordFits(withInput, "made-up", MEASURE_KEYS, known).fits[0]!;
    expect(fit.foldSkill).toHaveLength(10);
    expect(fitCounts(fit)).toBe(true);
    expect(fit.dimensions).toContain("input:fam.nodes");
    expect(fit.sobol["input:fam.nodes"]!).toBeGreaterThan(0.9);
    expect(fitCounts(recordFits(without, "made-up", MEASURE_KEYS, known).fits[0]!)).toBe(false);
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
