// The time verdict of the shared bench home `@mark1russell7/rigor-bench` on a report of schema paired-time/1 (GATE-LIMITS slice 2).
// The home has the four outcomes faster, slower, same and cannot decide. This module maps the rounds of a report to its `PairedTime` records.
// Only the scripts that have the installed packages import this module. The sections gate imports it with `import()` in its job.
import { timeVerdict, type PairedTime, type TimeVerdict, type VerdictOptions } from "@mark1russell7/rigor-bench";
import { aaId, firstOf, type PairedReport } from "./paired.ts";

/**
 * This function gives the records of the home for one arm against the base of a report on one input.
 *
 * - Each round is one case of the home, with the name `<input> #<round>`. Each round is a pair of fresh processes, so the rounds are the samples.
 * - The arm `a` is the base, and the arm `b` is the other arm. The field `first` tells which of the two ran first in the round.
 * - A round with a time that is not a finite number above 0 is not in the list. An unknown input or arm gives an empty list.
 */
export function pairedTimes(report: PairedReport, input: string, arm: string): PairedTime[] {
  const row = report.inputs.find((i) => i.id === input);
  const at = report.arms.indexOf(arm);
  const baseAt = report.arms.indexOf(report.base);
  if (row === undefined || at < 0 || baseAt < 0) return [];
  const base = row.ms[report.base] ?? [];
  const other = row.ms[arm] ?? [];
  const ok = (ms: number | undefined): ms is number => typeof ms === "number" && Number.isFinite(ms) && ms > 0;
  const out: PairedTime[] = [];
  for (let k = 0; k < Math.min(base.length, other.length); k++) {
    const a = base[k];
    const b = other[k];
    if (!ok(a) || !ok(b)) continue;
    out.push({ case: `${input} #${k}`, round: k, first: firstOf(report, k, baseAt, at), a, b });
  }
  return out;
}

/**
 * This function gives the verdict of the home for one arm against the base of a report on one input.
 * The A/A arm of the base gives the noise. The default rule is `difference`, with the margin of the home.
 */
export function homeVerdict(report: PairedReport, input: string, arm: string, options: VerdictOptions = { rule: "difference" }): TimeVerdict {
  return timeVerdict(pairedTimes(report, input, arm), pairedTimes(report, input, aaId(report.base)), options);
}
