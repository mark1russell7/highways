// The command line that writes the input files of a screen set: `pnpm screen:inputs [--set screen-v1] [--out <dir>]`.
// It writes `<out>/<set>/<family>/s<seed>.json` and the manifest `<out>/<set>/corpus.json`. The default folder is `corpus` at the root of the repository.
// A set with held-out members also gets its split file `<out>/splits/<set>.<corpus hash>.json` (`corpus-split/1`).
// The packing repository reads the same files. A test compares the files with `screenInputs`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatInput, SCREEN_SETS, screenInputs, screenSplit, setManifest, splitPath } from "../src/bench/screen/index.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = opt("--set") ?? "screen-v1";
const set = SCREEN_SETS[id];
if (!set) throw new Error(`There is no screen set "${id}". The sets are ${Object.keys(SCREEN_SETS).join(", ")}.`);
const out = resolve(opt("--out") ?? join(dirname(fileURLToPath(import.meta.url)), "../../../corpus"));
const inputs = screenInputs(set);
for (const input of inputs) {
  const file = join(out, `${input.id}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, formatInput(input));
}
const manifest = setManifest(set, inputs);
writeFileSync(join(out, set.id, "corpus.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`${inputs.length} inputs of ${set.id} in ${join(out, set.id)}`);
const split = screenSplit(set, manifest);
if (split) {
  const file = join(out, splitPath(split));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(split, null, 2) + "\n");
  console.log(`The split file of ${set.id}: ${file}`);
}
