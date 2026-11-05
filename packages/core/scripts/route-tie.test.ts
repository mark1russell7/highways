import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { patchVisibility } from "./route-tie-hook.ts";
import { CHOSEN, NAMES, REGENERATE, sliceRows, TOLERANCES, type RouteTieRecord } from "./route-tie-rows.ts";

const record = JSON.parse(readFileSync(new URL("./data/route-tie/record.json", import.meta.url), "utf8")) as RouteTieRecord;
const source = readFileSync(new URL("../src/visibility.ts", import.meta.url), "utf8");
const STALE = `The record route-tie/1 is stale. Write it again with: ${REGENERATE}`;

describe("the record route-tie/1", () => {
  it("equals fresh rows on a part of the families", () => {
    expect(sliceRows(), STALE).toEqual(record.slice);
  }, 120_000);

  it("names the distance of the source, and holds its read on each side", () => {
    expect(source).toContain(`const TIE = ${CHOSEN};`);
    expect(record.chosen).toBe(CHOSEN);
    expect(record.tolerances.map((row) => row.tie)).toEqual([...TOLERANCES]);
    const row = record.tolerances.find((r) => r.tie === CHOSEN)!;
    expect(row.movedFromChosen).toBe(0);
    expect(row.law).toBe(0);
    for (const near of record.tolerances.filter((r) => r.tie >= 1e-12 && r.tie <= 1e-5)) expect(near.law, String(near.tie)).toBe(0);
  });

  it("reads the law after the rule on each router, and a break before it on `corners`", () => {
    expect(record.routers.map((r) => r.router)).toEqual([...NAMES]);
    for (const row of record.routers) expect(row.lawAfter, row.router).toEqual([0, 0]);
    const corners = record.routers.find((r) => r.router === "corners")!;
    expect(corners.lawBefore.every((moved) => moved > 0)).toBe(true);
  });

  it("gives each moved route under a shift one kind", () => {
    const corners = record.routers.find((r) => r.router === "corners")!;
    const { graph, search, other } = record.shiftKinds;
    expect(graph + search + other).toBe(corners.shiftAfter.reduce((a, b) => a + b, 0));
  });
});

describe("the text of an arm of the record", () => {
  const text = "const TIE = 1e-9;\n  count: number,\n  ): Among | undefined {\n";

  it("changes only what the arm asks", () => {
    expect(patchVisibility(text, {})).toBe(text);
    expect(patchVisibility(text, { tie: "1e-5" })).toContain("const TIE = 1e-5;");
    expect(patchVisibility(text, { floor: "0.5" })).toContain("floor *= 0.5;");
  });

  it("refuses a search with no text to change, so an arm does not read the wrong code", () => {
    expect(() => patchVisibility("const OTHER = 1;", { tie: "1e-5" })).toThrow(/finds 0 matches/);
    expect(() => patchVisibility("const OTHER = 1;", { floor: "0.5" })).toThrow(/finds 0 matches/);
  });
});
