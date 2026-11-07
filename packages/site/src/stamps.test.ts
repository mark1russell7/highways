import { fileURLToPath } from "node:url";
import { parseDataStamps } from "@mark1russell7/site-pages";
import { describe, expect, it } from "vitest";
import { snapshotFiles } from "./results-files.ts";
import { ENGINE, lastRead, READ_WORKFLOW, RESULTS_PAGE, verdictStamps, type VerdictHeader } from "./stamps.ts";

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
