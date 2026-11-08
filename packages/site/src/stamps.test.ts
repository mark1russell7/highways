import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDataStamps } from "@mark1russell7/site-pages";
import { describe, expect, it } from "vitest";
import { snapshotFiles } from "./results-files.ts";
import { BENCH_AGE_DAYS, BENCH_WORKFLOW, benchRun, ENGINE, HOME_PAGE, lastRead, READ_WORKFLOW, RESULTS_PAGE, siteDataStamps, verdictStamps, type BenchHeader, type VerdictHeader } from "./stamps.ts";

const REPO = "example/repo";
const header = (run: number, core: string, verified?: VerdictHeader["verified"]): VerdictHeader => ({ run, commit: "a".repeat(40), date: "2026-10-28", core, ...(verified ? { verified } : {}) });

describe("the stamps of the Results page (VERDICT-STAMPS)", () => {
  it("takes the last read from the stamp verified, or else from the header", () => {
    expect(lastRead(header(1, "0.9.2"), REPO)).toEqual({ id: "1", url: "https://github.com/example/repo/actions/runs/1", date: "2026-10-28T00:00:00Z", engines: { [ENGINE]: "0.9.2" }, commit: "a".repeat(40) });
    const read = lastRead(header(1, "0.9.2", { run: 7, commit: "b".repeat(40), date: "2026-11-07", core: "0.15.0" }), REPO);
    expect(read).toMatchObject({ id: "7", date: "2026-11-07T00:00:00Z", engines: { [ENGINE]: "0.15.0" }, commit: "b".repeat(40) });
  });

  it("gives one run for each distinct read, so one read of 15 verdicts is one run", () => {
    const v = { run: 9, commit: "c".repeat(40), date: "2026-11-07", core: "0.15.0" };
    const stamps = verdictStamps([header(1, "0.9.2", v), header(2, "0.10.0", v), header(3, "0.10.0")], REPO);
    expect(stamps.pages).toHaveLength(1);
    expect(stamps.pages[0]!.page).toBe(RESULTS_PAGE);
    expect(stamps.pages[0]!.runs.map((r) => r.id)).toEqual(["3", "9"]);
    expect(stamps.pages[0]!.limit).toMatchObject({ days: 14, workflow: READ_WORKFLOW });
  });

  it("stops at a verdict with no run, because the gate cannot read its age", () => {
    expect(() => verdictStamps([{ date: "2026-11-07", core: "0.15.0" }], REPO)).toThrow(/verdict 0/);
  });

  it("gives stamps of the form data-stamp/1 for the committed verdicts", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const headers = snapshotFiles(root).map((f) => JSON.parse(f.text) as VerdictHeader);
    const parsed = parseDataStamps(verdictStamps(headers, "mark1russell7/highways"));
    expect(parsed.ok ? [] : parsed.faults).toEqual([]);
  });
});

describe("the stamp of the home page (HOME-STAMPS)", () => {
  const meta = { run: 42, sha: "d".repeat(40), date: "2026-11-08", time: "2026-11-08T03:56:56Z", core: "0.15.1", max: 100000 };

  it("takes the run, the time and the core of the benchmark snapshot", () => {
    expect(benchRun(meta, REPO)).toEqual({ id: "42", url: "https://github.com/example/repo/actions/runs/42", date: "2026-11-08T03:56:56Z", engines: { [ENGINE]: "0.15.1" }, commit: "d".repeat(40) });
    expect(benchRun({ run: 42, date: "2026-11-08", core: "0.15.1" }, REPO)?.date).toBe("2026-11-08T00:00:00Z");
    expect(benchRun({ date: "2026-11-08", core: "0.15.1" }, REPO)).toBeUndefined();
  });

  it("gives the Results page and the home page, each with its own limit", () => {
    const stamps = siteDataStamps([header(1, "0.9.2")], meta, REPO);
    expect(stamps.pages.map((p) => p.page)).toEqual([RESULTS_PAGE, HOME_PAGE]);
    expect(stamps.pages[1]!.runs.map((r) => r.id)).toEqual(["42"]);
    expect(stamps.pages[1]!.limit).toMatchObject({ days: BENCH_AGE_DAYS, workflow: BENCH_WORKFLOW });
  });

  it("stops at a snapshot with no run, because the gate cannot read its age", () => {
    expect(() => siteDataStamps([header(1, "0.9.2")], { date: "2026-11-08", core: "0.15.1" }, REPO)).toThrow(/bench-meta.json/);
  });

  it("gives stamps of the form data-stamp/1 for the committed snapshot", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const headers = snapshotFiles(root).map((f) => JSON.parse(f.text) as VerdictHeader);
    const bench = JSON.parse(readFileSync(join(root, "docs/research/bench/bench-meta.json"), "utf8")) as BenchHeader;
    const parsed = parseDataStamps(siteDataStamps(headers, bench, "mark1russell7/highways"));
    expect(parsed.ok ? [] : parsed.faults).toEqual([]);
  });
});
