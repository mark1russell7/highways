import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXACT_CLASSES, EXACT_V1, EXACT_V1_SEEDS, EXACT_V1_SIZES, exactSeed } from "./exact-set.ts";
import { documentHash } from "./hash.ts";
import { formatInput, inputGraph, type LayoutInput } from "./forms.ts";
import { corpusManifest, SCREEN_SETS, screenInputs, type LayoutCorpus } from "./set.ts";

const inputs = screenInputs(EXACT_V1);

describe("the screen set exact-v1 (MEAS2)", () => {
  it("has each class with its seeds, and ids of the form exact-v1/<class>/s<seed>", () => {
    expect(SCREEN_SETS["exact-v1"]).toBe(EXACT_V1);
    expect(EXACT_CLASSES.length).toBeGreaterThanOrEqual(4);
    expect(EXACT_V1_SEEDS).toBeGreaterThanOrEqual(10);
    expect(inputs.map((i) => i.id)).toEqual(EXACT_CLASSES.flatMap((c) => Array.from({ length: EXACT_V1_SEEDS }, (_, k) => `exact-v1/${c}/s${k}`)));
  });

  it("gives each member its size, its seed and about 1.5 edges for each node", () => {
    for (const input of inputs) {
      const k = input.seed;
      const graph = inputGraph(input);
      expect(graph.nodes.length, input.id).toBe(EXACT_V1_SIZES[k % EXACT_V1_SIZES.length]);
      expect(input.generator?.seed, input.id).toBe(exactSeed(input.family as (typeof EXACT_CLASSES)[number], k));
      expect(graph.edges.length / graph.nodes.length, input.id).toBeGreaterThan(1);
      expect(graph.edges.length / graph.nodes.length, input.id).toBeLessThan(2);
    }
  });

  it("matches the files in corpus/exact-v1", () => {
    const root = new URL("../../../../../corpus/exact-v1/", import.meta.url);
    for (const input of inputs) {
      const file = JSON.parse(readFileSync(new URL(`${input.family}/s${input.seed}.json`, root), "utf8")) as LayoutInput;
      expect(file, input.id).toEqual(input);
      expect(documentHash(file)).toBe(file.hash);
      expect(JSON.parse(formatInput(input))).toEqual(input);
    }
    const manifest = JSON.parse(readFileSync(new URL("corpus.json", root), "utf8")) as LayoutCorpus;
    expect(manifest).toEqual(corpusManifest("exact-v1", inputs));
  });
});
