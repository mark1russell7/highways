import { readFileSync } from "node:fs";
import { BUILT_IN_STRATEGIES, listStrategies, OPT_IN_STRATEGIES, STRATEGIES, type AnyStrategy } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { compareBoardOf, computePanels, parseHash, START } from "./compare-data.ts";
import { demoPickers } from "./demo-data.ts";
import { COMPARE_STRATEGIES, OPT_IN_NOTES } from "./opt-in.ts";

/** This function reads a file of the repository. */
const repoFile = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("the opt-in routers on the compare page (PHYSICAL-VISIBLE)", () => {
  it("gives each opt-in router one note, and no note to a default router", () => {
    expect(Object.keys(OPT_IN_NOTES).sort()).toEqual(OPT_IN_STRATEGIES.map((r) => r.name).sort());
    for (const r of listStrategies(STRATEGIES, "router")) expect(OPT_IN_NOTES[r.name], r.name).toBeUndefined();
  });

  it("finds each decimal number of a note in its source file", () => {
    for (const [name, note] of Object.entries(OPT_IN_NOTES)) {
      const source = repoFile(note.source);
      const numbers = note.text.match(/\d+\.\d+/g) ?? [];
      expect(numbers.length, name).toBeGreaterThan(0);
      for (const n of numbers) expect(source, `${name} ${n}`).toContain(n);
    }
  });

  it("gives its partner to each note that calls a won measure `better`, so that no such line reads as a win", () => {
    const won = Object.entries(OPT_IN_NOTES).filter(([, note]) => /\((R1|B1|R5 q95)\)[^.]*`better`/.test(note.text));
    expect(won.map(([name]) => name).sort()).toEqual(["adam", "attraction", "canals", "tight"]);
    for (const [name, note] of won) expect(note.text, name).toMatch(/partner `route\.[a-z.]+`, so it is no win\./);
  });

  it("states the time of each router, and the time of `repel` is 52.1 times `shared`", () => {
    for (const [name, note] of Object.entries(OPT_IN_NOTES)) expect(note.text, name).toMatch(/time is [\d.]+ times `shared`|takes \d+ to \d+ ms/);
    expect(OPT_IN_NOTES["repel"]!.text).toContain("52.1 times `shared`");
  });

  it("has the panels of the default routers first, in the order of `STRATEGIES`", () => {
    const names = listStrategies(COMPARE_STRATEGIES, "router").map((s) => s.name);
    const defaults = listStrategies(STRATEGIES, "router").map((s) => s.name);
    expect(names.slice(0, defaults.length)).toEqual(defaults);
    expect(names.slice(defaults.length)).toEqual(OPT_IN_STRATEGIES.map((r) => r.name));
    expect(names).toHaveLength(defaults.length + 11);
  });

  it("keeps each other step of the page on the built-in strategies, and gives the demo the same registry", () => {
    for (const step of ["group", "plugs", "highway", "levels", "curve", "room", "whole"] as const) {
      expect(listStrategies(COMPARE_STRATEGIES, step)).toEqual(listStrategies(STRATEGIES, step));
    }
    expect(BUILT_IN_STRATEGIES.some((s) => OPT_IN_NOTES[s.name] !== undefined && s.step === "router")).toBe(false);
    expect(demoPickers().find((p) => p.step === "router")?.names).toEqual(listStrategies(COMPARE_STRATEGIES, "router").map((s) => s.name));
  });

  it("runs each opt-in router live on the first board, with no hard-rule fault", () => {
    const data = computePanels({ ...parseHash(""), step: "router" });
    expect(data.board).toBe(START.board);
    for (const r of OPT_IN_STRATEGIES as readonly AnyStrategy[]) {
      const panel = data.panels.find((p) => p.strategy === r.name)!;
      expect(panel.skipped, r.name).toBeUndefined();
      expect(panel.violations, r.name).toBe(0);
    }
  }, 60_000);

  it("skips `repel` past its limit, so a board too large for a live run keeps the recorded numbers", () => {
    const repel = listStrategies(COMPARE_STRATEGIES, "router").find((s) => s.name === "repel")!;
    expect(repel.maxNodes).toBe(OPT_IN_NOTES["repel"]!.limit);
    expect(compareBoardOf(parseHash("")).nodes).toBeLessThan(repel.maxNodes!);
    expect(repelOf(OPT_IN_STRATEGIES).maxNodes).toBe(10_000);
  });
});

/** This function gives the router `repel` of the list of the package. The limit of the page does not change it. */
function repelOf(list: readonly AnyStrategy[]): AnyStrategy {
  return list.find((s) => s.name === "repel")!;
}
