// The test that the sets and the fit of the portfolio router are current: the script `portfolio-sets.ts` makes the same files from the short table of the runs and the times.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chooseSets, FIT_PATH, fitSource, readOptima, readShortRuns, readTimes, SETS_PATH, setsSource } from "../../scripts/portfolio-sets.ts";
import { PORTFOLIO_BANDS, PORTFOLIO_CAPS, PORTFOLIO_RULES } from "./bands.ts";
import { PORTFOLIO_FIT } from "./fit.ts";
import { PORTFOLIO_SETS } from "./sets.ts";

describe("the sets of the portfolio router", () => {
  it("are the sets and the fit that the script chooses from the short table of the runs and the times", () => {
    const short = readShortRuns();
    const times = readTimes();
    const choices = chooseSets(short, readOptima(), { times });
    expect(readFileSync(SETS_PATH, "utf8").replace(/\r\n/g, "\n")).toBe(setsSource(choices, short.sources));
    expect(readFileSync(FIT_PATH, "utf8").replace(/\r\n/g, "\n")).toBe(fitSource(choices, times.source));
  }, 60_000);

  // A band above 40 nodes can have an empty set: there, no member of the train seeds gives more B1 than the base under the guard.
  it("has a set for each rule, cap and band, with no base and no repeat, and a fit that is a prefix of the set", () => {
    for (const rule of PORTFOLIO_RULES)
      for (const cap of PORTFOLIO_CAPS)
        for (const band of PORTFOLIO_BANDS) {
          const set = PORTFOLIO_SETS[`${rule}|${cap}|${band.id}`];
          expect(set, `${rule} ${cap} ${band.id}`).toBeDefined();
          if (band.maxNodes <= 40) expect(set!.length).toBeGreaterThan(0);
          expect(set!.length).toBeLessThanOrEqual(8);
          expect(set).not.toContain("shared");
          expect(new Set(set).size).toBe(set!.length);
          // The node limits do not go up along the fit.
          const fit = PORTFOLIO_FIT[`${rule}|${cap}|${band.id}`];
          expect(fit, `${rule} ${cap} ${band.id}`).toBeDefined();
          expect(fit!.map(([s]) => s)).toEqual(set!.slice(0, fit!.length));
          for (let i = 1; i < fit!.length; i++) expect(fit![i]![1]).toBeLessThanOrEqual(fit![i - 1]![1]);
        }
  });
});
