// The facts of `kpi.json` from the committed files. Only a build reads this module, because it reads files.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { demoComplete, pageCoverage } from "./demo-data.ts";
import type { KpiFacts } from "./kpi.ts";
import { coverageView } from "./results-data.ts";
import { RESULT_FILES, snapshotFiles } from "./results-files.ts";

/**
 * This function reads the facts of the measures from the repository.
 *
 * @param root - The folder of the repository.
 */
export function kpiFacts(root: string): KpiFacts {
  const text = (file: string): string => readFileSync(join(root, file), "utf8");
  const verdicts = snapshotFiles(root).map((file) => JSON.parse(file.text) as { readonly core?: string; readonly verified?: { readonly core?: string } });
  return {
    demoComplete: demoComplete(pageCoverage()),
    coverageCells: coverageView(text(RESULT_FILES.coverage), text(RESULT_FILES.coverageTrend)).cells,
    verdictCores: verdicts.map((s) => s.core),
    verdictReads: verdicts.map((s) => s.verified?.core ?? s.core),
  };
}
