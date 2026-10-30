// The input check of each gate (FAIL-CLOSED). A gate that gets no input, or fewer inputs than its plan, must fail, and it must name the inputs that are missing.
// Without this check, a failed download or a step that wrote nothing gives a green gate.
// This module imports only node modules and knows no type of highways, so a job with no installed packages can start it.
// Usage as a command: node scripts/gates/inputs.ts <name> --expect <list> --got <list>, or <name> --expect-count <n> --got-count <n>
//   A list has commas or spaces between its items. The command exits 1 when the inputs differ.
import { fileURLToPath } from "node:url";

/** The difference between the inputs that a gate expects and the inputs that it got. */
export interface InputDiff {
  readonly missing: readonly string[];
  readonly extra: readonly string[];
}

/** This function gives the expected items that are not in `got`, and the items of `got` that are not expected. */
export function diffInputs(expected: readonly string[], got: readonly string[]): InputDiff {
  const want = new Set(expected);
  const have = new Set(got);
  return { missing: [...want].filter((x) => !have.has(x)), extra: [...have].filter((x) => !want.has(x)) };
}

/** The error of a gate whose inputs differ from its plan. */
export class InputError extends Error {
  override readonly name = "InputError";
}

const shown = (xs: readonly string[]): string => (xs.length <= 12 ? xs.join(", ") : `${xs.slice(0, 12).join(", ")} and ${xs.length - 12} more`);

/**
 * This function throws an `InputError` when a gate does not get exactly the inputs of its plan.
 * With two lists, each expected item must be in `got`, and `got` must have no other item.
 * With two counts, `got` must equal `expected`. An expected list or count of 0 is also an error, because a test over no input proves nothing.
 */
export function requireInputs(name: string, expected: readonly string[], got: readonly string[]): void;
export function requireInputs(name: string, expected: number, got: number): void;
export function requireInputs(name: string, expected: readonly string[] | number, got: readonly string[] | number): void {
  if (typeof expected === "number" || typeof got === "number") {
    if (typeof expected !== "number" || typeof got !== "number") throw new TypeError("requireInputs takes two lists or two counts.");
    if (!Number.isInteger(expected) || expected <= 0) throw new InputError(`${name}: the plan expects ${expected} inputs. A gate needs 1 or more.`);
    if (got !== expected) throw new InputError(`${name}: the gate expected ${expected} inputs and got ${got}.`);
    return;
  }
  if (expected.length === 0) throw new InputError(`${name}: the plan expects no input. A gate needs 1 or more.`);
  const { missing, extra } = diffInputs(expected, got);
  if (missing.length === 0 && extra.length === 0) return;
  const parts = [`${name}: the gate expected ${new Set(expected).size} inputs and got ${new Set(got).size}.`];
  if (missing.length > 0) parts.push(`Missing: ${shown(missing)}.`);
  if (extra.length > 0) parts.push(`Not in the plan: ${shown(extra)}.`);
  throw new InputError(parts.join(" "));
}

/**
 * This function throws an `InputError` when the records do not fill the grid of strategies and inputs: each strategy needs a record on each input of the records.
 * A record that a strategy skipped still has its strategy and its input, so it counts. No record is also an error.
 */
export function requireGrid(name: string, records: readonly { readonly strategy: string; readonly input: string }[]): void {
  if (records.length === 0) throw new InputError(`${name}: there is no record. A gate needs 1 or more.`);
  const inputs = [...new Set(records.map((r) => r.input))];
  const by = new Map<string, string[]>();
  for (const r of records) {
    const list = by.get(r.strategy);
    if (list) list.push(r.input);
    else by.set(r.strategy, [r.input]);
  }
  for (const [strategy, got] of by) requireInputs(`${name}, the strategy ${strategy}`, inputs, got);
}

/** This function reads a list of the command line: the items have commas or spaces between them. */
export function parseList(text: string): string[] {
  return text.split(/[\s,]+/).filter((x) => x.length > 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (key: string): string | undefined => {
    const i = args.indexOf(key);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const name = args[0];
  const [expect, got, count] = opt("--expect-count") !== undefined ? [opt("--expect-count"), opt("--got-count"), true] : [opt("--expect"), opt("--got"), false];
  if (name === undefined || name.startsWith("--") || expect === undefined || got === undefined) {
    console.error("Usage: node scripts/gates/inputs.ts <name> --expect <list> --got <list>, or <name> --expect-count <n> --got-count <n>");
    process.exit(2);
  }
  try {
    // A count that is not a whole number is NaN, and NaN is not equal to the plan.
    if (count) requireInputs(name, Number(expect.trim() || "0"), Number(got.trim() || "0"));
    else requireInputs(name, parseList(expect), parseList(got));
  } catch (error) {
    console.error(`::error::${(error as Error).message}`);
    process.exit(1);
  }
  console.log(`${name}: ${count ? expect.trim() : parseList(expect).length} inputs, as the plan expects.`);
}
