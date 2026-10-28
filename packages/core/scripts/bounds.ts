// The command line of the bounds of the gap closed (EXACT-BOUNDS): `pnpm bounds --records <path,...> [--optima <file,...>] [--out bounds.md] [--json bounds.json]`.
// The script reads the records of the workflow `Screen` on `exact-v1` and `exact-v1-bounds`, and the files of the optima of both sets.
// For each size, rule and cap, it gives the interval of the gap closed of each strategy, and the first 5 strategies by the median of the midpoint.
// The script reads only records, so it runs locally in a few seconds. The screens and the solves run in CI.
// The test `src/bench/screen/bounds.test.ts` examines the functions of this file and of `src/bench/screen/bounds.ts`.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { quantile } from "../src/bench/measures/stats.ts";
import { boundsCells, topOf, type BoundsCell, type BoundsRun } from "../src/bench/screen/bounds.ts";
import { GAP_CAPS, GAP_RULES, gapCap, type ExactOptimaFile, type ExactOptimum, type GapRule } from "../src/bench/screen/gap.ts";
import { B1, MIXED, readRecords, type OracleRecord } from "./oracle.ts";
import { MODEL_STRETCH } from "./portfolio.ts";

/** The limit of the median width of the top 5. At this width or more, the intervals of the top 5 do not give a strict ranking (prediction 2). */
export const RANK_WIDTH = 0.3;

/** This function gives the runs of each input from the records. A skipped run, and a run without B1 or the stretch of the model, are not in the table. */
export function boundsRuns(records: readonly OracleRecord[]): Map<string, Map<string, BoundsRun>> {
  const out = new Map<string, Map<string, BoundsRun>>();
  for (const r of records) {
    const b1 = r.measures[B1];
    const stretch = r.measures[MODEL_STRETCH];
    if (r.skipped !== undefined || b1 === undefined || stretch === undefined || !Number.isFinite(b1)) continue;
    if (!out.has(r.input)) out.set(r.input, new Map());
    out.get(r.input)!.set(r.strategy, { b1, stretch, mixed: r.measures[MIXED] === 1 });
  }
  return out;
}

/** The check of a claim of the prediction. */
export interface Claim {
  readonly id: number;
  readonly text: string;
  readonly verdict: "met" | "not met" | "partly met" | "no data";
  readonly note: string;
}

const f3 = (v: number): string => (Number.isNaN(v) ? "-" : v.toFixed(3));
const code = (s: string): string => `\`${s}\``;

/** This function gives the cell of a size, a rule and a cap. */
const cellOf = (cells: readonly BoundsCell[], nodes: number, rule: GapRule, cap: number): BoundsCell | undefined =>
  cells.find((c) => c.nodes === nodes && c.rule === rule && c.cap === cap);

/** This function gives the median width of the first 5 strategies of a cell. */
export function topWidth(cell: BoundsCell): number {
  return quantile(
    topOf(cell).map((r) => r.width),
    0.5,
  );
}

/**
 * This function checks the claims 1 to 3 of the prediction of EXACT-BOUNDS on the cells.
 * 1. At 18 and 24 nodes, the first 5 are the first 5 at 10 nodes, in any order. 2. At 40 nodes, the median width of the first 5 is `RANK_WIDTH` or more.
 * 3. Under the rule `all`, a form of `growth` is first at each size where the intervals rank (the median width of the first 5 is below `RANK_WIDTH`).
 */
export function checkClaims(cells: readonly BoundsCell[]): Claim[] {
  const forms = GAP_RULES.flatMap((rule) => GAP_CAPS.map((cap) => ({ rule, cap })));
  const names = (c: BoundsCell | undefined): string[] => (c === undefined ? [] : topOf(c).map((r) => r.strategy));
  const same: string[] = [];
  const differ: string[] = [];
  for (const { rule, cap } of forms)
    for (const n of [18, 24]) {
      const base = names(cellOf(cells, 10, rule, cap));
      const at = names(cellOf(cells, n, rule, cap));
      if (base.length === 0 || at.length === 0) continue;
      const shared = at.filter((s) => base.includes(s)).length;
      (shared === base.length && at.length === base.length ? same : differ).push(`${n} nodes, ${rule} ${cap}: ${shared} of ${base.length}`);
    }
  const wide = forms.flatMap(({ rule, cap }) => {
    const c = cellOf(cells, 40, rule, cap);
    return c === undefined || topOf(c).length === 0 ? [] : [{ rule, cap, w: topWidth(c) }];
  });
  const growth: string[] = [];
  const notGrowth: string[] = [];
  for (const c of cells.filter((x) => x.rule === "all")) {
    const top = topOf(c);
    if (top.length === 0 || !(topWidth(c) < RANK_WIDTH)) continue;
    (top[0]!.strategy.includes("growth") ? growth : notGrowth).push(`${c.nodes} nodes, cap ${c.cap}: ${top[0]!.strategy}`);
  }
  const verdict = (yes: number, no: number): Claim["verdict"] => (yes + no === 0 ? "no data" : no === 0 ? "met" : yes === 0 ? "not met" : "partly met");
  return [
    {
      id: 1,
      text: "At 18 and 24 nodes, the first 5 are the first 5 at 10 nodes, in any order.",
      verdict: verdict(same.length, differ.length),
      note: `The same: ${same.length}. Not the same: ${differ.join("; ") || "none"}.`,
    },
    {
      id: 2,
      text: `At 40 nodes, the median width of the first 5 is ${RANK_WIDTH} or more.`,
      verdict: verdict(wide.filter((x) => x.w >= RANK_WIDTH).length, wide.filter((x) => !(x.w >= RANK_WIDTH)).length),
      note: wide.map((x) => `${x.rule} ${x.cap}: ${f3(x.w)}`).join("; "),
    },
    {
      id: 3,
      text: "Under the rule `all`, a form of `growth` is first at each size where the intervals rank.",
      verdict: verdict(growth.length, notGrowth.length),
      note: `First: ${growth.join("; ") || "none"}. Not first: ${notGrowth.join("; ") || "none"}.`,
    },
  ];
}

/**
 * This function counts the runs of `exact-v1` where the gap closed of the screen and the gap closed of the bounds agree.
 * At a proven optimum, the interval has a width of 0, and its value at the cap of the run is the value of the screen.
 */
export function agreement(records: readonly OracleRecord[], optima: readonly ExactOptimum[]): { readonly runs: number; readonly agree: number } {
  const runs = boundsRuns(records);
  const opt = new Map(optima.filter((o) => o.proven).map((o) => [`${o.input}|${o.rule}|${o.cap}`, o]));
  let n = 0;
  let agree = 0;
  for (const r of records) {
    const run = runs.get(r.input)?.get(r.strategy);
    if (run === undefined) continue;
    const cap = gapCap(run.stretch);
    for (const rule of GAP_RULES) {
      const screenValue = r.measures[`route.bundle.gap-closed.${rule}`];
      const o = cap === undefined ? undefined : opt.get(`${r.input}|${rule}|${cap}`);
      if (screenValue === undefined || o === undefined || o.b1 === null) continue;
      const base = runs.get(r.input)?.get(rule === "all" ? "hw:shared-ways-all" : "shared");
      if (base === undefined) continue;
      n++;
      const mine = (run.b1 - base.b1) / (o.b1 - base.b1);
      if (Math.abs(mine - screenValue) <= 1e-6) agree++;
    }
  }
  return { runs: n, agree };
}

/** This function writes the tables of the bounds as Markdown. */
export function boundsReport(records: readonly OracleRecord[], optima: readonly ExactOptimum[]): { readonly markdown: string; readonly data: Record<string, unknown> } {
  const cells = boundsCells(boundsRuns(records), optima);
  const sizes = [...new Set(cells.map((c) => c.nodes))].sort((a, b) => a - b);
  const lines: string[] = [
    "## The solves by size, rule and cap",
    "",
    "| nodes | rule | cap | inputs | proven | bound only | no solution | median width of the optimum B1 |",
    "|---:|---|---:|---:|---:|---:|---:|---:|",
    ...cells.map((c) => `| ${c.nodes} | ${code(c.rule)} | ${c.cap} | ${c.inputs} | ${c.proven} | ${c.bounded} | ${c.none} | ${f3(c.optimumWidth)} |`),
    "",
    "## The first 5 strategies by size, rule and cap",
    "",
    "Each cell gives the first 5 strategies by the median of the midpoint of the interval of the gap closed, with the median midpoint. The last column of each size gives the median width of the 5.",
    "",
  ];
  for (const rule of GAP_RULES)
    for (const cap of GAP_CAPS) {
      lines.push(`### The rule ${code(rule)} at the cap ${cap}`, "", "| rank | " + sizes.map((n) => `${n} nodes`).join(" | ") + " |", `|---:|${sizes.map(() => "---").join("|")}|`);
      const tops = sizes.map((n) => {
        const c = cellOf(cells, n, rule, cap);
        return c === undefined ? [] : topOf(c);
      });
      for (let k = 0; k < 5; k++) lines.push(`| ${k + 1} | ${tops.map((t) => (t[k] === undefined ? "-" : `${code(t[k]!.strategy)} ${f3(t[k]!.mid)} (${f3(t[k]!.lo)} to ${f3(t[k]!.hi)})`)).join(" | ")} |`);
      lines.push(
        `| width | ${sizes
          .map((n) => {
            const c = cellOf(cells, n, rule, cap);
            return c === undefined ? "-" : f3(topWidth(c));
          })
          .join(" | ")} |`,
        `| values | ${tops.map((t) => (t.length === 0 ? "-" : t.map((r) => `${r.values}/${r.inputs}`).join(", "))).join(" | ")} |`,
        "",
      );
    }
  const claims = checkClaims(cells);
  const exact = records.filter((r) => r.input.startsWith("exact-v1/"));
  const check = agreement(exact, optima);
  lines.push(
    "## The check of the prediction",
    "",
    "| claim | verdict | note |",
    "|---|---|---|",
    ...claims.map((c) => `| ${c.id}. ${c.text} | ${c.verdict} | ${c.note} |`),
    "",
    `At 10 nodes, the gap closed of the bounds agrees with the gap closed of the screen on ${check.agree} of ${check.runs} runs.`,
    "",
  );
  return { markdown: lines.join("\n"), data: { cells: cells.map((c) => ({ ...c, rows: c.rows.filter((r) => r.values > 0) })), claims, agreement: check } };
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const paths = (name: string): string[] => (opt(name) ?? "").split(",").filter((p) => p.length > 0);
  const here = dirname(fileURLToPath(import.meta.url));
  const files = paths("--optima");
  const optimaFiles = files.length > 0 ? files : [join(here, "../src/bench/exact/optima-exact-v1.json"), join(here, "../src/bench/exact/optima-exact-v1-bounds.json")];
  const optima = optimaFiles.flatMap((f) => (JSON.parse(readFileSync(f, "utf8")) as ExactOptimaFile).optima);
  const report = boundsReport(readRecords(paths("--records")), optima);
  writeFileSync(opt("--out") ?? "bounds.md", report.markdown + "\n");
  if (opt("--json")) writeFileSync(opt("--json")!, JSON.stringify(report.data, null, 1));
  console.log(report.markdown);
}
