import { describe, expect, it } from "vitest";
import { MEASURES, RANGES } from "./measures.ts";
import { screen, type ScreenStep } from "./screen.ts";
import { screenInputs } from "./set.ts";

const byName = new Map(MEASURES.map((m) => [m.name, m]));
const tiny = screenInputs().filter((i) => i.id === "screen-v1/tiny-uniform/s0");
const STEPS: readonly ScreenStep[] = ["router", "highway", "plugs", "levels", "whole", "group", "curve"];
/** The names of the measures that the records of this file give, over all the steps. */
const seen = new Set<string>();

describe("the range of each measure", () => {
  it("gives each row a min below its max, with no NaN", () => {
    for (const m of MEASURES) {
      expect(Number.isNaN(m.min) || Number.isNaN(m.max), m.name).toBe(false);
      expect(m.min, m.name).toBeLessThan(m.max);
      expect(m.min, m.name).not.toBe(Infinity);
      expect(m.max, m.name).not.toBe(-Infinity);
    }
  });

  it("names only rows and units of MEASURES in the rules of RANGES, and uses each rule", () => {
    const keys = new Set(MEASURES.map((m) => m.key));
    const units = new Set(MEASURES.map((m) => m.unit));
    for (const r of RANGES) {
      for (const k of r.keys ?? []) expect(keys.has(k), k).toBe(true);
      for (const u of r.units ?? []) expect(units.has(u), u).toBe(true);
      expect((r.keys ?? []).length + (r.units ?? []).length, r.reason).toBeGreaterThan(0);
    }
  });

  it("gives no unit text that names a range", () => {
    for (const m of MEASURES) expect(m.unit, m.name).not.toMatch(/-?\d+(\.\d+)? (to|or) -?\d/);
  });

  it("gives the range of a share from 0 to 1", () => {
    for (const m of MEASURES.filter((x) => x.unit === "share")) expect([m.min, m.max], m.name).toEqual([0, 1]);
  });

  it.each(STEPS)("holds each value of the records of the step %s on a small board", (step) => {
    const report = screen(step, [], { inputs: tiny, shuffles: 2, edits: 2, commit: "abc1234" });
    expect(report.records.length).toBeGreaterThan(0);
    for (const r of report.records) {
      for (const [name, v] of Object.entries(r.measures)) {
        const m = byName.get(name);
        if (m === undefined || typeof v !== "number") continue;
        seen.add(name);
        expect(v >= m.min - 1e-9 && v <= m.max + 1e-9, `${step} ${r.strategy} ${name} = ${v}, range [${m.min}, ${m.max}]`).toBe(true);
      }
    }
  });

  it("reads most of the measures in the records of the steps", () => {
    expect(seen.size).toBeGreaterThan(MEASURES.length / 2);
  });
});
