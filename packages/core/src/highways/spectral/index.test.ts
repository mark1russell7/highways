import { describe, expect, it } from "vitest";
import { commonTests, flows } from "../fixtures.test-util.ts";
import { kMeans, SPECTRAL_DEFAULTS, spectralClusters, spectralLabels, spectralPlan, symmetricEigen } from "./index.ts";

describe("the highway strategy spectral (HWY-029)", () => {
  it("gives the eigenvalues and the unit eigenvectors of a symmetric matrix", () => {
    const a = Float64Array.of(2, 1, 0, 1, 2, 0, 0, 0, 5);
    const { values, vectors } = symmetricEigen(3, a);
    expect([...values].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 3, 5]);
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        let av = 0;
        for (let k = 0; k < 3; k++) av += a[i * 3 + k]! * vectors[k * 3 + j]!;
        expect(av).toBeCloseTo(values[j]! * vectors[i * 3 + j]!, 9);
      }
    }
  });

  it("puts the rows of two far groups into two clusters", () => {
    const rows = Float64Array.of(0, 0, 0.1, 0, 0, 0.1, 5, 5, 5.1, 5, 5, 5.1);
    const labels = [...kMeans(6, 2, rows)];
    expect(new Set(labels.slice(0, 3)).size).toBe(1);
    expect(new Set(labels.slice(3)).size).toBe(1);
    expect(labels[0]).not.toBe(labels[3]);
  });

  it("finds the two blocks of a weight matrix with a weak link, and no cluster for a point with no pair", () => {
    const n = 7;
    const w = new Float64Array(n * n);
    const link = (i: number, j: number, v: number) => {
      w[i * n + j] = v;
      w[j * n + i] = v;
    };
    for (const [i, j] of [[0, 1], [0, 2], [1, 2], [3, 4], [3, 5], [4, 5]] as const) link(i, j, 1);
    link(2, 3, 0.05);
    const labels = [...spectralLabels(n, w, SPECTRAL_DEFAULTS)];
    expect(new Set(labels.slice(0, 3)).size).toBe(1);
    expect(new Set(labels.slice(3, 6)).size).toBe(1);
    expect(labels[0]).not.toBe(labels[3]);
    expect(labels[6]).toBe(-1);
  });

  it("puts the edges between the same two areas into one cluster", () => {
    const groups = spectralClusters({ graph: flows }, SPECTRAL_DEFAULTS);
    expect(groups.get("b")!.key).toBe(groups.get("a")!.key);
    expect(groups.get("c")!.key).toBe(groups.get("a")!.key);
    expect(groups.get("c")!.flip).toBe(true);
    expect(groups.get("x")?.key).not.toBe(groups.get("a")!.key);
  });

  commonTests("spectral", SPECTRAL_DEFAULTS, spectralPlan, [flows]);
});
