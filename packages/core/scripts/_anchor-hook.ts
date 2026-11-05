// Probe of ROUTE-TIE, kept on a measure branch. It gives an arm its text of `src/visibility.ts`, a factor of the search floor and reads of the walk.
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
const once = (text: string, from: string | RegExp, to: string): string => {
  const n = typeof from === "string" ? text.split(from).length - 1 : (text.match(new RegExp(from, "g")) ?? []).length;
  if (n !== 1) throw new Error(`hook: ${n} matches of ${String(from)}`);
  return typeof from === "string" ? text.split(from).join(to) : text.replace(from, to);
};
const old = process.env["ANCHOR_SOURCE"];
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (!url.endsWith("/src/visibility.ts")) return result;
    let s = old === undefined ? String(result.source) : readFileSync(old, "utf8");
    s = s.replace(/\r\n/g, "\n");
    s = once(s, /count: number,\n  \): Among \| undefined \{/, "count: number,\n  ): Among | undefined {\n    floor *= (globalThis as any).__FLOOR ?? 1;");
    if (old === undefined) {
      s = once(s, "const limit = best + TIE;", "const limit = best + TIE;\n    (globalThis as any).__LIMIT?.(best, start, next, length);");
      s = once(s, "out.push(here);", "out.push(here);\n      (globalThis as any).__WALK?.(at);");
      s = once(s, "const parent = parentOf[at]!;", "const parent = parentOf[at]!;\n          (globalThis as any).__FALLBACK?.(at);");
    }
    // A fault copy for the flip of the loop: the walk may step to a corner with an equal G.
    if (process.env["ANCHOR_FAULT"] === "loose") s = once(s, "G[i]! >= G[at]!", "G[i]! > G[at]!");
    return { ...result, source: s };
  },
});
