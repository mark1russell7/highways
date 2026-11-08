import { fileURLToPath } from "node:url";
import { parseResponseRecord } from "@mark1russell7/rigor-statistics";
import { describe, expect, it } from "vitest";
import { CARD_DIMENSIONS, firstOption, isSweepRecord, sweepFacts } from "./explorer-data.ts";
import { explorerPage, sweepFiles } from "./explorer-files.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("the committed sweep records", () => {
  const files = sweepFiles(root);

  it("has one record or more", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("gives records that parseResponseRecord takes, with the categorical dimensions step and strategy", () => {
    for (const f of files) {
      const parsed = parseResponseRecord(f.record);
      expect(parsed.ok ? [] : parsed.faults, f.file).toEqual([]);
      if (!parsed.ok) continue;
      for (const id of CARD_DIMENSIONS) expect(parsed.record.dimensions.find((d) => d.id === id)?.kind, `${f.file} ${id}`).toBe("categorical");
      expect(isSweepRecord(f.record), f.file).toBe(true);
    }
  });

  it("puts each option of a strategy under a condition on the dimension strategy", () => {
    for (const f of files) {
      const parsed = parseResponseRecord(f.record);
      if (!parsed.ok) continue;
      const options = parsed.record.dimensions.filter((d) => !(CARD_DIMENSIONS as readonly string[]).includes(d.id));
      expect(options.length, f.file).toBeGreaterThan(0);
      for (const d of options) expect(d.when?.dimension, `${f.file} ${d.id}`).toBe("strategy");
    }
  });

  it("gives the page the newest record with its size", () => {
    const page = explorerPage(root);
    expect(page.facts.faults).toBe(0);
    expect(page.facts.strategies.length).toBeGreaterThan(0);
    expect(page.facts.options).toBeGreaterThan(0);
    expect(page.facts.points).toBeGreaterThan(page.facts.inputs);
    expect(page.others).toHaveLength(files.length - 1);
    expect(firstOption(page.record)).toBeDefined();
  });
});

describe("the facts of a sweep record", () => {
  it("gives the faults and no counts for a record that parseResponseRecord refuses", () => {
    const facts = sweepFacts("bad.json", { schema: "response-records/1" }, "2026-11-07");
    expect(facts.faults).toBeGreaterThan(0);
    expect({ points: facts.points, options: facts.options, date: facts.date }).toEqual({ points: 0, options: 0, date: "2026-11-07" });
    expect(isSweepRecord({ schema: "response-records/1" })).toBe(false);
    expect(firstOption("not a record")).toBeUndefined();
  });
});
