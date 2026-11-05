import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROUTERS } from "../src/routers/index.ts";
import { CONTROL_PARTNERS, CONTROLS, controlWins, measureRows, readBoards, readsWorse, SLICE, type MeasureRow, type winsRecord } from "./control-wins-rows.ts";

const saved = JSON.parse(readFileSync(new URL("./data/control-wins/record.json", import.meta.url), "utf8")) as ReturnType<typeof winsRecord>;
const byName = new Map<string, MeasureRow>(saved.rows.map((r) => [r.name, r]));

describe("the record control-wins/1", () => {
  it("holds fresh values for its part of the boards", () => {
    expect(saved.slice, `The record is stale. Write it again with: ${saved.regenerate}`).toEqual(measureRows(readBoards(SLICE.families, SLICE.seeds)));
  });

  it("gives each measure that a control wins a partner that the control loses", () => {
    for (const control of CONTROLS) {
      for (const row of saved.rows.filter((r) => controlWins(r, control))) {
        const partner = CONTROL_PARTNERS[control][row.name];
        expect(partner, `${control} wins ${row.name} and has no partner`).toBeDefined();
        expect(readsWorse(byName.get(partner!)!, control), `${control} wins ${row.name} and does not lose ${partner}`).toBe(true);
      }
    }
  });

  it("names no partner for a measure that the control does not win", () => {
    for (const control of ["straight"] as const) {
      for (const name of Object.keys(CONTROL_PARTNERS[control])) expect(controlWins(byName.get(name)!, control), `${control} on ${name}`).toBe(true);
    }
    const shared = Object.keys(CONTROL_PARTNERS["one-trunk"]);
    for (const name of shared) expect(controlWins(byName.get(name)!, "one-trunk"), `one-trunk on ${name}`).toBe(true);
  });

  it("keeps the two new controls out of the default routers", () => {
    const names = ROUTERS.map((r) => r.name);
    expect(names).not.toContain("one-trunk");
    expect(names).not.toContain("perimeter");
  });
});
