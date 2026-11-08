import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BenchMeta } from "./bench-label.ts";
import { kpiFacts } from "./kpi-files.ts";
import { fitResponse, RESPONSE_RECORDS_SCHEMA, type ResponseData } from "@mark1russell7/rigor-statistics";
import { RESULT_FILES } from "./results-files.ts";
import { cardsWithCurves, KPI_PAGES, LAG_NOT_COUNTED, latestAt, minorsBehind, resultsLag, resultsLagAt, resultsUnread, siteKpiInput, type KpiFacts, type SweepFile } from "./kpi.ts";

const FACTS: KpiFacts = { demoComplete: true, coverageCells: 10, verdictReads: [] };
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

  it("gives the measures in the file, from the stamps and not from the cores of the first runs", () => {
    const input = siteKpiInput({ date: "2026-11-05", core: "0.15.0" }, "0.15.0", () => false, { ...FACTS, verdictReads: ["0.15.0", "0.10.0"] });
    expect(input?.measures.find((m) => m.id === "results-unread")).toEqual({ id: "results-unread", value: 1, unit: "snapshots" });
    expect(input?.measures.find((m) => m.id === "results-lag")?.value).toBe(5);
  });

  it("gives the lag the date of the oldest read that gives it, and a stamp is a read", () => {
    const facts = { ...FACTS, verdictReads: ["0.14.0", "0.14.0", "0.15.0"], verdictReadDates: ["2026-11-02", "2026-11-01", "2026-11-07"] };
    const lag = siteKpiInput({ date: "2026-11-05", core: "0.15.0" }, "0.15.0", () => false, facts)?.measures.find((m) => m.id === "results-lag");
    expect(lag).toEqual({ id: "results-lag", value: 1, unit: "releases", notCounted: LAG_NOT_COUNTED, at: "2026-11-01T00:00:00Z" });
    expect(resultsLagAt(["0.15.0"], [undefined], "0.15.0")).toBeUndefined();
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

  it("takes the lag of the oldest read, so a current snapshot does not hide it", () => {
    const input = siteKpiInput({ date: "2026-11-04", core: "0.14.0" }, "0.14.0", () => false, { ...FACTS, verdictReads: ["0.10.0", "0.9.2"] });
    expect(value(input, "results-lag")).toBe(5);
  });

  it("leaves out the lag when a verdict does not name its core", () => {
    const input = siteKpiInput({ date: "2026-11-04", core: "0.14.0" }, "0.14.0", () => false, { ...FACTS, verdictReads: ["0.10.0", undefined] });
    expect(value(input, "results-lag")).toBeUndefined();
  });
});

describe("cardsWithCurves", () => {
  // A made-up sweep of the option gap for each strategy. Each point has its own seed group.
  const data = (strategies: Record<string, number>): ResponseData => ({
    schema: RESPONSE_RECORDS_SCHEMA,
    name: "made-up sweep",
    dimensions: [
      { id: "step", label: "Step", unit: "", kind: "categorical", levels: ["router"] },
      { id: "strategy", label: "Strategy", unit: "", kind: "categorical", levels: Object.keys(strategies) },
      { id: "gap", label: "Gap", unit: "px", kind: "continuous", range: [0, 16] },
    ],
    measures: [{ id: "crossings", label: "Crossings", unit: "", direction: "lower" }],
    points: Object.entries(strategies).flatMap(([strategy, n]) =>
      Array.from({ length: 4 }, (_, i) => ({
        id: `${strategy}-${i}`,
        group: `${strategy}-${i}`,
        values: { step: "router", strategy, gap: n === 1 ? 4 : 4 * (i % n) + 1 },
        measures: { crossings: 10 + i + strategy.length },
      })),
    ),
  });
  const file = (strategies: Record<string, number>, date?: string): SweepFile => ({ record: fitResponse(data(strategies)), ...(date ? { date } : {}) });

  it("counts each card with 2 values of an option or more", () => {
    expect(cardsWithCurves([file({ alpha: 2, beta: 4, gamma: 1 })])).toBe(2);
  });

  it("counts a card once, and skips a record that parseResponseRecord refuses", () => {
    expect(cardsWithCurves([file({ alpha: 3, delta: 1, gamma: 1 }), file({ alpha: 4, delta: 1, gamma: 1 }), { record: data({ beta: 2, delta: 1, gamma: 1 }) }, { record: null }])).toBe(1);
  });

  it("gives 0 with no record, and the measure in the file says what it does not count", () => {
    expect(cardsWithCurves([])).toBe(0);
    const input = siteKpiInput({ date: "2026-11-05" }, "0.15.0", () => false, FACTS);
    const m = input?.measures.find((x) => x.id === "cards-with-curves");
    expect(m).toMatchObject({ value: 0, unit: "cards" });
    expect(m?.notCounted).toContain("response-records/1");
    expect(m?.at).toBeUndefined();
  });

  it("takes the time of the measure from the latest commit of a record with a curve", () => {
    const sweeps = [file({ alpha: 2, delta: 1, gamma: 1 }, "2026-11-10"), file({ beta: 2, delta: 1, gamma: 1 }, "2026-11-12"), file({ delta: 1, gamma: 1, zeta: 1 }, "2026-11-13")];
    const input = siteKpiInput({ date: "2026-11-05" }, "0.15.0", () => false, { ...FACTS, sweeps });
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
    expect(facts.verdictReads.length).toBeGreaterThan(0);
    expect(facts.verdictReads).not.toContain(undefined);
    expect(facts.verdictReadDates).toHaveLength(facts.verdictReads.length);
    expect(facts.verdictReadDates).not.toContain(undefined);
    expect(Array.isArray(facts.sweeps)).toBe(true);
    expect(facts.commitDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("the results lag of the repository (STAMP-ON-RELEASE)", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));

  // This test is the gate of the target: a change of the version of the core fails it while a snapshot is 2 or more minors behind.
  // Then the snapshots need a read on the new core first: the workflow `Read on release`, and the stamps of its job `stamps`.
  it("has each snapshot at most 1 minor behind the version of the core", () => {
    const meta = JSON.parse(readFileSync(join(root, RESULT_FILES.bench, "bench-meta.json"), "utf8")) as BenchMeta;
    const core = (JSON.parse(readFileSync(join(root, RESULT_FILES.core), "utf8")) as { version: string }).version;
    const lag = siteKpiInput(meta, core, () => true, kpiFacts(root))?.measures.find((m) => m.id === "results-lag");
    expect(lag?.value, `results-lag on core ${core}, from the read at ${lag?.at}`).toBeLessThanOrEqual(1);
  });
});
