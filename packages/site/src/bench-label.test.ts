import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { benchLabel, STALE_DAYS } from "./bench-label.ts";

const meta = { run: 40602938853, sha: "fbc92db7fb5f035ace298afd88e4be37c345b1be", date: "2026-10-27" };

describe("benchLabel", () => {
  it("always shows the run, the commit and the date of the snapshot", () => {
    const label = benchLabel(meta, "2026-10-27");
    expect(label.html).toContain("actions/runs/40602938853");
    expect(label.html).toContain("<code>fbc92db</code>");
    expect(label.html).toContain("2026-10-27");
  });

  it("gives no warning when the snapshot is at most one day older than the build", () => {
    expect(STALE_DAYS).toBe(1);
    expect(benchLabel(meta, "2026-10-27")).toMatchObject({ warning: "", ageDays: 0 });
    expect(benchLabel(meta, "2026-10-28")).toMatchObject({ warning: "", ageDays: 1 });
  });

  it("warns when the snapshot is more than one day older than the build", () => {
    const label = benchLabel(meta, "2026-10-29");
    expect(label.ageDays).toBe(2);
    expect(label.warning).toContain("These times are from 2026-10-27. The bench on main is failing.");
    expect(label.html).toContain("actions/runs/40602938853");
  });

  it("clears the warning when a fresh snapshot lands", () => {
    expect(benchLabel(meta, "2026-11-05").warning).not.toBe("");
    expect(benchLabel({ ...meta, date: "2026-11-05" }, "2026-11-05").warning).toBe("");
  });

  it("gives no warning and no age when a date is absent or not valid", () => {
    expect(benchLabel({}, "2026-10-29")).toMatchObject({ warning: "", ageDays: undefined });
    expect(benchLabel(meta, "<!--build-date-->")).toMatchObject({ warning: "", ageDays: undefined });
    expect(benchLabel({}, "2026-10-29").html).toContain("no run id");
  });

  it("escapes the fields of the snapshot", () => {
    expect(benchLabel({ date: "<b>" }, "2026-10-29").html).toContain("&lt;b&gt;");
  });

  it("has the place of the build date and of the warning in the demo page", () => {
    const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(page).toContain('data-build-date="<!--build-date-->"');
    expect(page).toContain('id="bench-stale"');
    const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    expect(config).toContain('.replace("<!--build-date-->", info.date)');
  });
});
