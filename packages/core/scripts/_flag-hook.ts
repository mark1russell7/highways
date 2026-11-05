// Probe of ROUTE-TIE, kept on a measure branch. It gives an arm its text of `src/visibility.ts`, a factor of the search floor, counters of the walk and a fault of the mark.
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

const once = (text: string, from: string, to: string): string => {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`hook: ${n} matches of ${from}`);
  return text.split(from).join(to);
};
const FAULTS: Record<string, [string, string]> = {
  // No mark on a lower value that arrives within the slack.
  improve: ["(shut || gap >= -TIE_MARK)", "(shut || gap >= 0)"],
  // No mark from a link into a closed corner.
  closed: ["if (gap <= TIE_MARK && (shut || gap >= -TIE_MARK)) tied[j] = stamp;", "if (gap <= TIE_MARK && !shut && gap >= -TIE_MARK) tied[j] = stamp;"],
  // No mark on two starts that tie.
  seed: ["if (Math.abs(g - G[j]!) <= TIE_MARK) tied[j] = stamp;", ""],
  // A slack far under the tie.
  narrow: ["const TIE_MARK = 2 * TIE;", "const TIE_MARK = TIE / 100;"],
};
const source = process.env["ANCHOR_SOURCE"];
const fault = process.env["FLAG_FAULT"];
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (!url.endsWith("/src/visibility.ts")) return result;
    let s = (source === undefined ? String(result.source) : readFileSync(source, "utf8")).replace(/\r\n/g, "\n");
    s = once(s, "count: number,\n  ): Among | undefined {", "count: number,\n  ): Among | undefined {\n    floor *= (globalThis as any).__FLOOR ?? 1;");
    s = once(s, "if (heap.topKey > best + TIE) break;", "if (heap.topKey > best + TIE) break;\n      (globalThis as any).__POP?.();");
    s = once(s, "out.push(here);", "out.push(here);\n      (globalThis as any).__STEP?.();");
    s = once(s, "const m1 = start[at + 1]!;", "const m1 = start[at + 1]!;\n        (globalThis as any).__READS?.(1 + (m1 - m0));");
    if (s.includes("const shut = ")) s = once(s, "const c = cost ? cost(i, j, d) : d;", "if (shut) (globalThis as any).__SHUT?.(); const c = cost ? cost(i, j, d) : d;");
    if (fault) {
      const [from, to] = FAULTS[fault]!;
      s = once(s, from, to);
    }
    return { ...result, source: s };
  },
});
