// The facts of `kpi.json` from the committed files. Only a build reads this module, because it reads files.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { demoComplete, pageCoverage } from "./demo-data.ts";
import { SWEEP_DIR, type KpiFacts } from "./kpi.ts";
import { coverageView } from "./results-data.ts";
import { RESULT_FILES, snapshotFiles } from "./results-files.ts";

/**
 * This function reads the facts of the measures from the repository.
 *
 * @param root - The folder of the repository.
 */
export function kpiFacts(root: string): KpiFacts {
  const text = (file: string): string => readFileSync(join(root, file), "utf8");
  type Verdict = { readonly core?: string; readonly date?: string; readonly verified?: { readonly core?: string; readonly date?: string } };
  const verdicts = snapshotFiles(root).map((file) => JSON.parse(file.text) as Verdict);
  return {
    demoComplete: demoComplete(pageCoverage()),
    coverageCells: coverageView(text(RESULT_FILES.coverage), text(RESULT_FILES.coverageTrend)).cells,
    verdictCores: verdicts.map((s) => s.core),
    verdictReads: verdicts.map((s) => s.verified?.core ?? s.core),
    verdictReadDates: verdicts.map((s) => s.verified?.date ?? s.date),
    sweeps: sweepRecords(root),
    ...commitDateOf(root),
  };
}

/** This function reads each JSON file of the folder of the sweep records. A missing folder gives no record. */
export function sweepRecords(root: string): unknown[] {
  const dir = join(root, SWEEP_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown);
}

/** This function gives the date of the commit of the build, or no field outside a git checkout. */
function commitDateOf(root: string): { commitDate?: string } {
  try {
    const date = execFileSync("git", ["log", "-1", "--format=%cs"], { cwd: root, encoding: "utf8" }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { commitDate: date } : {};
  } catch {
    return {};
  }
}
