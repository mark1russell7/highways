// The fits of SPACE-COVERAGE from the committed sweep records in `docs/research/sweeps`. Run from `packages/core`: `node scripts/space-fits.ts`.
// The script writes `docs/research/space-coverage/fits.json`. Then `node scripts/space-coverage.ts` writes the record again.
// It fits each record again, so it takes some minutes on one core.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ResponseData } from "@mark1russell7/rigor-statistics";
import { MEASURES } from "../src/bench/screen/measures.ts";
import { fitCounts, spaceDimensions } from "../src/bench/space-coverage.ts";
import { HIGHWAYS_FAMILIES } from "../src/families/index.ts";
import { KEYED_STRATEGIES } from "../src/strategies/opt-in.ts";
import { fitsFile } from "./space-fits-rows.ts";

/** The folder of the sweep records, relative to the root of the repository. */
export const SWEEPS = "docs/research/sweeps";
const root = new URL("../../../", import.meta.url);

/** The path of the committed file of the fits, relative to the root of the repository. The coverage record names it. */
export const FITS_PATH = "docs/research/space-coverage/fits.json";

/** The committed file of the fits. */
export const SPACE_FITS_FILE = new URL(FITS_PATH, root);

/** This function gives each committed sweep record, sorted by its path. */
export function sweepRecords(): { readonly run: string; readonly data: ResponseData }[] {
  return readdirSync(new URL(`${SWEEPS}/`, root))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ run: `${SWEEPS}/${name}`, data: JSON.parse(readFileSync(new URL(`${SWEEPS}/${name}`, root), "utf8")) as ResponseData }));
}

if (process.argv[1]?.endsWith("space-fits.ts")) {
  const known = new Set(spaceDimensions(KEYED_STRATEGIES, HIGHWAYS_FAMILIES).map((d) => d.id));
  const file = fitsFile(sweepRecords(), new Map(MEASURES.map((m) => [m.name, m.key])), known);
  writeFileSync(SPACE_FITS_FILE, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`${file.fits.filter(fitCounts).length} of ${file.fits.length} fits count. ${file.skipped.length} measures skipped, ${file.unmapped.length} dimensions not in the space.`);
}
