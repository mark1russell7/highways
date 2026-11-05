/**
 * This script lists each verdict that reads `route.crossings` (ROUTE-PAIRS).
 * Each row tells if the strategy saves more ink than its base. There, the strategy shares more segments, so a gain in `route.crossings` can come from overlap.
 * The row does not tell if the verdict moves. A Screen with `route.crossings.pairs` tells that.
 * Usage: `node packages/core/scripts/route-pairs-claims.ts <out.json>`.
 */
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** One row of a verdict file. */
interface VerdictRow {
  readonly strategy: string;
  readonly measure: string;
  readonly label: string;
  readonly stratified: number | null;
}

/** The answer to one question: does the strategy save more ink than its base? */
export type InkSide = "more" | "not more" | "not read";

/** One verdict that reads `route.crossings`. */
export interface ClaimRow {
  readonly file: string;
  readonly set: string;
  readonly step: string;
  readonly base: string;
  readonly core: string;
  readonly strategy: string;
  readonly label: string;
  readonly ink: InkSide;
}

const VERDICTS = fileURLToPath(new URL("../../../docs/research/verdicts/", import.meta.url));

/** This function gives the verdict files, each with its path under the verdict folder. */
function verdictFiles(): string[] {
  const top = readdirSync(VERDICTS).filter((f) => f.endsWith(".json"));
  const optIn = readdirSync(`${VERDICTS}opt-in`).filter((f) => f.endsWith(".json")).map((f) => `opt-in/${f}`);
  return [...top, ...optIn].sort();
}

/** This function reads the verdicts of `route.crossings` in all verdict files. */
export function claimRows(): ClaimRow[] {
  return verdictFiles().flatMap((file) => {
    const verdict = JSON.parse(readFileSync(`${VERDICTS}${file}`, "utf8")) as { set: string; step: string; base: string; core: string; rows?: readonly VerdictRow[] };
    const rows = verdict.rows ?? [];
    const inkOf = (strategy: string): InkSide => {
      const row = rows.find((r) => r.strategy === strategy && r.measure === "route.bundle.ink-saved");
      if (!row || row.stratified === null) return "not read";
      return row.stratified > 0 ? "more" : "not more";
    };
    return rows
      .filter((r) => r.measure === "route.crossings")
      .map((r) => ({ file, set: verdict.set, step: verdict.step, base: verdict.base, core: verdict.core, strategy: r.strategy, label: r.label, ink: inkOf(r.strategy) }));
  });
}

/** This function counts rows by the label and by the answer on the ink. */
function countOf(rows: readonly ClaimRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[`${r.label} / ink ${r.ink}`] = (out[`${r.label} / ink ${r.ink}`] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort());
}

/** This function gives the record: the counts over all rows, the counts of each set, and the rows. */
export function claimsRecord(rows: readonly ClaimRow[]) {
  const sets = [...new Set(rows.map((r) => r.set))].sort();
  return {
    schema: "route-pairs-claims/1",
    regenerate: "node packages/core/scripts/route-pairs-claims.ts packages/core/scripts/data/route-pairs/claims.json",
    total: rows.length,
    counts: countOf(rows),
    bySet: Object.fromEntries(sets.map((s) => [s, countOf(rows.filter((r) => r.set === s))])),
    rows,
  };
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: node packages/core/scripts/route-pairs-claims.ts <out.json>");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(claimsRecord(claimRows()), null, 1)}\n`);
}
