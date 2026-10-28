import { describe, expect, it } from "vitest";
import { WayFinder } from "../../ways.ts";
import { clustered, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { fft, KDEEB_DEFAULTS, kdeebLines, kdeebPlan, pointDensity } from "./index.ts";

describe("the highway strategy kdeeb (RULE-028 with HWY-006)", () => {
  it("gives the same density with the separable kernel and the kernel fft, and about the same sum with the direct kernel", () => {
    const points = [
      { x: 40, y: 40 },
      { x: 44, y: 60 },
      { x: 80, y: 52 },
    ];
    const g = { w: 32, h: 32, cell: 4, x0: 0, y0: 0 };
    const sep = pointDensity(points, g, 8, "separable");
    const fast = pointDensity(points, g, 8, "fft");
    for (let i = 0; i < sep.length; i++) expect(fast[i]!).toBeCloseTo(sep[i]!, 9);
    const sum = (a: Float64Array): number => a.reduce((s, v) => s + v, 0);
    expect(sum(pointDensity(points, g, 8, "direct"))).toBeCloseTo(sum(sep), 1);
  });

  it("gives the transform of a pulse as a row of ones", () => {
    const re = new Float64Array(8);
    const im = new Float64Array(8);
    re[0] = 1;
    fft(re, im);
    for (let i = 0; i < 8; i++) expect(re[i]!).toBeCloseTo(1, 12);
  });

  it("pulls the parallel edges together, and keeps the points out of the boxes with the mask", () => {
    const settings = { kernel: "direct", resample: 0 } as const;
    const lines = kdeebLines({ graph: parallel }, new WayFinder(parallel.nodes), KDEEB_DEFAULTS, settings);
    const mid = [...lines.values()].map((l) => l[Math.floor(l.length / 2)]!.y);
    expect(Math.max(...mid) - Math.min(...mid)).toBeLessThan(16);
    const finder = new WayFinder(clustered.nodes);
    for (const l of kdeebLines({ graph: clustered }, finder, KDEEB_DEFAULTS, settings).values())
      for (const p of l.slice(1, -1)) expect(finder.obstacles.inside(p, 0)).toBe(false);
  });

  commonTests("kdeeb", KDEEB_DEFAULTS, kdeebPlan, [flows, parallel]);
});
