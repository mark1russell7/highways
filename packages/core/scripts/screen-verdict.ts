// The verdict over families of a screen (SCREEN-WEIGHT): `node scripts/screen-verdict.ts <screen.jsonl> [--default shared] [--json <out.json>]`.
// It reads the records of one artifact of the workflow `Screen`. For each strategy of the step against the default, it gives the verdict of each guard measure.
// The guard measures are the measures of the step in `docs/PROMOTION.md`. The tie is the `minEffect` of the measure, and the level is 0.05.
// The script also gives the old verdict: the mean of the inputs, as the screen gives it today.
import { readFileSync, writeFileSync } from "node:fs";
import { compareMeasure, familyOf, verdict, type FamilyVerdict, type VerdictLabel, type VerdictResult } from "@mark1russell7/layout-contract";
import { parseLines, type LayoutRecord } from "../src/bench/screen/forms.ts";
import { measureByName } from "../src/bench/screen/measures.ts";
import { familyCell, SCREEN_FAMILY_BY } from "../src/bench/screen/set.ts";

/** The significance level of each verdict. */
const LEVEL = 0.05;

/**
 * The guard measures of each step of `docs/PROMOTION.md`, by their names in a record.
 * A guard with a quantile or a limit, for example `R5` q0.95, uses the measure of that quantile or limit of each input.
 */
const GUARDS: Readonly<Record<string, readonly { readonly id: string; readonly name: string }[]>> = {
  router: [
    { id: "R1", name: "route.crossings" },
    { id: "R4", name: "route.turn.mean" },
    { id: "R5 q0.95", name: "route.detour.q95" },
    { id: "R11 min", name: "route.plug-spacing.min" },
    { id: "B1", name: "route.bundle.ink-saved" },
  ],
  highway: [
    { id: "R1", name: "route.crossings" },
    { id: "B1", name: "route.bundle.ink-saved" },
    { id: "B3 q0.95", name: "route.bundle.stretch.q95" },
    { id: "B6 max", name: "route.bundle.merge-angle.max" },
  ],
};

/** The breadth of a verdict: the families against its side, all the families and the ties. Version 0.2.12 of the contract gives it in the result. */
interface Breadth {
  readonly against: number;
  readonly of: number;
  readonly ties: number;
}

/** One verdict of a strategy on a guard measure. */
interface GuardVerdict {
  readonly strategy: string;
  readonly guard: string;
  readonly measure: string;
  readonly label: VerdictLabel;
  /** The sign of the mean of the inputs with the tie: the old verdict of the screen. */
  readonly old: "better" | "worse" | "tie";
  readonly stratified: number;
  readonly pooled: number;
  readonly p: number;
  readonly families: readonly FamilyVerdict[];
  readonly breadth: Breadth;
}

/** This function gives the breadth of a verdict from its families, with the rule of `docs/VERDICT.md` of the contract. */
function breadthOf(v: VerdictResult): Breadth {
  const own = (v as { readonly breadth?: Breadth }).breadth;
  if (own !== undefined) return own;
  const side = v.label === "better" ? 1 : v.label === "worse" ? -1 : Math.sign(v.stratified.mean);
  const ties = v.families.filter((f) => f.sign === 0).length;
  return { against: side === 0 ? 0 : v.families.filter((f) => f.sign === -side).length, of: v.families.length, ties };
}

/** This function gives the family of a record from its input id `<set>/<family>/s<seed>`, with the key `familyBy` of the manifest. */
function familyOfRecord(r: LayoutRecord): string {
  const family = r.input.split("/")[1];
  if (family === undefined) throw new Error(`The input id "${r.input}" has no family.`);
  return familyOf(familyCell({ family }), SCREEN_FAMILY_BY);
}

const mean = (values: readonly number[]): number => values.reduce((s, v) => s + v, 0) / values.length;

/** This function gives the step of a screen. The screen of the step `highway` also has the records of the base routers, so a step other than `router` wins. */
function stepOf(records: readonly LayoutRecord[]): string {
  const steps = new Set(records.map((r) => r.step));
  return [...steps].find((s) => s !== "router") ?? "router";
}

/** This function gives the verdicts of each strategy of the step against the strategy `base`, on each guard measure of the step. */
function screenVerdicts(records: readonly LayoutRecord[], base: string): GuardVerdict[] {
  const step = stepOf(records);
  const guards = GUARDS[step];
  if (guards === undefined) throw new Error(`The step "${step}" has no guard measures in this script.`);
  const strategies = [...new Set(records.filter((r) => r.step === step).map((r) => r.strategy))].filter((s) => s !== base);
  const out: GuardVerdict[] = [];
  for (const strategy of strategies) {
    const pair = records.filter((r) => r.strategy === strategy || r.strategy === base);
    for (const guard of guards) {
      const info = measureByName(guard.name);
      if (info === undefined) throw new Error(`The measure ${guard.name} is not in MEASURES.`);
      const tie = info.minEffect ?? 0;
      const v = verdict(pair, { by: "family", family: familyOfRecord, measure: { id: guard.name, direction: info.better }, a: base, b: strategy, tie, level: LEVEL });
      const values = (s: string): number[] => pair.filter((r) => r.strategy === s && r.skipped === undefined && r.measures[guard.name] !== undefined).map((r) => r.measures[guard.name]!);
      const old = compareMeasure(mean(values(strategy)), mean(values(base)), { direction: info.better, minEffect: tie });
      out.push({ strategy, guard: guard.id, measure: guard.name, label: v.label, old, stratified: v.stratified.mean, pooled: v.pooled.mean, p: v.permutation.p, families: v.families, breadth: breadthOf(v) });
    }
  }
  return out;
}

const SIGN = { 1: "+", 0: "0", [-1]: "−" } as const;
const f3 = (v: number): string => (Math.abs(v) < 5e-4 ? "0" : v.toFixed(3));

function main(): void {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const file = args[0];
  if (file === undefined || file.startsWith("--")) {
    console.error("Usage: node scripts/screen-verdict.ts <screen.jsonl> [--default shared] [--json <out.json>]");
    process.exit(2);
  }
  const base = opt("--default") ?? "shared";
  const records = parseLines<LayoutRecord>(readFileSync(file, "utf8"));
  const rows = screenVerdicts(records, base);
  const json = opt("--json");
  const step = stepOf(records);
  if (json !== undefined) writeFileSync(json, JSON.stringify({ set: records[0]?.set, step, base, level: LEVEL, rows }, null, 2) + "\n");
  const families = rows[0]?.families.map((f) => f.family) ?? [];
  console.log(`## The verdicts of the step \`${step}\` on \`${records[0]?.set}\` against \`${base}\`\n`);
  console.log(`The level is ${LEVEL}. The families: ${families.map((f) => `\`${f}\``).join(", ")}. A positive mean tells that the strategy is better.\n`);
  console.log("| strategy | guard | label | old | stratified | pooled | p | family signs | against |");
  console.log("|---|---|---|---|---:|---:|---:|---|---:|");
  for (const r of rows) {
    const signs = r.families.map((f) => SIGN[f.sign]).join(" ");
    const against = `${r.breadth.against} of ${r.breadth.of}${r.breadth.ties > 0 ? ` (${r.breadth.ties} ${r.breadth.ties === 1 ? "tie" : "ties"})` : ""}`;
    console.log(`| ${r.strategy} | ${r.guard} | ${r.label} | ${r.old} | ${f3(r.stratified)} | ${f3(r.pooled)} | ${r.p.toFixed(4)} | ${signs} | ${against} |`);
  }
}

main();
