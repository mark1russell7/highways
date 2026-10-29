import { readFileSync } from "node:fs";
import { HIGHWAYS_FAMILIES, screenInputs, SCREEN_V3, type ParamValue } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { compareBoardOf, formatHash, GENERATED_BOARD, parseHash } from "./compare-data.ts";
import {
  cleanGen,
  GEN_FAMILIES,
  genControls,
  genGraph,
  NAMED_GENS,
  newSeed,
  readGen,
  sliderIndex,
  sliderSteps,
  sliderValue,
  START_GEN,
  writeGen,
  type GenSpec,
} from "./generated.ts";

const source = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");

describe("the generated boards of the site (CORPUS-GEN)", () => {
  it("has each family of HIGHWAYS_FAMILIES, with a control for each dimension, in the order of the dimensions", () => {
    expect(GEN_FAMILIES.map((f) => f.name)).toEqual(HIGHWAYS_FAMILIES.map((f) => f.name));
    for (const f of GEN_FAMILIES) {
      const controls = genControls(f);
      expect(controls.map((c) => c.dim.name), f.name).toEqual(f.dimensions.map((d) => d.name));
      for (const c of controls) {
        if (c.dim.kind === "enum") expect(c.kind).toBe("select");
        else if (c.dim.kind === "bool") expect(c.kind).toBe("check");
        else expect(c.kind).toBe("slider");
      }
    }
  });

  it("builds the controls on the three pages from the families, with no name of a dimension in the page code", () => {
    for (const page of ["examples.ts", "compare.ts", "index.ts"]) expect(source(page), page).toContain("genPanel(");
    const panel = source("gen-controls.ts");
    expect(panel).toContain("genControls(family)");
    for (const f of GEN_FAMILIES) for (const d of f.dimensions) expect(panel, d.name).not.toContain(`"${d.name}"`);
  });

  it("gives the screen board of each family at its defaults: the member 0 of `screen-v3`", () => {
    const inputs = screenInputs(SCREEN_V3);
    expect(NAMED_GENS.slice(0, GEN_FAMILIES.length).map((n) => n.spec.family)).toEqual(GEN_FAMILIES.map((f) => f.name));
    for (const n of NAMED_GENS.slice(0, GEN_FAMILIES.length)) {
      const member = inputs.find((i) => i.id === `screen-v3/${n.spec.family}/s0`)!;
      const graph = genGraph(n.spec);
      expect(graph.nodes.map((x) => x.id), n.name).toEqual(member.boxes.map((b) => b.id));
      expect(graph.edges.length, n.name).toBe(member.edges.length);
    }
  });

  it("writes the hash keys family, seed and the dimensions away from their defaults, and reads them back", () => {
    const spec: GenSpec = { family: "hub-chain", seed: 12, dims: { rows: 6, cols: 24, long: 120 } };
    expect(writeGen(spec).toString()).toBe("family=hub-chain&seed=12&rows=6&cols=24&long=120");
    expect(readGen(writeGen(spec))).toEqual(spec);
    expect(writeGen({ family: "tiny-uniform", seed: 1, dims: { nodes: 10, layout: "uniform" } }).toString()).toBe("family=tiny-uniform&seed=1");
    expect(readGen(new URLSearchParams("family=tiny-uniform&seed=4&layout=grid&nodes=9999&locality=x&fixedPorts=0.5"))).toEqual({
      family: "tiny-uniform",
      seed: 4,
      dims: { layout: "grid", fixedPorts: 0.5 },
    });
    expect(readGen(new URLSearchParams("family=nope&seed=4"))).toBeUndefined();
    expect(readGen(new URLSearchParams("family=packed-grid"))).toEqual({ family: "packed-grid", seed: START_GEN.seed, dims: {} });
    expect(cleanGen({ family: "packed-grid", seed: -3, dims: {} }).seed).toBe(START_GEN.seed);
  });

  it("gives each named example a clean spec that generates a board with nodes", () => {
    expect(new Set(NAMED_GENS.map((n) => n.id)).size).toBe(NAMED_GENS.length);
    for (const n of NAMED_GENS) {
      expect(cleanGen(n.spec), n.id).toEqual(n.spec);
      expect(genGraph(n.spec).nodes.length, n.id).toBeGreaterThan(0);
    }
  });

  it("puts each default on a step of its slider, and each step gives a value in range", () => {
    for (const f of GEN_FAMILIES)
      for (const d of f.dimensions) {
        if (d.kind !== "int" && d.kind !== "real") continue;
        const steps = sliderSteps(d);
        expect(sliderValue(d, sliderIndex(d, d.default as number)), `${f.name}.${d.name}`).toBe(d.default);
        for (const i of [0, Math.floor(steps / 3), steps]) {
          const v = sliderValue(d, i);
          expect(v).toBeGreaterThanOrEqual(d.min!);
          expect(v).toBeLessThanOrEqual(d.max!);
          if (d.kind === "int") expect(Number.isInteger(v)).toBe(true);
        }
        expect(sliderValue(d, 0)).toBe(d.min);
        expect(sliderValue(d, steps)).toBe(d.max);
      }
  });

  it("gives a new seed in the range of the seed field", () => {
    expect(newSeed(() => 0)).toBe(0);
    expect(newSeed(() => 0.999999999)).toBeLessThanOrEqual(4294967295);
  });

  it("takes a generated board on the compare page, with the same hash keys", () => {
    const state = { step: "router" as const, board: GENERATED_BOARD, options: {}, gen: { family: "many-groups", seed: 7, dims: { groupCols: 3 } as Record<string, ParamValue> } };
    const hash = formatHash(state);
    expect(hash).toBe("#step=router&board=generated&family=many-groups&seed=7&groupCols=3");
    expect(parseHash(hash)).toEqual(state);
    expect(parseHash("#step=router&board=generated").gen).toEqual(START_GEN);
    const board = compareBoardOf(state);
    expect(board.nodes).toBe(3 * 4 * 4);
    expect(board.graph).toEqual(genGraph(state.gen));
  });
});
