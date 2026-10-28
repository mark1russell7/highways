// The summary of the workflow `Scale` (ROUTE-SCALE): `node scripts/scale-summary.ts <rows.jsonl>`.
// It reads the rows of `scripts/scale.ts` and prints a Markdown table: the route times, the time of each step and the hashes of each router.
// The script imports no package, so the last job of the workflow runs it with no install.
import { readFileSync } from "node:fs";

interface Row {
  readonly router: string;
  readonly nodes: number;
  readonly edges: number;
  readonly hash: string;
  readonly exact: string;
  readonly same: boolean;
  readonly route: { readonly cold: number; readonly runs: readonly number[]; readonly warmMedian?: number };
  readonly steps: Readonly<Record<string, number>>;
  readonly violations: number;
  readonly env: { readonly node: string; readonly cpu: string };
}

const STEPS = ["checkProperties", "measureQuality", "exactStretches.build", "exactStretches.use", "portfolio.key"] as const;
const file = process.argv[2];
if (file === undefined) {
  console.error("Usage: node scripts/scale-summary.ts <rows.jsonl>");
  process.exit(2);
}
const rows = readFileSync(file, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as Row);
const s = (v: number | undefined): string => (v === undefined ? "" : (v / 1000).toFixed(2));
console.log("## The dense board (ROUTE-SCALE)\n");
if (rows[0] !== undefined) console.log(`${rows[0].nodes} nodes, ${rows[0].edges} edges. Node ${rows[0].env.node}, ${rows[0].env.cpu}. The times are in seconds.\n`);
console.log(`| router | cold | warm median | runs | ${STEPS.join(" | ")} | violations | route hash | exact | same |`);
console.log(`|---|---:|---:|---:|${STEPS.map(() => "---:").join("|")}|---:|---|---|---|`);
for (const r of rows) {
  const steps = STEPS.map((k) => s(r.steps[k])).join(" | ");
  console.log(`| ${r.router} | ${s(r.route.cold)} | ${s(r.route.warmMedian)} | ${r.route.runs.length} | ${steps} | ${r.violations} | \`${r.hash}\` | \`${r.exact}\` | ${r.same ? "yes" : "no"} |`);
}
