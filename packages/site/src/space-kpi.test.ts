import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { BUILT_IN_STRATEGIES, HIGHWAYS_FAMILIES, SCREEN_SETS } from "@mark1russell7/highways";
import { spaceFacts } from "./kpi-files.ts";
import { siteKpiInput } from "./kpi.ts";
import { fullCorpusSets, operatorsByStep, screenedStrategies, SPACE_NOT_COUNTED, spaceMeasures, spaceSizeOf, type SpaceFacts } from "./space-kpi.ts";

const FACTS: SpaceFacts = { operators: { router: 3, highway: 21, plugs: 1 }, grammar: { points: 1000, levels: 3, date: "2026-11-07" }, screened: 40, measuredFull: 0, inputFamilies: 28, fittedShare: 2.5 };
const value = (id: string, facts = FACTS): number | undefined => spaceMeasures(facts).find((m) => m.id === id)?.value;

describe("operatorsByStep", () => {
  it("counts the strategies of each step", () => {
    expect(operatorsByStep([{ step: "router" }, { step: "highway" }, { step: "router" }])).toEqual({ router: 2, highway: 1 });
    expect(operatorsByStep([])).toEqual({});
  });
});

describe("screenedStrategies", () => {
  const snapshots = [
    { set: "screen-v1", step: "router", rows: [{ strategy: "a" }, { strategy: "b" }, { strategy: "a" }] },
    { set: "screen-v2", step: "router", rows: [{ strategy: "a" }] },
    { set: "screen-v2", step: "highway", rows: [{ strategy: "a" }, { strategy: "" }, {}] },
    { schema: "remeasure/1", jobs: [] },
    null,
  ];

  it("gives each strategy of each step once, in the form step/strategy", () => {
    expect(screenedStrategies(snapshots)).toEqual(["highway/a", "router/a", "router/b"]);
  });

  it("reads only the snapshots of the sets of the list", () => {
    expect(screenedStrategies(snapshots, ["screen-v2"])).toEqual(["highway/a", "router/a"]);
    expect(screenedStrategies(snapshots, [])).toEqual([]);
  });
});

describe("spaceSizeOf", () => {
  it("reads a record space-size/1, and refuses another value", () => {
    expect(spaceSizeOf({ schema: "space-size/1", base: "31717809875", levels: 3, date: "2026-11-08" })).toEqual({ points: 31_717_809_875, levels: 3, date: "2026-11-08" });
    expect(spaceSizeOf({ schema: "space-size/2", base: "1", levels: 3, date: "2026-11-08" })).toBeUndefined();
    expect(spaceSizeOf({ schema: "space-size/1", base: "-1", levels: 3, date: "2026-11-08" })).toBeUndefined();
    expect(spaceSizeOf(null)).toBeUndefined();
  });
});

describe("fullCorpusSets", () => {
  it("gives only the sets with a family of each name of the corpus", () => {
    const sets = [
      { id: "small", families: [{ name: "a" }] },
      { id: "full", families: [{ name: "b" }, { name: "a" }, { name: "c" }] },
    ];
    expect(fullCorpusSets(sets, [{ name: "a" }, { name: "b" }])).toEqual(["full"]);
    expect(fullCorpusSets(sets, [{ name: "d" }])).toEqual([]);
  });
});

describe("spaceMeasures", () => {
  it("gives the total and each step of the operators, and the steps over the bar", () => {
    expect(value("operators")).toBe(25);
    expect(value("operators-highway")).toBe(21);
    expect(value("operators-plugs")).toBe(1);
    expect(value("steps-with-20-operators")).toBe(1);
  });

  it("gives the facts of the grammar, the screens and the corpus", () => {
    expect(value("grammar-strategies")).toBe(1000);
    expect(value("strategies-screened")).toBe(40);
    expect(value("strategies-measured-full")).toBe(0);
    expect(value("input-families")).toBe(28);
    expect(value("fitted-share")).toBe(2.5);
  });

  it("gives the count of the grammar the date of its record, and no count without a record", () => {
    expect(spaceMeasures(FACTS, "2026-11-08").find((m) => m.id === "grammar-strategies")?.at).toBe("2026-11-07");
    const noRecord: SpaceFacts = { operators: FACTS.operators, screened: 1, measuredFull: 0, inputFamilies: 1, fittedShare: 0 };
    expect(spaceMeasures(noRecord).map((m) => m.id)).not.toContain("grammar-strategies");
  });

  it("reads 0 for each measure with no tool, and says what it does not count", () => {
    const measures = spaceMeasures(FACTS);
    for (const id of ["distinct-variants", "views-generated", "solved-share"]) {
      const m = measures.find((x) => x.id === id);
      expect(m?.value).toBe(0);
      expect(m?.notCounted).toBeTruthy();
    }
  });

  it("gives each measure the time of the data, or no time", () => {
    const others = (at?: string) => spaceMeasures(FACTS, at).filter((m) => m.id !== "grammar-strategies");
    expect(others("2026-11-08").every((m) => m.at === "2026-11-08")).toBe(true);
    expect(others().every((m) => m.at === undefined)).toBe(true);
  });

  it("gives each id once", () => {
    const ids = spaceMeasures(FACTS).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the layout space measures in kpi.json", () => {
  it("adds them after the other measures only with their facts", () => {
    const meta = { date: "2026-11-08", core: "0.16.0" };
    const base = { demoComplete: true, coverageCells: 1, verdictReads: [] };
    const without = siteKpiInput(meta, "0.16.0", () => false, base)!.measures.map((m) => m.id);
    const with_ = siteKpiInput(meta, "0.16.0", () => false, { ...base, space: FACTS })!.measures.map((m) => m.id);
    expect(without).not.toContain("operators");
    expect(with_.slice(0, without.length)).toEqual(without);
    expect(with_.slice(without.length)).toEqual(spaceMeasures(FACTS).map((m) => m.id));
  });
});

describe("the layout space facts of the repository (SPACE-KPI)", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const facts = spaceFacts(root);

  it("counts each built-in strategy of the registry once, by its step", () => {
    expect(Object.values(facts.operators).reduce((a, b) => a + b, 0)).toBe(BUILT_IN_STRATEGIES.length);
    for (const s of BUILT_IN_STRATEGIES) expect(facts.operators[s.step]).toBeGreaterThan(0);
  });

  it("counts the families of the corpus registry", () => {
    expect(facts.inputFamilies).toBe(HIGHWAYS_FAMILIES.length);
  });

  it("reads the strategies of the committed snapshots", () => {
    expect(facts.screened).toBeGreaterThan(0);
    expect(facts.measuredFull).toBeLessThanOrEqual(facts.screened);
  });

  it("measures on the full corpus only on a set with each family of the corpus", () => {
    for (const id of fullCorpusSets(Object.values(SCREEN_SETS), HIGHWAYS_FAMILIES)) {
      const names = new Set(SCREEN_SETS[id]!.families.map((f) => f.name));
      expect(HIGHWAYS_FAMILIES.every((f) => names.has(f.name))).toBe(true);
    }
  });

  // The core test `space-size.test.ts` fails when the record does not count the current space.
  it("reads the count of the grammar from its record", () => {
    expect(facts.grammar?.points).toBeGreaterThan(0);
    expect(facts.grammar?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reads the fitted share as a percent", () => {
    expect(facts.fittedShare).toBeGreaterThanOrEqual(0);
    expect(facts.fittedShare).toBeLessThanOrEqual(100);
  });

  it("says what each measure does not count", () => {
    for (const text of Object.values(SPACE_NOT_COUNTED)) expect(text.length).toBeGreaterThan(0);
  });
});
