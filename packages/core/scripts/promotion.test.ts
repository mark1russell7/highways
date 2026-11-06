import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./promotion.ts", import.meta.url));
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("the promotion script", () => {
  it("gives 'not measured' for a measure that only the baseline has, and the verdicts of the other measures (PROMOTION-NO-PAIR)", () => {
    const d = mkdtempSync(join(tmpdir(), "promotion-"));
    dirs.push(d);
    // Made-up records: the two strategies have the crossings, and only the baseline has the lane fidelity of the bundles.
    const rows = ["grid", "maze", "comb"].flatMap((family) =>
      [0, 1, 2, 3].flatMap((seed) => [
        { strategy: "base", input: `set/${family}/s${seed}`, seed, measures: { "route.crossings": 10 + seed, "route.bundle.lane-fidelity.median": 1 } },
        { strategy: "cand", input: `set/${family}/s${seed}`, seed, measures: { "route.crossings": 8 + seed } },
      ]),
    );
    writeFileSync(join(d, "screen.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    const run = spawnSync(process.execPath, [script, "--candidate", "cand", "--baseline", "base", "--corpus", join(d, "screen.jsonl"), "--out", join(d, "p.md"), "--json", join(d, "p.json")], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const verdicts = (JSON.parse(readFileSync(join(d, "p.json"), "utf8")) as { sets: { verdicts: { key: string; label: string; pHolm?: number }[] }[] }).sets[0]!.verdicts;
    expect(verdicts.map((v) => [v.key, v.label])).toEqual([
      ["R1.crossings", "better"],
      ["B9.median", "not measured"],
    ]);
    // The measure with no pair is not a test, so the Holm correction counts one test only.
    expect(verdicts[0]!.pHolm).toBe(2 ** -11);
    const text = readFileSync(join(d, "p.md"), "utf8");
    expect(text).toContain("| `B9.median` | not measured | - | - | - | - | - | - |");
    expect(text).toContain("1 measures have no pair of records, so they are not measured.");
  });
});
