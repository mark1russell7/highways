// The tests of the verdict step of `Screen` (VERDICT-RUN): the rule of the rows, the bases, the list of steps and the check.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkRows, snapshotStrategies, STEP_BASE, VERDICT_STEPS } from "./screen-verdict.ts";

const root = new URL("../../../", import.meta.url);
const verdicts = new URL("docs/research/verdicts/", root);

describe("snapshotStrategies", () => {
  it("keeps the built-in strategies of the records in their sequence, without the base", () => {
    expect(snapshotStrategies(["shared", "corners", "variant-a", "trunks", "corners"], ["trunks", "corners", "shared", "seams"], "shared")).toEqual(["corners", "trunks"]);
  });

  it("gives no strategy when the records hold only opt-in strategies", () => {
    expect(snapshotStrategies(["variant-a", "variant-b"], ["corners"], "shared")).toEqual([]);
  });
});

describe("STEP_BASE", () => {
  it("gives the base of each committed snapshot of the page", () => {
    const files = readdirSync(verdicts).filter((f) => /^screen-v\d+-[a-z]+\.json$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const snapshot = JSON.parse(readFileSync(new URL(file, verdicts), "utf8")) as { step: string; base: string };
      expect(STEP_BASE[snapshot.step], file).toBe(snapshot.base);
    }
  });

  it("has a base for each step of the verdict", () => {
    for (const step of VERDICT_STEPS) expect(STEP_BASE[step], step).toBeDefined();
  });
});

describe("VERDICT_STEPS", () => {
  it("is the list of steps in the condition of the verdict step of screen.yml", () => {
    const text = readFileSync(new URL(".github/workflows/screen.yml", root), "utf8");
    const lists = [...text.matchAll(/contains\(fromJSON\('(\[[^\]]*\])'\), matrix\.step\)/g)].map((m) => JSON.parse(m[1]!) as string[]);
    expect(lists).toEqual([[...VERDICT_STEPS]]);
  });
});

describe("checkRows", () => {
  const row = (strategy: string, guard: string, label: string) => ({ strategy, guard, label });

  it("passes when each row has the same label", () => {
    const rows = [row("corners", "R1", "better"), row("corners", "R4", "no verdict")];
    expect(checkRows(rows, rows)).toEqual({ moved: [], missing: [], added: [] });
  });

  it("names a moved label, a missing row and a new row", () => {
    const stored = [row("corners", "R1", "better"), row("trunks", "R1", "worse")];
    const fresh = [row("corners", "R1", "depends on the mix"), row("seams", "R1", "better")];
    expect(checkRows(stored, fresh)).toEqual({
      moved: ['corners R1: the label moved from "better" to "depends on the mix"'],
      missing: ["trunks R1: the row is missing"],
      added: ["seams R1: a row that the snapshot does not have"],
    });
  });
});
