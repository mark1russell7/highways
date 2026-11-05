// Probe of ROUTE-TIE, kept on a measure branch. It adds counters of pops and of walk reads to the text of `src/visibility.ts`.
import { registerHooks } from "node:module";

const once = (text: string, from: string, to: string): string => {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`hook: ${n} matches of ${from}`);
  return text.split(from).join(to);
};
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (!url.endsWith("/src/visibility.ts")) return result;
    let s = String(result.source).replace(/\r\n/g, "\n");
    s = once(s, "if (heap.topKey > best + TIE) break;", "if (heap.topKey > best + TIE) break;\n      (globalThis as any).__POP?.(heap.topKey > best);");
    s = once(s, "out.push(here);", "out.push(here);\n      (globalThis as any).__STEP?.();");
    s = once(s, "const m1 = start[at + 1]!;", "const m1 = start[at + 1]!;\n        (globalThis as any).__READS?.(1 + (m1 - m0));");
    return { ...result, source: s };
  },
});
