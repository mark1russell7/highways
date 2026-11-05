// Gate (b) of `Search work`: the stops of two systems are byte-equal (`node scripts/gates/same-stops.ts <file> <file>`).
// The exit code is 0 for equal files and 1 for different files. The job `same` and the flip test call this one script.
// The script reads only the two files and needs no package, because the job `same` has a sparse checkout with no install.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** This function gives the position of the first byte that differs, or `null` when the two values are byte-equal. */
export function firstDifference(a: Uint8Array, b: Uint8Array): number | null {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? null : length;
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [first, second] = process.argv.slice(2);
  if (first === undefined || second === undefined) throw new Error("The script takes two files.");
  const at = firstDifference(readFileSync(first), readFileSync(second));
  if (at !== null) {
    console.error(`same stops: the files differ at byte ${at}.`);
    process.exit(1);
  }
  console.log("same stops: the files are byte-equal.");
}
