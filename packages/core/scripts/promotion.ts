// The promotion test of `docs/PROMOTION.md` over the records of screens (PROMO-CANALS).
// Start: `pnpm promotion --candidate canals --baseline shared --step router --corpus a.jsonl,b.jsonl --fresh c.jsonl,d.jsonl [--out promotion.md] [--json promotion.json]`.
// `--corpus` gives the records of the promotion corpus, and `--fresh` the records of the confirmation run. Each file is the `screen.jsonl` of a screen.
// The script applies the win test to each set of records, and the verdict over families to each measure.
// The verdict uses the families of the input ids, and the Holm correction over the measures.
// The literal reading uses all the inputs. The exercised reading uses only the inputs where the candidate changes the output.
// The script reads files and does no layout, so it is a quick local check.
import { readFileSync, writeFileSync } from "node:fs";
import { compareMeasure, mulberry32, verdict, type VerdictResult } from "@mark1russell7/layout-contract";
import { compareSpec, MEASURES, type MeasureInfo } from "../src/bench/screen/measures.ts";
import { parseLines } from "../src/bench/screen/index.ts";

/** The fields of a screen record that the test reads. */
interface Rec {
  readonly strategy: string;
  readonly input: string;
  readonly seed: number;
  readonly measures: Readonly<Record<string, number>>;
  readonly hard?: Readonly<Record<string, number>>;
  readonly deterministic?: boolean;
  readonly ms?: number;
  readonly outputHash?: string;
  readonly moves?: number;
  readonly skipped?: string;
}

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const need = (name: string): string => {
  const v = opt(name);
  if (v === undefined) throw new Error(`The option ${name} is necessary.`);
  return v;
};
const candidate = need("--candidate");
const baseline = need("--baseline");
const step = opt("--step") ?? "router";

// The parameters of `docs/PROMOTION.md`.
const P = { medianWorse: 0.02, tailWorse: 0.1, tailShare: 0.1, gainMin: 0.05, signP: 0.05, bootstrapRuns: 10000, bootstrapLevel: 0.95, timeRatio: 1.5, timeTailQ: 0.95, timeTail: 2.0, timeFloorMs: 5, level: 0.05 };
// The floors of `docs/PROMOTION.md`: the record name, the floor and the tolerance.
const FLOORS: Readonly<Record<string, { floor: number; tol: number }>> = { "route.crossings": { floor: 0, tol: 0 }, "route.bundle.merge-angle.max": { floor: 0, tol: 60 } };
// The guard measures of each step, by the keys of `MEASURES`. The step `whole` has no row, so it takes the guards of each routing step. `Z10.mean` is the stability guard.
const ROUTER_GUARDS = ["R1.crossings", "R4.turn", "R5.q95", "R11.min", "B1.inkSaved", "Z10.mean"];
const GUARDS: Readonly<Record<string, readonly string[]>> = {
  router: ROUTER_GUARDS,
  highway: ["R1.crossings", "B1.inkSaved", "B3.q95", "B6.max", "Z10.mean"],
  whole: [...ROUTER_GUARDS, "B3.q95", "B6.max", "C3.median", "C5.peak", "C8.max"],
};
const guards = (GUARDS[step] ?? ROUTER_GUARDS).map((k) => MEASURES.find((m) => m.key === k)).filter((m): m is MeasureInfo => m !== undefined);

const load = (list: string | undefined): Rec[] =>
  (list ?? "")
    .split(",")
    .filter((f) => f.length > 0)
    .flatMap((f) => parseLines<Rec>(readFileSync(f, "utf8")));

/** The family of an input id `<set>/<family>/s<seed>`. */
const familyOf = (input: string): string => input.split("/")[1] ?? input;

/** One paired input: the records of the candidate and of the baseline. */
interface Pair {
  readonly key: string;
  readonly family: string;
  readonly c: Rec;
  readonly b: Rec;
  readonly exercised: boolean;
}

function pairs(records: readonly Rec[]): Pair[] {
  const key = (r: Rec): string => `${r.input}#${r.seed}`;
  const base = new Map(records.filter((r) => r.strategy === baseline && r.skipped === undefined).map((r) => [key(r), r]));
  return records
    .filter((r) => r.strategy === candidate && r.skipped === undefined && base.has(key(r)))
    .map((c) => {
      const b = base.get(key(c))!;
      return { key: key(c), family: familyOf(c.input), c, b, exercised: (c.moves ?? 0) > 0 || c.outputHash !== b.outputHash };
    });
}

const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const quantile = (xs: readonly number[], q: number): number => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
};

/** This function gives the worse-ratio of a measure on a pair, with the floor rule. A ratio above 1 is worse. `undefined` tells that a value is missing. */
function ratio(m: MeasureInfo, p: Pair): number | undefined {
  const c = p.c.measures[m.name];
  const b = p.b.measures[m.name];
  if (c === undefined || b === undefined || !Number.isFinite(c) || !Number.isFinite(b)) return undefined;
  const floor = FLOORS[m.name];
  if (floor && b === floor.floor) return c - floor.floor <= floor.tol ? 1 : Infinity;
  if (c === b) return 1;
  // For a measure where more is better, the test uses the inverse ratio.
  const [num, den] = m.better === "lower" ? [c, b] : [b, c];
  if (den === 0) return num === 0 ? 1 : Infinity;
  return num / den;
}

const ratios = (m: MeasureInfo, ps: readonly Pair[]): number[] => ps.map((p) => ratio(m, p)).filter((r): r is number => r !== undefined);

/** The one-sided exact sign test: the p of `wins` or more wins in `wins + losses` fair draws. */
function signP(wins: number, losses: number): number {
  const n = wins + losses;
  if (n === 0) return 1;
  let p = 0;
  let c = 1;
  for (let k = 0; k <= n; k++) {
    if (k >= wins) p += c;
    c = (c * (n - k)) / (k + 1);
  }
  return Math.min(1, p / 2 ** n);
}

/** The bootstrap interval of the median of the ratios, from a fixed seed. */
function bootstrap(xs: readonly number[], seed = 1): { lo: number; hi: number } {
  const rand = mulberry32(seed);
  const meds: number[] = [];
  const sample = new Array<number>(xs.length);
  for (let i = 0; i < P.bootstrapRuns; i++) {
    for (let j = 0; j < xs.length; j++) sample[j] = xs[Math.floor(rand() * xs.length)]!;
    meds.push(median(sample));
  }
  const a = (1 - P.bootstrapLevel) / 2;
  return { lo: quantile(meds, a), hi: quantile(meds, 1 - a) };
}

/** This function gives the Holm-adjusted p of each p, in the order of the input. */
function holm(ps: readonly number[]): number[] {
  const order = ps.map((p, i) => [p, i] as const).sort((x, y) => x[0] - y[0]);
  const out = new Array<number>(ps.length);
  let run = 0;
  order.forEach(([p, i], j) => {
    run = Math.max(run, Math.min(1, (ps.length - j) * p));
    out[i] = run;
  });
  return out;
}

interface GuardRow {
  readonly key: string;
  readonly n: number;
  readonly median: number;
  readonly tail: number;
  readonly pass: boolean;
}
interface GainRow {
  readonly key: string;
  readonly n: number;
  readonly median: number;
  readonly wins: number;
  readonly losses: number;
  readonly p: number;
  readonly pHolm: number;
  readonly lo: number;
  readonly hi: number;
  readonly pass: boolean;
}
interface WinTest {
  readonly reading: "literal" | "exercised";
  readonly n: number;
  readonly hard: { readonly pass: boolean; readonly worse: readonly string[] };
  readonly guards: readonly GuardRow[];
  readonly gain: readonly GainRow[];
  readonly time: { readonly median: number; readonly tail: number; readonly pass: boolean };
  readonly pass: boolean;
}

function winTest(ps: readonly Pair[], reading: "literal" | "exercised"): WinTest {
  // The hard rules: each hard count of the candidate is at most that of the default, and two runs give the same output.
  const worse = ps.flatMap((p) => [
    ...Object.entries(p.c.hard ?? {})
      .filter(([rule, n]) => n > (p.b.hard?.[rule] ?? 0))
      .map(([rule]) => `${p.key} ${rule}`),
    ...(p.c.deterministic === false ? [`${p.key} same-twice`] : []),
  ]);
  const guardRows = guards.map((m): GuardRow => {
    const rs = ratios(m, ps);
    const med = median(rs);
    const tail = rs.length === 0 ? 0 : rs.filter((r) => r > 1 + P.tailWorse).length / rs.length;
    return { key: m.key, n: rs.length, median: med, tail, pass: rs.length === 0 || (med <= 1 + P.medianWorse && tail <= P.tailShare) };
  });
  // The gain: each measure with a median ratio of 1 - gainMin or better is a gain candidate. The sign tests of all the measures get the Holm correction.
  const raw = MEASURES.map((m) => {
    const rs = ratios(m, ps);
    const spec = compareSpec(m);
    let wins = 0;
    let losses = 0;
    for (const p of ps) {
      const c = p.c.measures[m.name];
      const b = p.b.measures[m.name];
      if (c === undefined || b === undefined || Number.isNaN(c) || Number.isNaN(b)) continue;
      const k = compareMeasure(c, b, spec);
      if (k === "better") wins++;
      else if (k === "worse") losses++;
    }
    return { m, rs, wins, losses, p: signP(wins, losses) };
  }).filter((x) => x.rs.length > 0);
  const adjusted = holm(raw.map((x) => x.p));
  const gain = raw
    .map((x, i): GainRow | undefined => {
      const med = median(x.rs);
      if (!(med <= 1 - P.gainMin)) return undefined;
      const { lo, hi } = bootstrap(x.rs);
      return { key: x.m.key, n: x.rs.length, median: med, wins: x.wins, losses: x.losses, p: x.p, pHolm: adjusted[i]!, lo, hi, pass: adjusted[i]! < P.signP && hi < 1 };
    })
    .filter((g): g is GainRow => g !== undefined);
  // The time: t / max(b, timeFloorMs / timeRatio).
  const times = ps.filter((p) => p.c.ms !== undefined && p.b.ms !== undefined).map((p) => p.c.ms! / Math.max(p.b.ms!, P.timeFloorMs / P.timeRatio));
  const tMed = median(times);
  const tTail = quantile(times, P.timeTailQ);
  const time = { median: tMed, tail: tTail, pass: times.length === 0 || (tMed <= P.timeRatio && tTail <= P.timeTail) };
  const hardPass = worse.length === 0;
  return {
    reading,
    n: ps.length,
    hard: { pass: hardPass, worse },
    guards: guardRows,
    gain,
    time,
    pass: ps.length > 0 && hardPass && guardRows.every((g) => g.pass) && gain.some((g) => g.pass) && time.pass,
  };
}

interface VerdictRow {
  readonly key: string;
  readonly result: VerdictResult;
  readonly pHolm: number;
  readonly label: string;
}

/** The verdict over families of each measure, with the Holm correction of the permutation p over the measures. */
function verdicts(records: readonly Rec[]): VerdictRow[] {
  const recs = records.filter((r) => r.strategy === candidate || r.strategy === baseline);
  const rows = MEASURES.filter((m) => recs.some((r) => r.measures[m.name] !== undefined)).map((m) => ({
    m,
    result: verdict(recs, { by: "family", family: (r) => familyOf(r.input), measure: { id: m.name, direction: compareSpec(m).direction }, a: baseline, b: candidate, tie: m.minEffect ?? 0, level: P.level, runs: 2000 }),
  }));
  const adjusted = holm(rows.map((r) => r.result.permutation.p));
  return rows.map((r, i) => {
    const res = r.result;
    // After the correction, a verdict counts only when the adjusted p is below the level.
    const label = res.agree && adjusted[i]! >= P.level ? "no verdict (Holm)" : res.label;
    return { key: r.m.key, result: res, pHolm: adjusted[i]!, label };
  });
}

const fmt = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const yes = (b: boolean): string => (b ? "pass" : "fail");

function winText(name: string, t: WinTest, all: number): string {
  const lines = [`#### ${name}: ${t.reading} reading, ${t.n} of ${all} inputs: ${yes(t.pass)}`, ""];
  lines.push(`- Hard rules: ${yes(t.hard.pass)}${t.hard.worse.length > 0 ? ` (${t.hard.worse.length} worse, for example ${t.hard.worse.slice(0, 3).join(", ")})` : ""}.`);
  lines.push(`- Time: median ${fmt(t.time.median, 2)}, q0.95 ${fmt(t.time.tail, 2)}: ${yes(t.time.pass)}.`);
  lines.push("", "| Guard | Inputs | Median ratio | Tail share | Result |", "|---|---|---|---|---|");
  // A guard with no value in the records, for example a curve measure of a step without curves, has no row.
  for (const g of t.guards.filter((x) => x.n > 0)) lines.push(`| \`${g.key}\` | ${g.n} | ${fmt(g.median)} | ${fmt(g.tail, 2)} | ${yes(g.pass)} |`);
  lines.push("", t.gain.length === 0 ? "No measure has a median ratio of 0.95 or better, so the gain test fails." : "| Gain measure | Median ratio | Better | Worse | Sign p | Holm p | Bootstrap | Result |");
  if (t.gain.length > 0) {
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const g of t.gain) lines.push(`| \`${g.key}\` | ${fmt(g.median)} | ${g.wins} | ${g.losses} | ${g.p.toExponential(1)} | ${g.pHolm.toExponential(1)} | ${fmt(g.lo)} to ${fmt(g.hi)} | ${yes(g.pass)} |`);
  }
  return lines.join("\n");
}

function verdictText(rows: readonly VerdictRow[]): string {
  const counted = rows.filter((r) => r.label === "better" || r.label === "worse");
  const lines = [
    `${counted.filter((r) => r.label === "better").length} measures are better and ${counted.filter((r) => r.label === "worse").length} are worse, of ${rows.length}, after the Holm correction.`,
    "",
    "| Measure | Verdict | Stratified mean | Pooled mean | Holm p | For | Against | Tie |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    const f = r.result.families;
    lines.push(
      `| \`${r.key}\` | ${r.label} | ${fmt(r.result.stratified.mean, 4)} | ${fmt(r.result.pooled.mean, 4)} | ${r.pHolm.toExponential(1)} | ${f.filter((x) => x.sign > 0).length} | ${f.filter((x) => x.sign < 0).length} | ${f.filter((x) => x.sign === 0).length} |`,
    );
  }
  return lines.join("\n");
}

const sets = [
  { name: "The promotion corpus", records: load(opt("--corpus")) },
  { name: "The fresh seeds", records: load(opt("--fresh")) },
].filter((s) => s.records.length > 0);
if (sets.length === 0) throw new Error("The options --corpus and --fresh give no records.");

const out: string[] = [`# The promotion test of \`${candidate}\` against \`${baseline}\` (step \`${step}\`)`, ""];
const json: Record<string, unknown> = { candidate, baseline, step, sets: [] };
for (const s of sets) {
  const ps = pairs(s.records);
  const ex = ps.filter((p) => p.exercised);
  const literal = winTest(ps, "literal");
  const exercised = winTest(ex, "exercised");
  const vs = verdicts(s.records);
  out.push(`## ${s.name}`, "", `${ps.length} paired inputs in ${new Set(ps.map((p) => p.family)).size} families. The candidate changes the output on ${ex.length} inputs.`, "");
  out.push(winText(s.name, literal, ps.length), "", winText(s.name, exercised, ps.length), "", `### The verdict over families`, "", verdictText(vs), "");
  (json["sets"] as unknown[]).push({ name: s.name, pairs: ps.length, exercised: ex.length, literal, exercisedTest: exercised, verdicts: vs.map((v) => ({ key: v.key, label: v.label, pHolm: v.pHolm, stratified: v.result.stratified, pooled: v.result.pooled, families: v.result.families })) });
}
const decided = sets.map((s) => winTest(pairs(s.records), "literal").pass);
out.push(`## The decision`, "", `The literal win test ${decided.every((d) => d) ? "passes on each set, so the candidate can become the default" : "fails on a set, so the default does not change"}.`, "");
const text = out.join("\n");
writeFileSync(opt("--out") ?? "promotion.md", text);
if (opt("--json")) writeFileSync(opt("--json")!, JSON.stringify(json, null, 2));
console.log(text);
