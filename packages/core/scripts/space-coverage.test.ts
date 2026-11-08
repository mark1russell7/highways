import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MEASURES } from "../src/bench/screen/measures.ts";
import { spaceCoverage, spaceDimensions } from "../src/bench/space-coverage.ts";
import { HIGHWAYS_FAMILIES } from "../src/families/index.ts";
import { listStrategies, register } from "../src/strategies/model.ts";
import { KEYED_STRATEGIES } from "../src/strategies/opt-in.ts";
import { recordDigest, type SpaceFitsFile } from "./space-fits-rows.ts";
import { SPACE_FITS_FILE, sweepRecords } from "./space-fits.ts";
import { coverageRecord, RECORD_FILE, TREND_FILE, type CoverageRecord, type TrendPoint } from "./space-coverage.ts";

const read = <T>(file: URL): T => JSON.parse(readFileSync(file, "utf8")) as T;
const record = read<CoverageRecord>(RECORD_FILE);
const trend = read<TrendPoint[]>(TREND_FILE);

describe("the record of the coverage of the space", () => {
  it("is the record that the registries of this commit give", () => {
    expect(record).toEqual(coverageRecord());
  });

  it("gets a new denominator from one new strategy, with no edit of the record code", () => {
    const made = { ...listStrategies(KEYED_STRATEGIES, "router")[0]!, name: "made-up" };
    const more = spaceCoverage(MEASURES.map((m) => m.key), spaceDimensions(register(KEYED_STRATEGIES, made), HIGHWAYS_FAMILIES), []);
    expect(more.strategies).toBe(record.strategies + 1);
    expect(more.cells).toBeGreaterThan(record.cells);
  });

  // A new or changed sweep record fails this test until `node scripts/space-fits.ts` writes the fits again.
  it("has fits of each committed sweep record, at the digest of that record", () => {
    const fits = read<SpaceFitsFile>(SPACE_FITS_FILE);
    expect(fits.records).toEqual(sweepRecords().map((r) => ({ run: r.run, digest: recordDigest(r.data) })));
  });

  it("ends the trend with the values of the record", () => {
    const last = trend.at(-1)!;
    expect({ cells: last.cells, fitted: last.fitted, value: last.value }).toEqual({ cells: record.cells, fitted: record.fitted, value: record.value });
  });

  it("gives a reason for each fall of the trend", () => {
    for (const [i, point] of trend.entries()) {
      const before = trend[i - 1];
      if (before !== undefined && point.value < before.value) expect(point.reason, point.date).toBeTruthy();
    }
  });
});
