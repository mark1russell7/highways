// The summary of the sizes of the workflow `Scale` (ROUTER-BUDGET): `node scripts/scale-sizes.ts <rows.jsonl> [budget minutes]`.
// It reads the rows of `scripts/scale.ts --nodes`, and the rows that the workflow writes for a route over the time limit.
// For each router and size, it prints the median route time, the A/A ratio of the arms `a` and `b`, and the routes over the limit.
// The order of growth of each doubling of the size is log2 of the ratio of the medians. A size with a route over the limit has no median.
// The budget (default 5 minutes) marks each size with a median over it. The row of the arm `fixture` is the dense packed board.
import { readFileSync } from "node:fs";
import { median } from "@mark1russell7/rigor-statistics";

interface Row {
  readonly router: string;
  readonly nodes: number;
  readonly edges?: number;
  readonly manifestId?: string | null;
  readonly round?: number;
  readonly arm?: string;
  readonly over?: boolean;
  readonly skipped?: boolean;
  readonly capMinutes?: number;
  readonly route?: { readonly cold: number };
  readonly env?: { readonly node: string; readonly cpu: string };
}

const file = process.argv[2];
if (file === undefined) {
  console.error("Usage: node scripts/scale-sizes.ts <rows.jsonl> [budget minutes]");
  process.exit(2);
}
const budget = Number(process.argv[3] ?? "5") * 60_000;
const rows = readFileSync(file, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as Row);
const sec = (t: number | undefined): string => (t === undefined ? "" : (t / 1000).toFixed(2));
const env = rows.find((r) => r.env !== undefined)?.env;

console.log("## The route time at each size (ROUTER-BUDGET)\n");
if (env !== undefined) console.log(`Node ${env.node}, ${env.cpu}. The times are in seconds. The budget is ${budget / 60_000} minutes for each route.\n`);
console.log("| router | board | nodes | edges | routes | median | A/A b÷a | over the limit | over the budget | growth exponent |");
console.log("|---|---|---:|---:|---:|---:|---:|---:|---|---:|");
for (const router of [...new Set(rows.map((r) => r.router))].sort()) {
  const own = rows.filter((r) => r.router === router);
  let last: { nodes: number; median: number } | undefined;
  for (const board of ["size", "fixture"] as const) {
    const set = own.filter((r) => (r.arm === "fixture") === (board === "fixture"));
    for (const nodes of [...new Set(set.map((r) => r.nodes))].sort((a, b) => a - b)) {
      const at = set.filter((r) => r.nodes === nodes);
      const timed = at.filter((r) => r.over !== true && r.route !== undefined);
      const over = at.length - timed.length;
      // A size with a route over the limit has no median: the true median is not known.
      const m = over === 0 && timed.length > 0 ? median(timed.map((r) => r.route!.cold)) : undefined;
      const ratios = [...new Set(timed.map((r) => r.round))].flatMap((round) => {
        const a = timed.find((r) => r.round === round && r.arm === "a");
        const b = timed.find((r) => r.round === round && r.arm === "b");
        return a !== undefined && b !== undefined && a.route!.cold > 0 ? [b.route!.cold / a.route!.cold] : [];
      });
      const aa = ratios.length > 0 ? median(ratios).toFixed(3) : "";
      const overBudget = m === undefined ? (over > 0 ? `yes, ${over} over the limit of ${at[0]!.capMinutes ?? "?"} min` : "") : m > budget ? "yes" : "no";
      let exponent = "";
      if (board === "size" && m !== undefined && last !== undefined && m > 0 && last.median > 0) exponent = (Math.log2(m / last.median) / Math.log2(nodes / last.nodes)).toFixed(2);
      if (board === "size") last = m === undefined ? undefined : { nodes, median: m };
      const edges = at.find((r) => r.edges !== undefined)?.edges ?? "";
      console.log(`| ${router} | ${board === "fixture" ? (at[0]!.manifestId ?? "fixture") : "uniform"} | ${nodes} | ${edges} | ${timed.length} | ${sec(m)} | ${aa} | ${over} | ${overBudget} | ${exponent} |`);
    }
  }
}
