// The input files of a screen set (SCREEN-V4-FILES). A set does not change after its files are in `corpus/<set>/`.
// The generator of a set can read the router. For example, `makeRoom` of `screen-v4` routes the level links.
// So a change of a router can change the boards that the generator makes. The files keep the boards of the set.
// The screen and the predicate dump read the files. Two arms of one screen thus route the same boards.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { documentHash, screenInputs, type LayoutCorpus, type LayoutInput, type ScreenSet } from "../src/bench/screen/index.ts";

/** The folder of the corpora at the root of the repository. */
export const CORPUS_ROOT: string = fileURLToPath(new URL("../../../corpus/", import.meta.url));

/**
 * This function gives the input files of the corpus `id`, in the order of its manifest `corpus.json`.
 * It gives `undefined` when the folder has no manifest. It throws when a file is missing or its hash is not the hash of the manifest.
 */
export function corpusInputs(id: string, root: string = CORPUS_ROOT): LayoutInput[] | undefined {
  const path = join(root, id, "corpus.json");
  if (!existsSync(path)) return undefined;
  const manifest = JSON.parse(readFileSync(path, "utf8")) as LayoutCorpus;
  if (manifest.corpus !== id) throw new Error(`The manifest ${path} names the corpus "${manifest.corpus}", not "${id}".`);
  return manifest.inputs.map((entry) => {
    const file = join(root, `${entry.id}.json`);
    if (!existsSync(file)) throw new Error(`The corpus ${id} has no file for the input ${entry.id}: ${file}.`);
    const input = JSON.parse(readFileSync(file, "utf8")) as LayoutInput;
    if (input.id !== entry.id) throw new Error(`The file ${file} has the id ${input.id}, not ${entry.id}.`);
    if (input.hash !== entry.hash || documentHash(input) !== entry.hash) throw new Error(`The file ${file} does not have the hash ${entry.hash} of the manifest.`);
    return input;
  });
}

/** This function gives the inputs of a screen set: its files when `corpus/<set>/` has them, else the boards of its generator. */
export function setInputs(set: ScreenSet, root: string = CORPUS_ROOT): LayoutInput[] {
  return corpusInputs(set.id, root) ?? screenInputs(set);
}
