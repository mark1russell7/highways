import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { kpiFacts } from "./kpi-files.ts";
import { cardsWithCurves, KPI_PAGES, latestAt, minorsBehind, resultsLag, resultsUnread, siteKpiInput, SWEEP_FORMAT, type KpiFacts } from "./kpi.ts";

const FACTS: KpiFacts = { demoComplete: true, coverageCells: 10, verdictCores: [], verdictReads: [] };
const value = (input: ReturnType<typeof siteKpiInput>, id: string): number | undefined => input?.measures.find((m) => m.id === id)?.value;

describe("minorsBehind", () => {
  it("counts the minor releases to the engine", () => {
    expect(minorsBehind("0.8.1", "0.14.0")).toBe(6);
  });

  it("gives 0 for a snapshot of the current minor, or of a newer one", () => {
    expect(minorsBehind("0.14.2", "0.14.0")).toBe(0);
    expect(minorsBehind("0.15.0", "0.14.0")).toBe(0);
  });

  it("gives no count over a major, or for a text that is not a version", () => {
    expect(minorsBehind("0.14.0", "1.0.0")).toBeUndefined();
    expect(minorsBehind("local", "0.14.0")).toBeUndefined();
  });
});

describe("resultsUnread", () => {
  it("counts each verdict whose last read is not on the minor of the engine", () => {
    expect(resultsUnread(["0.15.0", "0.15.2", "0.9.2", "0.10.0"], "0.15.1")).toBe(2);
    expect(resultsUnread([], "0.15.0")).toBe(0);
  });

  it("counts a verdict with no core, or a core of another major, because its read is not known", () => {
    expect(resultsUnread([undefined, "1.15.0"], "0.15.0")).toBe(2);
  });

  it("gives the measure in the file, from the stamps and not from the cores of the runs", () => {
    const input = siteKpiInput({ date: "2026-11-05", core: "0.15.0" }, "0.15.0", () => false, { ...FACTS, verdictCores: ["0.9.2", "0.10.0"], verdictReads: ["0.15.0", "0.10.0"] });
    expect(input?.measures.find((m) => m.id === "results-unread")).toEqual({ id: "results-unread", value: 1, unit: "snapshots" });
    expect(input?.measures.find((m) => m.id === "results-lag")?.value).toBe(6);
  });
});

describe("siteKpiInput", () => {
  it("gives no input without a date, because the time of the data is not known", () => {
    expect(siteKpiInput({}, "0.14.0", () => false, FACTS)).toBeUndefined();
  });

  it("takes the time of the data from the snapshot, not from the build", () => {
    expect(siteKpiInput({ date: "2026-10-28" }, "0.14.0", () => false, FACTS)?.at).toBe("2026-10-28T00:00:00Z");
  });

  it("leaves out the lag when the snapshot does not name its release", () => {
    expect(value(siteKpiInput({ date: "2026-10-28" }, "0.14.0", () => false, FACTS), "results-lag")).toBeUndefined();
    expect(value(siteKpiInput({ date: "2026-10-28", core: "0.8.1" }, "0.14.0", () => false, FACTS), "results-lag")).toBe(6);
  });

  it("marks a page as live only when its file exists", () => {
    const input = siteKpiInput({ date: "2026-10-28" }, "0.14.0", (file) => file === KPI_PAGES["atlas-live"], FACTS);
    expect(value(input, "atlas-live")).toBe(1);
    expect(value(input, "explorer-live")).toBe(0);
  });

  it("reads the playground from the demo, and no file makes it live", () => {
    const with_ = (demoComplete: boolean) => siteKpiInput({ date: "2026-10-28" }, "0.14.0", () => true, { ...FACTS, demoComplete });
    expect(value(with_(true), "playground-live")).toBe(1);
    expect(value(with_(false), "playground-live")).toBe(0);
  });

  it("reads the coverage as shown only when the record has cells", () => {
    const with_ = (coverageCells: number) => siteKpiInput({ date: "2026-10-28" }, "0.14.0", () => false, { ...FACTS, coverageCells });
    expect(value(with_(118537), "coverage-shown")).toBe(1);
    expect(value(with_(0), "coverage-shown")).toBe(0);
  });

  it("takes the lag of the oldest verdict, so a current snapshot does not hide it", () => {
    const input = siteKpiInput({ date: "2026-11-04", core: "0.14.0" }, "0.14.0", () => false, { ...FACTS, verdictCores: ["0.10.0", "0.9.2"] });
    expect(value(input, "results-lag")).toBe(5);
  });

  it("leaves out the lag when a verdict does not name its core", () => {
    const input = siteKpiInput({ date: "2026-11-04", core: "0.14.0" }, "0.14.0", () => false, { ...FACTS, verdictCores: ["0.10.0", undefined] });
    expect(value(input, "results-lag")).toBeUndefined();
  });
});

describe("cardsWithCurves", () => {
  const record = (strategy: string, points: number) => ({
    format: SWEEP_FORMAT,
    step: "router",
    strategy,
    date: "2026-11-11",
    curves: [{ option: "gap", points: Array.from({ length: points }, (_, i) => ({ value: i, measures: { "route.crossings": i } })) }],
  });

  it("counts each card with a curve of 2 points or more", () => {
    expect(cardsWithCurves([record("alpha", 2), record("beta", 5), record("gamma", 1)])).toBe(2);
  });

  it("counts a card once, and skips a record of another form", () => {
    expect(cardsWithCurves([record("alpha", 3), record("alpha", 4), { format: "other", step: "router", strategy: "beta", curves: [] }, null])).toBe(1);
  });

  it("gives 0 with no record, and the measure in the file says what it does not count", () => {
    expect(cardsWithCurves([])).toBe(0);
    const input = siteKpiInput({ date: "2026-11-05" }, "0.15.0", () => false, FACTS);
    const m = input?.measures.find((x) => x.id === "cards-with-curves");
    expect(m).toMatchObject({ value: 0, unit: "cards" });
    expect(m?.notCounted).toContain("docs/research/sweeps");
    expect(m?.at).toBeUndefined();
  });

  it("takes the time of the measure from the latest record", () => {
    const input = siteKpiInput({ date: "2026-11-05" }, "0.15.0", () => false, { ...FACTS, sweeps: [record("alpha", 2), { ...record("beta", 2), date: "2026-11-12" }] });
    expect(input?.measures.find((x) => x.id === "cards-with-curves")).toMatchObject({ value: 2, at: "2026-11-12T00:00:00Z" });
  });
});

describe("the time of each measure", () => {
  it("gives the latest date, or no time with no date", () => {
    expect(latestAt(["2026-11-05", undefined, "2026-11-07T10:00:00Z", "local"])).toBe("2026-11-07T00:00:00Z");
    expect(latestAt([])).toBeUndefined();
  });

  it("gives the reads the time of the last stamp, not of the benchmark", () => {
    const input = siteKpiInput({ date: "2026-11-05" }, "0.15.0", () => false, { ...FACTS, verdictReads: ["0.15.0"], verdictReadDates: ["2026-10-30", "2026-11-07"] });
    expect(input?.at).toBe("2026-11-05T00:00:00Z");
    expect(input?.measures.find((m) => m.id === "results-unread")?.at).toBe("2026-11-07T00:00:00Z");
  });

  it("gives a page the time of the commit of the build", () => {
    const input = siteKpiInput({ date: "2026-11-05" }, "0.15.0", () => true, { ...FACTS, commitDate: "2026-11-07" });
    expect(input?.measures.find((m) => m.id === "atlas-live")).toMatchObject({ value: 1, at: "2026-11-07T00:00:00Z" });
  });
});

describe("resultsLag", () => {
  it("gives the largest count over the records", () => {
    expect(resultsLag(["0.14.0", "0.10.0", "0.13.1"], "0.14.0")).toBe(4);
  });

  it("gives no count for a record with no release", () => {
    expect(resultsLag(["0.14.0", undefined], "0.14.0")).toBeUndefined();
  });
});

describe("kpiFacts", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));

  it("reads the committed files of the repository", () => {
    const facts = kpiFacts(root);
    expect(facts.demoComplete).toBe(true);
    expect(facts.coverageCells).toBeGreaterThan(0);
    expect(facts.verdictCores.length).toBeGreaterThan(0);
    expect(facts.verdictCores).not.toContain(undefined);
    expect(facts.verdictReads).toHaveLength(facts.verdictCores.length);
    expect(facts.verdictReads).not.toContain(undefined);
    expect(facts.verdictReadDates).toHaveLength(facts.verdictCores.length);
    expect(facts.verdictReadDates).not.toContain(undefined);
    expect(Array.isArray(facts.sweeps)).toBe(true);
    expect(facts.commitDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
