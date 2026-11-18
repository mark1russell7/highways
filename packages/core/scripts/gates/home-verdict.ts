// The verdicts of the shared bench home `@mark1russell7/rigor-bench` on a report of schema paired-time/1 (GATE-LIMITS slice 2).
// The time verdict has the four outcomes faster, slower, same and cannot decide. The limit verdict has within, beyond and cannot decide.
// This module maps the rounds of a report to the `PairedTime` records of the home.
// Only the scripts that have the installed packages import this module. The sections gate imports it with `import()` in its job.
import { limitVerdict, timeVerdict, type LimitVerdict, type PairedTime, type TimeVerdict, type VerdictOptions } from "@mark1russell7/rigor-bench";
import { aaId, armOrder, type PairedReport } from "./paired.ts";

/**
 * This function tells which of two arms ran first in a round of a report.
 * A report with `orders` gives the order of the run. A report with no orders is older than the field, so its order is that of `armOrder`.
 */
export function firstOf(report: PairedReport, round: number, a: string, b: string): "a" | "b" {
  const order = report.orders?.[round] ?? armOrder(report.arms.length, round, report.mode).map((at) => report.arms[at]!);
  const [atA, atB] = [order.indexOf(a), order.indexOf(b)];
  if (atA < 0 || atB < 0) throw new RangeError(`The order of round ${round} has no arm ${atA < 0 ? a : b}.`);
  return atA < atB ? "a" : "b";
}

const ok = (ms: number | undefined): ms is number => typeof ms === "number" && Number.isFinite(ms) && ms > 0;

/**
 * This function gives the records of two arms of a report on one input, one record for each round.
 * The arm `a` is the denominator. The name of each case comes from `caseOf`. A round with a time that is not a finite number above 0 is not in the list.
 */
function roundsOf(report: PairedReport, input: string, a: string, b: string, caseOf: (round: number) => string): PairedTime[] {
  const row = report.inputs.find((i) => i.id === input);
  if (row === undefined || !report.arms.includes(a) || !report.arms.includes(b)) return [];
  const timesA = row.ms[a] ?? [];
  const timesB = row.ms[b] ?? [];
  const out: PairedTime[] = [];
  for (let k = 0; k < Math.min(timesA.length, timesB.length); k++) {
    const [x, y] = [timesA[k], timesB[k]];
    if (ok(x) && ok(y)) out.push({ case: caseOf(k), round: k, first: firstOf(report, k, a, b), a: x, b: y });
  }
  return out;
}

/**
 * This function gives the records of the home for one arm against the base of a report on one input.
 *
 * - Each round is one case of the home, with the name `<input> #<round>`. Each round is a pair of fresh processes, so the rounds are the samples.
 * - The arm `a` is the base, and the arm `b` is the other arm. The field `first` tells which of the two ran first in the round.
 * - A round with a time that is not a finite number above 0 is not in the list. An unknown input or arm gives an empty list.
 */
export function pairedTimes(report: PairedReport, input: string, arm: string): PairedTime[] {
  return roundsOf(report, input, report.base, arm, (k) => `${input} #${k}`);
}

/**
 * This function gives the records of the home for one arm against another arm on one input.
 * The records have one case with the name of the input, and one record for each round.
 * The arm `a` is `base`, and the arm `b` is `arm`. The field `first` comes from the order of each round. An unknown input or arm gives an empty list.
 */
export function roundTimes(report: PairedReport, input: string, base: string, arm: string): PairedTime[] {
  return roundsOf(report, input, base, arm, () => input);
}

/**
 * This function gives the limit verdict of the home on the claim "the ratio `arm` / `base` on one input is at most `limit`".
 * The A/A rounds of the base of the report on the same input give the noise (`aaFrom: "rounds"`), so the verdict needs only one case.
 * A report with an order that is not balanced throws the `RangeError` of the home.
 */
export function limitHome(report: PairedReport, input: string, base: string, arm: string, limit: number): LimitVerdict {
  return limitVerdict(roundTimes(report, input, base, arm), roundTimes(report, input, report.base, aaId(report.base)), { limit, aaFrom: "rounds" });
}

/**
 * This function gives the verdict of the home for one arm against the base of a report on one input.
 * The A/A arm of the base gives the noise. The default rule is `difference`, with the margin of the home.
 */
export function homeVerdict(report: PairedReport, input: string, arm: string, options: VerdictOptions = { rule: "difference" }): TimeVerdict {
  return timeVerdict(pairedTimes(report, input, arm), pairedTimes(report, input, aaId(report.base)), options);
}
