// Probe of ROUTE-TIE, kept on a measure branch. It adds a read of each cost gap to `#search`, and a factor of the search floor.
import { registerHooks } from "node:module";
const once = (text: string, from: string | RegExp, to: string): string => {
  const n = typeof from === "string" ? text.split(from).length - 1 : (text.match(new RegExp(from, "g")) ?? []).length;
  if (n !== 1) throw new Error(`hook: ${n} matches of ${String(from)}`);
  return text.replace(from, to);
};
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (!url.endsWith("/src/visibility.ts")) return result;
    let s = String(result.source);
    s = once(s, /count: number,(\r?\n)  \): Among \| undefined \{/, `count: number,$1  ): Among | undefined {$1    floor *= (globalThis as any).__FLOOR ?? 1;`);
    s = once(s, "const shut = closed[j] === stamp;", `const shut = closed[j] === stamp;\n        if (open[j] === stamp) (globalThis as any).__BAND?.(0, gi + (cost ? cost(i, j, d) : d) - G[j]!);`);
    s = once(s, "const end = gi + goalTail[i]!;", `const end = gi + goalTail[i]!;\n        if (best !== Infinity) (globalThis as any).__BAND?.(1, end - best);`);
    return { ...result, source: s };
  },
});
