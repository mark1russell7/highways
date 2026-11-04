import { describe, expect, it } from "vitest";
import { KPI_PAGES, minorsBehind, siteKpiInput } from "./kpi.ts";

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

describe("siteKpiInput", () => {
  it("gives no input without a date, because the time of the data is not known", () => {
    expect(siteKpiInput({}, "0.14.0", () => false)).toBeUndefined();
  });

  it("takes the time of the data from the snapshot, not from the build", () => {
    expect(siteKpiInput({ date: "2026-10-28" }, "0.14.0", () => false)?.at).toBe("2026-10-28T00:00:00Z");
  });

  it("leaves out the lag when the snapshot does not name its release", () => {
    expect(value(siteKpiInput({ date: "2026-10-28" }, "0.14.0", () => false), "results-lag")).toBeUndefined();
    expect(value(siteKpiInput({ date: "2026-10-28", core: "0.8.1" }, "0.14.0", () => false), "results-lag")).toBe(6);
  });

  it("marks a page as live only when its file exists", () => {
    const input = siteKpiInput({ date: "2026-10-28" }, "0.14.0", (file) => file === KPI_PAGES["atlas-live"]);
    expect(value(input, "atlas-live")).toBe(1);
    expect(value(input, "playground-live")).toBe(0);
    expect(value(input, "explorer-live")).toBe(0);
  });
});
