// The record of SPACE-COVERAGE: the share of the cells (one measure on one dimension of the space) with a fitted model, a held-out error and Sobol indices.
// Run from `packages/core`: `node scripts/space-coverage.ts`. With `--point`, the script also adds a row of today to the trend file.
import { readFileSync, writeFileSync } from "node:fs";
import { MEASURES } from "../src/bench/screen/measures.ts";
import { spaceCoverage, spaceDimensions, type SpaceCoverage, type SpaceFit } from "../src/bench/space-coverage.ts";
import { HIGHWAYS_FAMILIES } from "../src/families/index.ts";
import { KEYED_STRATEGIES } from "../src/strategies/opt-in.ts";

/** The folder of the committed files. */
const FOLDER = new URL("../../../docs/research/space-coverage/", import.meta.url);
/** The committed record. */
export const RECORD_FILE = new URL("record.json", FOLDER);
/** The committed trend: one row for each weekly point. */
export const TREND_FILE = new URL("trend.json", FOLDER);

/** The form of the record. */
export const SCHEMA = "space-coverage/1";

/** The fits of the record. No fitted model exists at this time, so the true value is 0. A new fit adds a row here, with its run. */
export const FITS: readonly SpaceFit[] = [];

/** The record: the result of `spaceCoverage` from the registries, and the fits that it counted. */
export interface CoverageRecord extends SpaceCoverage {
  readonly schema: string;
  readonly fits: readonly SpaceFit[];
}

/** One point of the trend. A row with a lower value than the row before it has a `reason`. */
export interface TrendPoint {
  readonly date: string;
  readonly core: string;
  readonly cells: number;
  readonly fitted: number;
  readonly value: number;
  readonly reason?: string;
}

/** This function makes the record from the registries of this commit. */
export function coverageRecord(): CoverageRecord {
  const measures = MEASURES.map((m) => m.key);
  return { schema: SCHEMA, ...spaceCoverage(measures, spaceDimensions(KEYED_STRATEGIES, HIGHWAYS_FAMILIES), FITS), fits: FITS };
}

/** This function gives the text of a JSON file of this folder. */
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

if (process.argv[1]?.endsWith("space-coverage.ts")) {
  const record = coverageRecord();
  writeFileSync(RECORD_FILE, json(record));
  console.log(`${record.fitted} of ${record.cells} cells: ${record.measures} measures on ${record.strategies} strategies, ${record.options} options and ${record.inputs} input dimensions.`);
  if (process.argv.includes("--point")) {
    const core = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
    const trend = JSON.parse(readFileSync(TREND_FILE, "utf8")) as TrendPoint[];
    const point: TrendPoint = { date: new Date().toISOString().slice(0, 10), core, cells: record.cells, fitted: record.fitted, value: record.value };
    writeFileSync(TREND_FILE, json([...trend.filter((t) => t.date !== point.date), point]));
  }
}
