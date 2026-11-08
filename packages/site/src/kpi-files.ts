// The facts of `kpi.json` from the committed files. Only a build reads this module, because it reads files.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILT_IN_STRATEGIES, HIGHWAYS_FAMILIES, SCREEN_SETS, type AnyOption } from "@mark1russell7/highways";
import { demoComplete, pageCoverage } from "./demo-data.ts";
import { SWEEP_DIR, type KpiFacts, type SweepFile } from "./kpi.ts";
import { coverageView } from "./results-data.ts";
import { RESULT_FILES, snapshotFiles } from "./results-files.ts";
import { fullCorpusSets, operatorsByStep, screenedStrategies, SPACE_SIZE_FILE, spaceSizeOf, type SpaceFacts } from "./space-kpi.ts";

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
    verdictReads: verdicts.map((s) => s.verified?.core ?? s.core),
    verdictReadDates: verdicts.map((s) => s.verified?.date ?? s.date),
    sweeps: sweepRecords(root),
    cardStrategies: cardStrategies(),
    space: spaceFacts(root),
    ...commitDateOf(root),
  };
}

/** The folders of the verdict snapshots with rows of strategies: the snapshots of the page, the rows of each strategy and the opt-in verdicts. */
export const SCREENED_DIRS = ["", "all", "opt-in"] as const;

/**
 * This function gives the facts of the layout space measures (SPACE-KPI): the registry of the core and the committed verdict snapshots.
 *
 * @param root - The folder of the repository.
 */
export function spaceFacts(root: string): SpaceFacts {
  const snapshots = SCREENED_DIRS.flatMap((sub) => {
    const dir = join(root, RESULT_FILES.verdicts, sub);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown);
  });
  const full = fullCorpusSets(Object.values(SCREEN_SETS), HIGHWAYS_FAMILIES);
  const grammar = existsSync(join(root, SPACE_SIZE_FILE)) ? spaceSizeOf(JSON.parse(readFileSync(join(root, SPACE_SIZE_FILE), "utf8"))) : undefined;
  // The value of the record of the coverage is the fitted cells divided by the cells.
  const coverage = JSON.parse(readFileSync(join(root, RESULT_FILES.coverage), "utf8")) as { readonly value?: number };
  return {
    operators: operatorsByStep(BUILT_IN_STRATEGIES),
    ...(grammar === undefined ? {} : { grammar }),
    screened: screenedStrategies(snapshots).length,
    measuredFull: screenedStrategies(snapshots, full).length,
    inputFamilies: HIGHWAYS_FAMILIES.length,
    fittedShare: Math.round((coverage.value ?? 0) * 1000) / 10,
  };
}

/**
 * This function gives the card of each built-in strategy with a number option, in the form `step/name`.
 * A number option has the type `number` or `integer`, as in the sweep of `packages/core/scripts/sweep.ts`.
 */
export function cardStrategies(): string[] {
  return BUILT_IN_STRATEGIES.filter((s) => Object.values((s.schema ?? {}) as Record<string, AnyOption>).some((d) => d.type === "number" || d.type === "integer")).map((s) => `${s.step}/${s.name}`);
}

/** This function gives the card of each built-in strategy with no number option, in the form `step/name`. */
export function strategiesWithoutNumberOption(): string[] {
  const cards = new Set(cardStrategies());
  return BUILT_IN_STRATEGIES.map((s) => `${s.step}/${s.name}`).filter((c) => !cards.has(c));
}

/**
 * This function reads each JSON file of the folder of the sweep records, with the date of its last commit.
 * A missing folder gives no record.
 */
export function sweepRecords(root: string): SweepFile[] {
  const dir = join(root, SWEEP_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ record: JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown, ...commitDateOf(root, `${SWEEP_DIR}/${f}`) }))
    .map(({ commitDate, ...rest }) => (commitDate === undefined ? rest : { ...rest, date: commitDate }));
}

/** This function gives the date of the last commit of the build or of one file, or no field outside a git checkout. */
function commitDateOf(root: string, file?: string): { commitDate?: string } {
  try {
    const args = ["log", "-1", "--format=%cs", ...(file === undefined ? [] : ["--", file])];
    const date = execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { commitDate: date } : {};
  } catch {
    return {};
  }
}
