import { readFileSync } from "node:fs";
import { checkMeasures, type MeasureRow } from "@mark1russell7/rigor-bench";
import { describe, expect, it } from "vitest";
import { type BisectRow, FIXED_METHOD, REGENERATE, SCHEMA, spacingRows, type SpacingRow } from "./split-spacing-rows.ts";

/** The record on disk. */
const record = JSON.parse(readFileSync(new URL("./data/split-spacing/record.json", import.meta.url), "utf8")) as {
  schema: string;
  rows: SpacingRow[];
  bisect: BisectRow[];
};
const STALE = `The record split-spacing/1 is stale. Write it again with: ${REGENERATE}`;
const cell = (leave: string): SpacingRow => record.rows.find((r) => r.router === "trunks-all" && r.board === "case-many-groups" && r.leave === leave)!;
const atCommit = (commit: string, leave: string): BisectRow => record.bisect.find((r) => r.commit === commit && r.leave === leave)!;

describe("the record split-spacing/1", () => {
  it("equals fresh rows", () => {
    expect(record.schema).toBe(SCHEMA);
    expect(spacingRows(), STALE).toEqual(record.rows);
  }, 120_000);

  it("reads the same samples with the two denominators", () => {
    for (const r of record.rows) {
      expect(r.pairGap.method).toBe("pair-gap");
      expect(r.fixed.method).toBe(FIXED_METHOD);
    }
    const worst = cell("split").worstSample!;
    expect(worst.gap).toBeLessThan(worst.spacing);
    expect(worst.errorOnSpacing).toBeLessThan(worst.errorOnGap);
    expect(cell("split").pairGap.overDouble).toBe(1);
    expect(cell("split").fixed.overDouble).toBe(0);
  });

  it("holds the bisect: 5 commits on the fixed spacing, then the change of method at LANE-ROOM", () => {
    const before = ["c5ed085", "41f402b", "ff3007b", "8f4429f", "90ceb19"];
    for (const commit of before) {
      expect(atCommit(commit, "split")).toMatchObject({ method: FIXED_METHOD, worst: 0.682129 });
      expect(atCommit(commit, "split").worstSample.denominator).toBe(4);
    }
    expect(atCommit("dd6e001", "split")).toMatchObject({ method: "pair-gap", worst: 1.027499 });
    expect(atCommit("dd6e001", "split").worstSample.denominator).toBeLessThan(4);
  });

  it("finds the same lanes on the two sides of the change", () => {
    const pair = (commit: string): string => [...atCommit(commit, "split").worstSample.lanes].sort().join("|");
    expect(pair("90ceb19")).toBe(pair("dd6e001"));
  });

  it("does not move the default `part` at any commit", () => {
    for (const r of record.bisect.filter((row) => row.leave === "part")) expect(r.worst, r.commit).toBe(0.475513);
  });

  it("gives the finding mixed-method of `checkMeasures` when a table holds rows of the two methods", () => {
    const rows = record.bisect.filter((r) => r.leave === "split").map((r): MeasureRow => ({ measure: "highway.spacing.worst", group: "trunks-all", key: r.commit, value: r.worst, method: r.method }));
    const options = { rules: [{ measure: "highway.spacing.worst", sense: "lower", controls: [], partners: [], noControl: { because: "The read has no control.", until: "2027-01-01" } }], controls: [], asOf: "2026-11-05" } as const;
    expect(checkMeasures(rows, options).findings.some((f) => f.kind === "mixed-method")).toBe(true);
    const one = rows.filter((r) => r.method === "pair-gap");
    expect(checkMeasures(one, options).findings.some((f) => f.kind === "mixed-method")).toBe(false);
  });
});
