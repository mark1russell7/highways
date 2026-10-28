import { describe, expect, it } from "vitest";
import { commonTests, flows } from "../fixtures.test-util.ts";
import { compatibility, HDBSCAN_DEFAULTS, hdbscanClusters, hdbscanLabels, hdbscanPlan } from "./index.ts";

describe("the highway strategy hdbscan (HWY-028)", () => {
  it("gives the compatibility of FDEB: 1 for one edge, 0 for two perpendicular edges", () => {
    const p = (x: number, y: number) => ({ x, y });
    expect(compatibility(p(0, 0), p(100, 0), p(0, 0), p(100, 0))).toBeCloseTo(1, 9);
    expect(compatibility(p(0, 0), p(100, 0), p(100, 0), p(0, 0))).toBeCloseTo(1, 9);
    expect(compatibility(p(0, 0), p(100, 0), p(50, -50), p(50, 50))).toBeCloseTo(0, 9);
  });

  it("finds two dense groups of points and no noise", () => {
    const xs = [0, 1, 2, 3, 100, 101, 102, 103];
    const n = xs.length;
    const d = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d[i * n + j] = Math.abs(xs[i]! - xs[j]!);
    const labels = [...hdbscanLabels(n, d, 3, 2)];
    expect(labels.every((l) => l >= 0)).toBe(true);
    expect(new Set(labels.slice(0, 4)).size).toBe(1);
    expect(new Set(labels.slice(4)).size).toBe(1);
    expect(labels[0]).not.toBe(labels[4]);
    expect([...hdbscanLabels(2, new Float64Array(4), 3, 2)]).toEqual([-1, -1]);
  });

  it("puts the edges between the same two areas into one cluster", () => {
    const groups = hdbscanClusters({ graph: flows }, { ...HDBSCAN_DEFAULTS, minClusterSize: 2, minSamples: 1 });
    expect(groups.get("b")!.key).toBe(groups.get("a")!.key);
    expect(groups.get("c")!.key).toBe(groups.get("a")!.key);
    expect(groups.get("c")!.flip).toBe(true);
    expect(groups.get("x")?.key).not.toBe(groups.get("a")!.key);
  });

  commonTests("hdbscan", HDBSCAN_DEFAULTS, hdbscanPlan, [flows]);
});
