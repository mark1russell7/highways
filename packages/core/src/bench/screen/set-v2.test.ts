import { readFileSync } from "node:fs";
import { checkSplit, corpusHashOf, declaredClaimOf, splitFolds } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { hubChainBoard, manyGroupsBoard } from "../../cases.ts";
import { documentHash } from "./hash.ts";
import { formatInput, graphInput, type LayoutInput } from "./forms.ts";
import {
  caseSeed,
  checkFamilies,
  manifestHash,
  SCREEN_SETS,
  SCREEN_V1,
  SCREEN_V2,
  SCREEN_V2_HELD_OUT,
  screenInputs,
  screenSplit,
  setManifest,
  splitPath,
  type LayoutCorpus,
} from "./set.ts";

const v1 = screenInputs(SCREEN_V1);
const v2 = screenInputs(SCREEN_V2);
const root = new URL("../../../../../corpus/", import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const byId = (list: readonly LayoutInput[], id: string): LayoutInput => list.find((i) => i.id === id)!;

describe("the shared corpus checks of the contract", () => {
  it("gives the pinned corpus hash of the contract, of packing and of highways", () => {
    const inputs = [1, 2, 3].map((k) => ({ id: `t/a/s${k}`, hash: `h${k}` }));
    expect(corpusHashOf("t", inputs)).toBe("85baebbf77017041");
  });

  it("gives the corpus hashes of screen-v1 and screen-v2", () => {
    expect(manifestHash(readJson("screen-v1/corpus.json") as LayoutCorpus)).toBe("e5fe56d1069d2a18");
    expect(manifestHash(readJson("screen-v2/corpus.json") as LayoutCorpus)).toBe("35795acefa7148c3");
  });
});

describe("the case boards with a seed", () => {
  it("gives the old board for the default seed", () => {
    expect(hubChainBoard({ seed: 3 })).toEqual(hubChainBoard());
    expect(manyGroupsBoard({ seed: 7 })).toEqual(manyGroupsBoard());
  });

  it("changes the links for a new seed, and keeps the chain of hubs and the groups", () => {
    const hubs = Array.from({ length: 10 }, (_, k) => hubChainBoard({ seed: caseSeed(3, k) }));
    const groups = Array.from({ length: 10 }, (_, k) => manyGroupsBoard({ seed: caseSeed(7, k) }));
    for (const list of [hubs, groups]) {
      expect(new Set(list.map((g) => JSON.stringify(g.edges))).size).toBe(10);
      for (const g of list) expect(g.nodes).toEqual(list[0]!.nodes);
    }
    // The 3 rows of 32 cards keep their 93 links to the next card, and the long links come after them.
    for (const g of hubs) {
      expect(g.nodes).toHaveLength(96);
      expect(g.edges.slice(0, 93).map((e) => [e.source.node, e.target.node])).toEqual(hubChainBoard().edges.slice(0, 93).map((e) => [e.source.node, e.target.node]));
      expect(g.edges.length).toBeGreaterThan(93 + 10);
    }
    // The 32 groups of 4 cards keep their 96 links in the group, and the links between groups come after them.
    for (const g of groups) {
      expect(g.nodes).toHaveLength(128);
      expect(g.edges.slice(0, 96).map((e) => [e.source.node, e.target.node])).toEqual(manyGroupsBoard().edges.slice(0, 96).map((e) => [e.source.node, e.target.node]));
      expect(g.edges.length).toBeGreaterThan(96 + 48);
    }
  });
});

describe("the screen set screen-v2 (CORPUS-SEEDS)", () => {
  it("has the 6 families of screen-v1, each with the 10 seeds 0 to 9", () => {
    expect(SCREEN_SETS["screen-v2"]).toBe(SCREEN_V2);
    expect(SCREEN_V2.families.map((f) => f.name)).toEqual(SCREEN_V1.families.map((f) => f.name));
    expect(v2).toHaveLength(60);
    expect(v2.map((i) => i.id)).toEqual(SCREEN_V2.families.flatMap((f) => Array.from({ length: 10 }, (_, k) => `screen-v2/${f.name}/s${k}`)));
    for (const i of v2) expect(i.hash).toBe(documentHash(i));
    expect(new Set(v2.map((i) => JSON.stringify([i.boxes, i.edges]))).size).toBe(60);
  });

  it("gives the boards of screen-v1 for the seeds of screen-v1: the same input hash under the head of screen-v1", () => {
    for (const old of v1) {
      const family = SCREEN_V2.families.find((f) => f.name === old.family)!;
      const input = byId(v2, `screen-v2/${old.family}/s${old.seed}`);
      expect(input.generator, old.id).toEqual(old.generator);
      expect(input.cell, old.id).toEqual(old.cell);
      const head = { id: old.id, set: old.set, family: old.family, seed: old.seed, generator: input.generator!, cell: input.cell! };
      expect(graphInput(family.make(old.seed), head).hash, old.id).toBe(old.hash);
      expect({ boxes: input.boxes, edges: input.edges }, old.id).toEqual({ boxes: old.boxes, edges: old.edges });
    }
    expect(v1).toHaveLength(14);
  });

  it("matches the files in corpus/screen-v2", () => {
    for (const input of v2) {
      const file = readJson(`screen-v2/${input.family}/s${input.seed}.json`) as LayoutInput;
      expect(file, input.id).toEqual(input);
      expect(JSON.parse(formatInput(input))).toEqual(input);
    }
    expect(readJson("screen-v2/corpus.json")).toEqual(setManifest(SCREEN_V2, v2));
    expect(readJson("screen-v1/corpus.json")).not.toHaveProperty("claims");
  });

  it("passes the claim declared of its manifest with checkDeclared, and the check finds a wrong count", () => {
    const manifest = readJson("screen-v2/corpus.json") as LayoutCorpus;
    expect(declaredClaimOf(manifest)).toEqual({ minCount: 10, thin: [], counts: Object.fromEntries(SCREEN_V2.families.map((f) => [f.name, 10])) });
    expect(checkFamilies(manifest, v2)).toEqual([]);
    expect(checkFamilies(manifest, v2.slice(1)).map((b) => b.detail)).toEqual([
      'the property "tiny-uniform" has the count 10, but the inputs give 9',
      'the property "tiny-uniform" has 9 inputs, below minCount 10, and it is not in thin',
    ]);
    expect(checkFamilies(setManifest(SCREEN_V1, v1), v1)).toEqual([]);
  });

  it("passes checkSplit on its split file, and holds out the seeds 7 to 9 of each family", () => {
    const manifest = readJson("screen-v2/corpus.json") as LayoutCorpus;
    const split = screenSplit(SCREEN_V2)!;
    expect(splitPath(split)).toBe("splits/screen-v2.35795acefa7148c3.json");
    const file = readJson(splitPath(split));
    expect(file).toEqual(split);
    expect(checkSplit(file, manifest, "default")).toEqual([]);
    expect(checkSplit(file, manifest, "by-member")).toEqual([]);
    expect(screenSplit(SCREEN_V1)).toBeUndefined();

    const [fold] = splitFolds(file, manifest, "default");
    const seedOf = (k: number) => new Set(v2.filter((i) => i.seed === k).map((i) => i.generator!.seed));
    const held = new Set(fold!.heldOut);
    for (const input of v2) expect(held.has(input.generator!.seed), input.id).toBe(SCREEN_V2_HELD_OUT.includes(input.seed));
    expect(fold!.heldOut).toEqual([...SCREEN_V2_HELD_OUT.flatMap((k) => [...seedOf(k)])].sort((a, b) => a - b));
    expect(fold!.train.length + fold!.heldOut.length).toBe(new Set(v2.map((i) => i.generator!.seed)).size);

    const members = splitFolds(file, manifest, "by-member");
    expect(members).toHaveLength(10);
    members.forEach((f, k) => expect(f.heldOut).toEqual([...seedOf(k)].sort((a, b) => a - b)));

    // A change of one input changes the corpus hash, so the split file does not fit the changed corpus.
    const changed = { ...manifest, inputs: manifest.inputs.map((i, n) => (n === 0 ? { ...i, hash: "0000000000000000" } : i)) };
    expect(checkSplit(file, changed).map((b) => b.detail)).toEqual([`the corpusHash is 35795acefa7148c3, but the corpus gives ${manifestHash(changed)}`]);
  });
});
