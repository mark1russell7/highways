// The paths of the sections gate (GATE-SCOPE). This script reads the imports of the measured route, so that no hand list says what the gate is about.
// The job `changes` of `.github/workflows/sections-gate.yml` starts it and gives each line of its output to the action `changes` as a pattern.
// A type import has no effect on the time of a route, so the walk leaves it out.
// The walk fails closed. A missing file or an unknown form of import gives the pattern `**`, so the gate runs.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");

/** The files where the walk starts: the measured router and the script that times it. */
const STARTS: readonly string[] = ["packages/core/src/routers/sections.ts", "packages/core/scripts/sections-bisect.ts"];

/** The other paths of the gate. The file `builtins.ts` holds the preset of the measured router. The walk does not start there, because that file imports each router. */
const OTHER_PATHS: readonly string[] = [
  ".github/workflows/sections-gate.yml",
  "packages/core/scripts/gates/scope.ts",
  "packages/core/scripts/data/sections-gate/**",
  "packages/core/src/strategies/builtins.ts",
];

/** The path of the file that holds the version of each package that the route imports. */
const LOCK = "pnpm-lock.yaml";

/** The pattern that matches each file. The output has only this pattern when the walk fails. */
export const ALL_PATHS = "**";

/** The known imports that the walk cannot read, by file. `sections-bisect.ts` loads the core of a worktree, and the walk of the route covers that core. */
const KNOWN_OPAQUE: Readonly<Record<string, number>> = { "packages/core/scripts/sections-bisect.ts": 1 };

/** The result of a walk: the files that the start files reach and the packages that they import. */
export interface Closure {
  /** The paths of the files, from the root of the walk, with forward slashes, in sorted order. */
  readonly files: readonly string[];
  /** The names of the packages, in sorted order. */
  readonly packages: readonly string[];
}

/** This function gives the targets of the imports of a source text. It leaves out `import type` and `export type`. */
export function importsOf(source: string): string[] {
  const fixed = source.matchAll(/^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?"([^"]+)"/gm);
  const dynamic = source.matchAll(/\bimport\("([^"]+)"\)/g);
  return [...fixed, ...dynamic].map((m) => m[1]!);
}

/** This function counts the forms of import in a source text that `importsOf` does not read. It leaves out comments. */
export function opaqueImports(source: string): number {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const read = code.replace(/^\s*(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\sfrom\s+)?"[^"]+"/gm, "").replace(/\bimport\("[^"]+"\)/g, "");
  return [...read.matchAll(/^\s*import\b(?!\.meta)|\bimport\(|\brequire\(|\bnew Worker\(/gm)].length;
}

/**
 * This function walks the imports from the start files, and gives each file and each package that they reach.
 * It throws an error for a file that does not exist, and for an unknown form of import.
 */
export function importClosure(root: string, starts: readonly string[], known: Readonly<Record<string, number>> = {}): Closure {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const stack = starts.map((start) => resolve(root, start));
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    if (!existsSync(file)) throw new Error(`The walk found no file ${file}.`);
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const opaque = opaqueImports(source);
    if (opaque !== (known[relative(root, file).replaceAll("\\", "/")] ?? 0)) throw new Error(`The file ${file} has ${opaque} imports that the walk cannot read.`);
    for (const target of importsOf(source)) {
      if (target.startsWith(".")) stack.push(resolve(dirname(file), target));
      else if (!target.startsWith("node:")) packages.add(target);
    }
  }
  return { files: [...seen].map((file) => relative(root, file).replaceAll("\\", "/")).sort(), packages: [...packages].sort() };
}

/** This function gives the patterns of the gate, one for each file that it is about. A walk that fails gives `**`, so the gate runs. */
export function gatePaths(root: string = ROOT): string[] {
  try {
    const { files, packages } = importClosure(root, STARTS, KNOWN_OPAQUE);
    return [...files, ...OTHER_PATHS, ...(packages.length > 0 ? [LOCK] : [])];
  } catch (error) {
    console.error(`The walk failed, so the gate runs: ${String(error)}`);
    return [ALL_PATHS];
  }
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  console.log(gatePaths().join("\n"));
}
