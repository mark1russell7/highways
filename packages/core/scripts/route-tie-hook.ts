/**
 * This module gives an arm of the record `route-tie/1` its own text of `src/visibility.ts`, so the source holds no switch for a record (ROUTE-TIE).
 * The script `route-tie.ts` starts each arm in a child with `--import` of this module. With no variable `ROUTE_TIE_HOOK`, the module changes nothing.
 */
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

/** The text of an arm: the distance of a tie, the factor of the search floor and the file of the old source. */
export interface PatchOptions {
  readonly tie?: string;
  readonly floor?: string;
  /** The key of the walk: `index` sets `STRAIGHT` to `false`. */
  readonly key?: "index" | "straight";
}

/** This function replaces one text that occurs once. A text that does not occur once throws an error, so an arm does not run on another search. */
function once(text: string, from: string | RegExp, to: string): string {
  const count = typeof from === "string" ? text.split(from).length - 1 : (text.match(new RegExp(from, "g")) ?? []).length;
  if (count !== 1) throw new Error(`The hook of route-tie finds ${count} matches of ${String(from)} in visibility.ts.`);
  return text.replace(from, to);
}

/**
 * This function gives the text of `visibility.ts` for one arm.
 * The option `tie` sets the distance of a tie. The option `floor` multiplies the search floor at the start of the search of the corner graph.
 */
export function patchVisibility(text: string, options: PatchOptions): string {
  let out = text;
  if (options.tie !== undefined) out = once(out, "const TIE = 1e-9;", `const TIE = ${options.tie};`);
  if (options.floor !== undefined) out = once(out, /count: number,(\r?\n)  \): Among \| undefined \{/, `count: number,$1  ): Among | undefined {$1    floor *= ${options.floor};`);
  if (options.key === "index") out = once(out, "const STRAIGHT = true;", "const STRAIGHT = false;");
  return out;
}

if (process.env["ROUTE_TIE_HOOK"] === "1") {
  const before = process.env["ROUTE_TIE_BEFORE"];
  const tie = process.env["ROUTE_TIE_TIE"];
  const floor = process.env["ROUTE_TIE_FLOOR"];
  const key = process.env["ROUTE_TIE_KEY"] === "index" ? ("index" as const) : undefined;
  registerHooks({
    load(url, context, next) {
      const result = next(url, context);
      if (!url.endsWith("/src/visibility.ts")) return result;
      const source = before === undefined ? String(result.source) : readFileSync(before, "utf8");
      return { ...result, source: patchVisibility(source, { ...(tie === undefined ? {} : { tie }), ...(floor === undefined ? {} : { floor }), ...(key === undefined ? {} : { key }) }) };
    },
  });
}
