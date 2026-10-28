// The test that the sets of the portfolio router are current: the script `portfolio-sets.ts` makes the same file from the short table of the runs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chooseSets, readOptima, readShortRuns, SETS_PATH, setsSource } from "../../scripts/portfolio-sets.ts";
import { PORTFOLIO_BANDS, PORTFOLIO_CAPS, PORTFOLIO_RULES } from "./bands.ts";
import { PORTFOLIO_SETS } from "./sets.ts";

describe("the sets of the portfolio router", () => {
  it("are the sets that the script chooses from the short table of the runs", () => {
    const short = readShortRuns();
    const source = setsSource(chooseSets(short, readOptima()), short.sources);
    expect(readFileSync(SETS_PATH, "utf8").replace(/\r\n/g, "\n")).toBe(source);
  }, 60_000);

  it("has a set for each rule, cap and band, with no base and no repeat", () => {
    for (const rule of PORTFOLIO_RULES)
      for (const cap of PORTFOLIO_CAPS)
        for (const band of PORTFOLIO_BANDS) {
          const set = PORTFOLIO_SETS[`${rule}|${cap}|${band.id}`];
          expect(set, `${rule} ${cap} ${band.id}`).toBeDefined();
          expect(set!.length).toBeGreaterThan(0);
          expect(set!.length).toBeLessThanOrEqual(8);
          expect(set).not.toContain("shared");
          expect(new Set(set).size).toBe(set!.length);
        }
  });
});
