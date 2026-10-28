import { readFileSync } from "node:fs";
import { DEFAULT_RNG, levelsOf } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { hubChainBoard, manyGroupsBoard, packedGridBoard } from "../cases.ts";
import { FIXTURES, makeFixture, type FixtureSpec } from "../fixtures.ts";
import { graphInput } from "../bench/screen/forms.ts";
import { caseSeed, inputId, manifestHash, SCREEN_V1, SCREEN_V2, screenInputs, setManifest, type ScreenSet } from "../bench/screen/set.ts";
import { wholeStrategies } from "../strategies/builtins.ts";
import type { Graph } from "../model.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "./index.ts";

const reg = highwaysRegistry();

/** The boards of the screen sets before CORPUS-GEN: the fixtures and the case boards, called with no registry. */
const fixture = (name: string): FixtureSpec => FIXTURES.find((f) => f.name === name)!;
const DENSE: FixtureSpec = { name: "dense-groups", kind: "clustered", nodes: 150, edgesPerNode: 2, seed: 3 };
const PACKED = { cols: 12, rows: 8, long: 48 } as const;
const direct: Readonly<Record<string, (k: number) => { graph: Graph; params: Readonly<Record<string, unknown>>; seed: number; name: string }>> = {
  "tiny-uniform": (k) => fixtureBoard(fixture("tiny-uniform"), k),
  "small-clustered": (k) => fixtureBoard(fixture("small-clustered"), k),
  "dense-groups": (k) => fixtureBoard(DENSE, k),
  "hub-chain": (k) => ({ graph: hubChainBoard({ seed: caseSeed(3, k) }), params: {}, seed: caseSeed(3, k), name: "case.hub-chain" }),
  "many-groups": (k) => ({ graph: manyGroupsBoard({ seed: caseSeed(7, k) }), params: {}, seed: caseSeed(7, k), name: "case.many-groups" }),
  "packed-grid": (k) => ({ graph: packedGridBoard({ ...PACKED, seed: caseSeed(11, k) }), params: PACKED, seed: caseSeed(11, k), name: "case.packed-grid" }),
};
function fixtureBoard(spec: FixtureSpec, k: number) {
  const { name: _name, seed: _seed, ...params } = spec;
  const seed = caseSeed(spec.seed, k);
  return { graph: makeFixture({ ...spec, seed }), params, seed, name: "fixture" };
}

/** This function gives the input files of a set from the direct calls. */
function directInputs(set: ScreenSet) {
  return set.families.flatMap((f) =>
    Array.from({ length: f.seeds }, (_, k) => {
      const d = direct[f.name]!(k);
      return graphInput(d.graph, { id: inputId(set.id, f.name, k), set: set.id, family: f.name, seed: k, generator: { name: d.name, version: 1, params: d.params, seed: d.seed }, cell: f.cell });
    }),
  );
}

/** This function routes a graph with the default pipeline (the whole strategy `pipeline` with its defaults). */
const route = (graph: Graph) => wholeStrategies.pipeline.run(graph);

/** This function examines a board and its routes: some nodes, a route for each edge, and no level item without nodes. */
function expectRouted(graph: Graph, where: string): void {
  expect(graph.nodes.length, where).toBeGreaterThan(0);
  const { result } = route(graph);
  expect(result.routes.length, where).toBe(graph.edges.length);
  for (const level of result.levels ?? []) for (const item of level.items) expect(item.nodes.length, `${where}: ${item.id}`).toBeGreaterThan(0);
}

describe("the corpus families of highways (CORPUS-GEN)", () => {
  it("has the 6 families of the screen sets, in their order", () => {
    expect(HIGHWAYS_FAMILIES.map((f) => f.name)).toEqual(SCREEN_V2.families.map((f) => f.name));
    expect(reg.families().map((f) => f.name)).toEqual(SCREEN_V2.families.map((f) => f.name));
  });

  it("gives the 74 screen boards of the direct calls through the registry, and the manifest hashes do not change", () => {
    for (const set of [SCREEN_V1, SCREEN_V2]) expect(screenInputs(set)).toEqual(directInputs(set));
    expect(screenInputs(SCREEN_V1).length + screenInputs(SCREEN_V2).length).toBe(74);
    expect(manifestHash(setManifest(SCREEN_V1))).toBe("e5fe56d1069d2a18");
    expect(manifestHash(setManifest(SCREEN_V2))).toBe("35795acefa7148c3");
    const file = (set: string) => JSON.parse(readFileSync(new URL(`../../../../corpus/${set}/corpus.json`, import.meta.url), "utf8")) as unknown;
    expect(setManifest(SCREEN_V1)).toEqual(file("screen-v1"));
    expect(setManifest(SCREEN_V2)).toEqual(file("screen-v2"));
  });

  it("pins the first 8 numbers of mulberry32 for the seed 0, as `docs/CORPUS.md` of the contract asks", () => {
    const r = DEFAULT_RNG(0);
    expect(Array.from({ length: 8 }, () => Math.round(r() * 4294967296))).toEqual([1144304738, 1416247, 958946056, 627933444, 2007157716, 2340967985, 2642484575, 2787370982]);
  });

  it("gives the same board for an explicit default and for a missing dimension", () => {
    for (const f of HIGHWAYS_FAMILIES) {
      const defaults = Object.fromEntries(f.dimensions.map((d) => [d.name, d.default]));
      for (const seed of [0, 5, 1012]) expect(reg.generate(f.name, seed, defaults), f.name).toEqual(reg.generate(f.name, seed));
    }
  });

  it("writes only the dimensions away from the default into the generator record", () => {
    expect(reg.generate("tiny-uniform", 1, { nodes: 20 }).generator.params).toEqual({ kind: "uniform", nodes: 20, edgesPerNode: 1.5 });
    expect(reg.generate("tiny-uniform", 1, { layout: "grid", locality: 0.5 }).generator.params).toEqual({ kind: "grid", nodes: 10, edgesPerNode: 1.5, locality: 0.5 });
    expect(reg.generate("hub-chain", 3, { cols: 16 }).generator.params).toEqual({ cols: 16 });
    expect(reg.generate("packed-grid", 11).generator.params).toEqual(PACKED);
    expect(reg.generate("packed-grid", 11, { reach: 1 }).generator.params).toEqual({ ...PACKED, reach: 1 });
  });

  it("generates and routes each cell of `cells` with no throw, no empty board and no level item without nodes", () => {
    for (const f of HIGHWAYS_FAMILIES)
      for (const dims of reg.cells(f.name)) {
        const board = reg.generate(f.name, 4, dims);
        expectRouted(board.graph, `${f.name} ${JSON.stringify(dims)}`);
      }
  });

  it("generates and routes each boundary cell of each family", () => {
    for (const f of HIGHWAYS_FAMILIES)
      for (const dims of reg.boundaryCells(f.name)) {
        const board = reg.generate(f.name, 4, dims);
        expectRouted(board.graph, `${f.name} ${JSON.stringify(dims)}`);
      }
  });

  it("gives levels for each numeric dimension, so a host can sweep it", () => {
    for (const f of HIGHWAYS_FAMILIES) for (const d of f.dimensions) expect(levelsOf(d, 3).length, `${f.name}.${d.name}`).toBeGreaterThan(0);
  });
});
