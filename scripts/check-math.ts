// This script is the ratchet of the transcendental Math calls (XPLAT-HASH). It has no dependencies.
// It counts the references to Math.hypot, atan2, sin, cos, tan, acos, asin, atan, exp, log and pow in each file of packages/*/src.
// It does not count the tests (*.test.ts) or the comments. docs/math-baseline.json holds the counts of each file.
// The check fails when a count goes up, or when a file that is not in the baseline has a call.
// When a count goes down, the check passes and asks for a lower baseline.
// The reason: such a function can give a different last bit on another platform or node version, so a decision must not depend on one.
// Usage: node scripts/check-math.ts [--print | --write]
//   --print writes the baseline of the current counts to stdout, and --write writes it to docs/math-baseline.json.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASELINE = "docs/math-baseline.json";
const NAMES = ["hypot", "atan2", "sin", "cos", "tan", "acos", "asin", "atan", "exp", "log", "pow"];
const CALL = new RegExp(`\\bMath\\s*\\.\\s*(${NAMES.join("|")})\\b`, "g");

/** This function removes the block comments and the line comments of a source text. A "//" right after ":" (a URL) stays. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

/** This function gives the source files under a folder, without the tests. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(e) && !/\.(test|spec)\.[a-z]+$/.test(e) && !e.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const counts: Record<string, number> = {};
let scanned = 0;
for (const pkg of readdirSync("packages").sort()) {
  const src = join("packages", pkg, "src");
  let isDir = false;
  try {
    isDir = statSync(src).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) continue;
  for (const file of sources(src)) {
    scanned++;
    const n = (stripComments(readFileSync(file, "utf8")).match(CALL) ?? []).length;
    if (n > 0) counts[file.replace(/\\/g, "/")] = n;
  }
}
const total = Object.values(counts).reduce((s, n) => s + n, 0);
// The check fails closed: with no source file, a broken path gives a green check (FAIL-CLOSED).
if (scanned === 0) {
  console.error("check-math: there is no source file in packages/*/src. The check expected at least one.");
  process.exit(1);
}

if (process.argv.includes("--print") || process.argv.includes("--write")) {
  const files = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const text = JSON.stringify({ functions: NAMES, total, files }, null, 2) + "\n";
  if (process.argv.includes("--write")) writeFileSync(BASELINE, text);
  else process.stdout.write(text);
  process.exit(0);
}

const base = (JSON.parse(readFileSync(BASELINE, "utf8")) as { files: Record<string, number> }).files;
const errors: string[] = [];
const lower: string[] = [];
for (const [file, n] of Object.entries(counts)) {
  const b = base[file];
  if (b === undefined) errors.push(`${file} has ${n} transcendental Math calls, and it is not in the baseline.`);
  else if (n > b) errors.push(`${file} has ${n} transcendental Math calls, above its baseline ${b}.`);
  else if (n < b) lower.push(`${file}: ${n}, below its baseline ${b}.`);
}
for (const [file, b] of Object.entries(base)) if (!(file in counts)) lower.push(`${file}: 0, below its baseline ${b}.`);

if (errors.length > 0) {
  for (const e of errors) console.error(`check-math: ${e}`);
  console.error("check-math: a transcendental function can give a different last bit on another platform. Do not let a decision depend on one.");
  console.error(`check-math: use exact arithmetic (a cross product, a dot product, a squared length), or give the reason in the pull request and raise ${BASELINE}.`);
  process.exit(1);
}
for (const l of lower) console.log(`check-math: ${l} Lower the baseline with "node scripts/check-math.ts --write".`);
console.log(`check-math: ${total} transcendental Math calls in ${Object.keys(counts).length} files, at or below ${BASELINE}.`);
