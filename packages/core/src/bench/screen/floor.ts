// The floor of the hard rules of a screen (PASS-GRID). `docs/research/CATALOG.md` gives the reason of the rule.
import type { LayoutRecord } from "./forms.ts";
import type { ScreenStep } from "./screen.ts";

/** The hard counts of one record, by the rule. */
export type HardCounts = Readonly<Record<string, number>>;

/**
 * This function gives the floor of each input: the hard counts of the record with the fewest breaks on that input.
 * Only built-in strategies with a run count. Without such a record, an input has no floor.
 *
 * In the step `highway`, only the base routers count (PASS-GRID). A plan gets a route by chance on some boxes, so the least count of many plans is not a bar for each plan.
 * The base routers keep the bar the same when the catalog grows. An input without a record of a base router takes the other built-in strategies.
 */
export function hardFloors(records: readonly LayoutRecord[], at: { readonly step: ScreenStep; readonly candidates: ReadonlySet<string> }): Map<string, HardCounts> {
  const total = (r: LayoutRecord): number => Object.values(r.hard).reduce((n, v) => n + v, 0);
  const counted = records.filter((r) => r.skipped === undefined && !at.candidates.has(r.strategy));
  const isBase = (r: LayoutRecord): boolean => at.step === "highway" && r.step === "router";
  const withBase = new Set(counted.filter(isBase).map((r) => r.input));
  const floor = new Map<string, HardCounts>();
  const best = new Map<string, number>();
  for (const r of counted) {
    if (withBase.has(r.input) && !isBase(r)) continue;
    if (total(r) >= (best.get(r.input) ?? Number.POSITIVE_INFINITY)) continue;
    best.set(r.input, total(r));
    floor.set(r.input, r.hard);
  }
  return floor;
}
