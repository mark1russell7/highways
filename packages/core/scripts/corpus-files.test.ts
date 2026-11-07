import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { corpusManifest, formatInput, graphInput, SCREEN_V1, type LayoutInput } from "../src/bench/screen/index.ts";
import type { Graph } from "../src/model.ts";
import { corpusInputs, setInputs } from "./corpus-files.ts";

const dir = mkdtempSync(join(tmpdir(), "corpus-files-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** This function writes a corpus of one small board in a new folder of `dir`, and gives the folder and the input. */
function writeCorpus(name: string): { root: string; input: LayoutInput } {
  const root = join(dir, name);
  const graph: Graph = {
    nodes: [
      { id: "a", box: { x: 0, y: 0, w: 10, h: 10 } },
      { id: "b", box: { x: 40, y: 0, w: 10, h: 10 } },
    ],
    edges: [{ id: "e", source: { node: "a" }, target: { node: "b" } }],
  };
  const input = graphInput(graph, { id: "made/one/s0", set: "made", family: "one", seed: 0, generator: null });
  mkdirSync(join(root, "made", "one"), { recursive: true });
  writeFileSync(join(root, "made", "one", "s0.json"), formatInput(input));
  writeFileSync(join(root, "made", "corpus.json"), JSON.stringify(corpusManifest("made", [input]), null, 2) + "\n");
  return { root, input };
}

describe("the input files of a screen set (SCREEN-V4-FILES)", () => {
  it("reads the files of a corpus in the order of its manifest", () => {
    const { root, input } = writeCorpus("good");
    expect(corpusInputs("made", root)).toEqual([input]);
  });

  it("gives no inputs for a corpus with no manifest, so the generator makes the boards", () => {
    const { root } = writeCorpus("none");
    expect(corpusInputs("other", root)).toBeUndefined();
    expect(setInputs(SCREEN_V1, root).length).toBeGreaterThan(0);
  });

  it("refuses a file that is not the file of the manifest", () => {
    const { root, input } = writeCorpus("changed");
    writeFileSync(join(root, "made", "one", "s0.json"), formatInput({ ...input, boxes: input.boxes.map((b) => ({ ...b, x: (b.x ?? 0) + 1 })) }));
    expect(() => corpusInputs("made", root)).toThrow(/does not have the hash/);
  });

  it("refuses a manifest that names a missing file", () => {
    const { root } = writeCorpus("missing");
    rmSync(join(root, "made", "one", "s0.json"));
    expect(() => corpusInputs("made", root)).toThrow(/has no file/);
  });

  it("reads the 60 files of screen-v4 from the folder of the corpora", () => {
    const inputs = corpusInputs("screen-v4")!;
    expect(inputs).toHaveLength(60);
    expect(inputs.every((i) => i.set === "screen-v4")).toBe(true);
  });
});
