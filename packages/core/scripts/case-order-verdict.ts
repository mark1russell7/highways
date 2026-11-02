// The plan, the rounds and the verdict of the case-order run (BENCH-FRESH-CASES step 1). `scripts/case-order.ts` starts the processes.
// The question: does the heap of earlier cases in one process change the time of a later case? Each case gets three arms in fresh processes.
// - `in-order`: one fresh process runs the cases in their normal order. The script reads the time of each case from its report.
// - `alone`: one fresh process runs only this case.
// - `alone-aa`: a second copy of `alone`. It gives the A/A band of the case.
// Each round runs each arm one time, in turn. Odd rounds reverse the order. The runs go in CI only, not on a local machine.
// The verdict of a case is the equivalence verdict of the strategy (TOST): one effect interval E against the budget b.
// This module starts no process and reads no clock, so the tests give made-up reports.
import { quantileOf, type PairedReport, type RecordEnv } from "./gates/paired.ts";

/** The targets of the run: the paired screen, the times of the zoom levels and the remeasure of PORTFOLIO-SPEED. */
export const CASE_TARGETS = ["screen", "levels", "portfolio-speed"] as const;
export type CaseTarget = (typeof CASE_TARGETS)[number];

/** The three arms of a case. */
export const IN_ORDER = "in-order";
export const ALONE = "alone";
export const ALONE_AA = "alone-aa";
export type CaseArm = typeof IN_ORDER | typeof ALONE | typeof ALONE_AA;

/** The rule of a slow process. The record and the summary state it. */
export const SLOW_RULE =
  "A slow process has a time above the largest time of the alone arm, on the same case and paired arm. So the alone arm has no slow process. The alone-aa arm gives the slow count with no effect of the order.";

/** The rule of the effect interval E. */
export const EFFECT_RULE =
  "R is the median ratio in-order / alone over the processes of one job. The A/A half-spread h is the worst `(p90 - p10) / 2` of the ratios `alone-aa / alone` over the jobs. E is `[min R - h, max R + h]`.";

/** The rule of the verdict of E. */
export const VERDICT_RULE =
  "The verdict is no change when E is inside [1 - b, 1 + b]. It is slower when the low end of E is above 1 + b, and faster when the high end is below 1 - b. Else it is cannot decide.";

/** The rule of the ratio of ratios R2. */
export const R2_RULE =
  "R2 is the ratio head / base in order over the ratio head / base alone. Its E has the same rule. A shift of both arms by the same factor leaves R2 at 1.";

/** The rule of the record of a case. The run is not sized for the budget, so it decides no case. */
export const RECORD_RULE =
  "This run is a record of the effect of the order. It is not sized, so it decides no case. A case records slower or faster when one E is outside 1 ± b.";

/** The label of the verdict columns. */
export const RECORD_LABEL = "record only, not sized";

/** The rule of the size of a sized run. */
export const SIZE_RULE =
  "σ is the standard deviation of the alone times of a row over their median. `n = ceil(((1.64 + 0.84) × σ / b)²)`. n is the count of processes for each arm of a sized run.";

/** The budget b of the screen when the script has no gap from the records. No committed record of the repository gives the gap to the time limit of the promotion. */
export const DEFAULT_BUDGET = 0.1;

/** The note on the absolute times of the arm in order. */
export const IN_ORDER_NOTE = "A time of the arm in-order comes after the other cases in one process. It is not the cost of the case.";

/** The plan of one target: its command lines and the defaults of its run. */
export interface CasePlan {
  readonly target: CaseTarget;
  /** The command of a process of the arm in order. The process writes its reports below the folder `dir`. */
  readonly inOrder: (dir: string) => string[];
  /** The command of a process that runs only one case. */
  readonly alone: (input: string, dir: string) => string[];
  /** The file of the reports that a process writes below the folder `dir`. */
  readonly reportOf: (dir: string) => string;
  /** The labels of the reports of one process, in order. A report with no label gets its index. */
  readonly reportLabels: readonly string[];
  /** The alone arms take each case at this step of the normal order: the cases 0, stride, 2 × stride, up to the last case. */
  readonly stride: number;
  /** The text of the normal order, for the summary. */
  readonly describe: string;
  /** The budget b of a target with a gate. A target with no gate has no budget, so its verdict is `no budget` without the input `--budget`. */
  readonly budget?: { readonly value: number; readonly source: string };
}

/** The paths and the settings that the plans use. */
export interface PlanPaths {
  /** The argv of the start of Node.js: `process.execPath` and its flags. */
  readonly node: readonly string[];
  /** The folder `packages/core/scripts`. */
  readonly scripts: string;
}

/** The settings of the screen target. They are the settings of a paired screen of the promotion. */
export const SCREEN_PLAN = { set: "screen-v3", base: "shared", arms: ["corners"], repeats: 3 } as const;
/** The fixtures of the levels target: the fixtures of the benchmark up to 1000 nodes. */
export const LEVELS_FIXTURES = ["tiny-uniform", "small-clustered", "grid-400", "mid-uniform", "mid-clustered", "mid-hubs", "mid-fanout"] as const;

/** This function joins a folder and a file name with a forward slash. Node.js on each system takes it. */
const at = (dir: string, file: string): string => `${dir.replace(/[\\/]+$/, "")}/${file}`;

/** This function gives the plan of a target. */
export function casePlan(target: CaseTarget, paths: PlanPaths): CasePlan {
  const node = [...paths.node];
  const script = (name: string): string => at(paths.scripts, name);
  if (target === "screen") {
    const { set, base, arms, repeats } = SCREEN_PLAN;
    const paired = ["--paired-base", base, "--paired-arms", arms.join(","), "--paired-repeats", String(repeats)];
    return {
      target,
      inOrder: (dir) => [
        ...node,
        script("screen.ts"),
        ...["--step", "router", "--set", set, "--strategy", arms.join(",")],
        ...["--paired", at(dir, "paired.json"), ...paired],
        ...["--out", at(dir, "screen.jsonl"), "--summary", at(dir, "screen.md")],
      ],
      alone: (input, dir) => [...node, script("case-order.ts"), "--child", "screen", "--input", input, "--set", set, ...paired, "--paired", at(dir, "paired.json")],
      reportOf: (dir) => at(dir, "paired.json"),
      reportLabels: [""],
      stride: 5,
      budget: { value: DEFAULT_BUDGET, source: `default ${DEFAULT_BUDGET}` },
      describe: `the screen of the step router on \`${set}\` with \`--strategy ${arms.join(",")}\`. Then the paired time of \`${[base, ...arms].join(",")}\`, with the A/A arm and ${repeats} rounds`,
    };
  }
  if (target === "levels") {
    const run = (fixtures: string, dir: string): string[] => [...node, script("levels.ts"), "--fixture", fixtures, "--repeat", "3", "--paired", at(dir, "paired.json")];
    return {
      target,
      inOrder: (dir) => run(LEVELS_FIXTURES.join(","), dir),
      alone: (input, dir) => run(input, dir),
      reportOf: (dir) => at(dir, "paired.json"),
      reportLabels: ["route", "links"],
      stride: 1,
      describe: `\`scripts/levels.ts\` on the fixtures \`${LEVELS_FIXTURES.join(",")}\`, 3 rounds. The route of each fixture comes first, then the level links of each fixture`,
    };
  }
  const run = (dir: string): string[] => [...node, script("remeasure.ts"), "--claim", "portfolio-speed", "--job", "1", "--out", dir];
  return {
    target,
    inOrder: (dir) => run(dir),
    alone: (input, dir) => [...run(dir), "--only", input],
    reportOf: (dir) => at(dir, "paired-job1.json"),
    reportLabels: [""],
    stride: 11,
    describe: "`scripts/remeasure.ts --claim portfolio-speed`: 0.5.1 against the workspace on the 96 inputs, 10 rounds, in one process",
  };
}

/** This function gives the cases of the alone arms: each case at the step `stride` of the normal order. */
export function pickCases(inputs: readonly string[], stride: number): string[] {
  if (!Number.isInteger(stride) || stride < 1) throw new RangeError("The stride is a whole number of 1 or more.");
  return inputs.filter((_, i) => i % stride === 0);
}

/** One process of a round: its arm, and the case of an alone arm. */
export interface CaseUnit {
  readonly arm: CaseArm;
  readonly input?: string;
}

/** This function gives the processes of one round in their order. The order of an odd round is reversed. */
export function roundUnits(cases: readonly string[], round: number): CaseUnit[] {
  const units: CaseUnit[] = [{ arm: IN_ORDER }, ...cases.flatMap((input) => [{ arm: ALONE, input }, { arm: ALONE_AA, input }] as CaseUnit[])];
  return round % 2 === 1 ? units.reverse() : units;
}

/** One time of a process: the median of the rounds of one paired arm on one input of one report. */
export interface CaseValue {
  readonly report: string;
  readonly input: string;
  readonly arm: string;
  /** The base arm of the report. */
  readonly base: string;
  readonly ms: number;
}

/** This function gives the times of the reports of one process: the median of each paired arm on each input. */
export function valuesOf(reports: readonly PairedReport[], labels: readonly string[]): CaseValue[] {
  return reports.flatMap((report, i) => {
    const label = labels[i] ?? String(i);
    return report.inputs.flatMap((input) =>
      Object.entries(input.median)
        .filter(([, ms]) => Number.isFinite(ms))
        .map(([arm, ms]) => ({ report: label, input: input.id, arm, base: report.base, ms })),
    );
  });
}

/** The record of one process, with the schema `case-order/1`. */
export interface CaseRecord {
  readonly schema: "case-order/1";
  readonly target: CaseTarget;
  /** The CI job of the record. The verdict takes the band of R over the jobs. */
  readonly job: number;
  readonly round: number;
  /** The place of the process in its round, from 0. */
  readonly slot: number;
  readonly arm: CaseArm;
  readonly input?: string;
  /** The computer and the mode. The arm in order times its cases in one process (`process`). An alone arm has a fresh process for each case (`fresh`). */
  readonly env: RecordEnv;
  readonly values: readonly CaseValue[];
  readonly reports: readonly PairedReport[];
}

/** The services of a run. The script gives the real ones, and a test gives made-up ones. */
export interface RunDeps {
  /** This function starts a process with the argv, and resolves when it exits with the code 0. */
  readonly start: (argv: readonly string[]) => Promise<void>;
  /** This function reads the reports of a file. */
  readonly read: (file: string) => PairedReport[];
  /** This function gives an empty folder for one process. */
  readonly dirOf: (round: number, slot: number) => string;
  readonly env: (arm: CaseArm) => RecordEnv;
  /** This function keeps the record of a process. */
  readonly keep: (record: CaseRecord) => void;
  readonly log?: (line: string) => void;
}

/**
 * This function starts the processes of each round of a plan, one at a time, and gives the records and the cases.
 * The first process of the round 0 is the arm in order. Its first report gives the cases of the alone arms.
 */
export async function runRounds(plan: CasePlan, rounds: number, deps: RunDeps, stride = plan.stride, job = 1): Promise<{ records: CaseRecord[]; cases: string[] }> {
  if (!Number.isInteger(rounds) || rounds < 1) throw new RangeError("The rounds are a whole number of 1 or more.");
  const records: CaseRecord[] = [];
  let cases: string[] | undefined;
  const runOne = async (round: number, slot: number, unit: CaseUnit): Promise<CaseRecord> => {
    const dir = deps.dirOf(round, slot);
    const argv = unit.arm === IN_ORDER ? plan.inOrder(dir) : plan.alone(unit.input!, dir);
    await deps.start(argv);
    const reports = deps.read(plan.reportOf(dir));
    if (reports.length === 0) throw new Error(`The process ${unit.arm} ${unit.input ?? ""} of the round ${round} wrote no report.`);
    const record: CaseRecord = {
      schema: "case-order/1",
      target: plan.target,
      job,
      round,
      slot,
      arm: unit.arm,
      ...(unit.input === undefined ? {} : { input: unit.input }),
      env: deps.env(unit.arm),
      values: valuesOf(reports, plan.reportLabels),
      reports,
    };
    deps.keep(record);
    records.push(record);
    deps.log?.(`job ${job} round ${round} slot ${slot}: ${unit.arm}${unit.input === undefined ? "" : ` ${unit.input}`}`);
    return record;
  };
  for (let round = 0; round < rounds; round++) {
    let units: CaseUnit[];
    let slot = 0;
    if (cases === undefined) {
      const first = await runOne(round, slot++, { arm: IN_ORDER });
      cases = pickCases(first.reports[0]!.inputs.map((i) => i.id), stride);
      units = roundUnits(cases, round).slice(1);
    } else units = roundUnits(cases, round);
    for (const unit of units) await runOne(round, slot++, unit);
  }
  return { records, cases: cases ?? [] };
}

/** This function gives the chance that `k` or more of `n` values are above each of `m` other values. All values come from one distribution. */
export function exceedP(n: number, m: number, k: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let p = 1;
  for (let i = 0; i < k; i++) p *= (n - i) / (n + m - i);
  return p;
}

/** The verdict of an effect interval E against the budget b. The verdict `void` tells that no job has an A/A band that contains 1. */
export type Equivalence = "no change" | "slower" | "faster" | "cannot decide" | "no budget" | "void";

/** The ratios of one job for one effect: the ratio of each round, and the A/A ratio of each round. */
export interface JobRatios {
  readonly ratios: readonly number[];
  readonly aa: readonly number[];
}

/** The effect interval of one row, with its parts. */
export interface Effect {
  /** The value R of each job that counts. */
  readonly r: readonly number[];
  /** The worst A/A half-spread over the jobs that count. */
  readonly h: number;
  /** The interval E. It is `null` when no job counts. */
  readonly e: { readonly lo: number; readonly hi: number } | null;
  /** The count of the jobs that count: their A/A band (p10 to p90) contains 1. */
  readonly jobs: number;
  readonly verdict: Equivalence;
}

/** This function gives the verdict of an interval against the budget b. Without a budget, the verdict is `no budget`. */
export function verdictOf(e: { readonly lo: number; readonly hi: number } | null, budget: number | undefined): Equivalence {
  if (e === null) return "void";
  if (budget === undefined) return "no budget";
  if (e.lo >= 1 - budget && e.hi <= 1 + budget) return "no change";
  if (e.lo > 1 + budget) return "slower";
  if (e.hi < 1 - budget) return "faster";
  return "cannot decide";
}

/** This function gives the effect interval E of the jobs of one row, and its verdict. A job counts only when its A/A band contains 1. */
export function effectOf(jobs: readonly JobRatios[], budget: number | undefined): Effect {
  const counted = jobs.filter((j) => j.ratios.length > 0 && j.aa.length > 0 && quantileOf(j.aa, 0.1) <= 1 && quantileOf(j.aa, 0.9) >= 1);
  if (counted.length === 0) return { r: [], h: Number.NaN, e: null, jobs: 0, verdict: "void" };
  const r = counted.map((j) => quantileOf(j.ratios, 0.5));
  const h = Math.max(...counted.map((j) => (quantileOf(j.aa, 0.9) - quantileOf(j.aa, 0.1)) / 2));
  const e = { lo: Math.min(...r) - h, hi: Math.max(...r) + h };
  return { r, h, e, jobs: counted.length, verdict: verdictOf(e, budget) };
}

/** One process for one row: the time of the paired arm of the row, and the time of the base arm in the same process. */
export interface Sample {
  readonly v: number;
  readonly base: number;
}

/** The processes of one job for one row: the arm in order, the arm alone and the A/A arm, one of each for each round. */
export interface JobSamples {
  readonly inOrder: readonly Sample[];
  readonly alone: readonly Sample[];
  readonly aa: readonly Sample[];
}

/** This function gives the ratios of one job: in-order / alone, and with `r2` the ratio of ratios R2. */
export function jobRatios(s: JobSamples, r2: boolean): JobRatios {
  const of = (x: Sample, a: Sample): number => (r2 ? x.v / x.base / (a.v / a.base) : x.v / a.v);
  const ok = Number.isFinite;
  return {
    ratios: s.inOrder.map((x, i) => of(x, s.alone[i]!)).filter(ok),
    aa: s.aa.map((x, i) => of(x, s.alone[i]!)).filter(ok),
  };
}

/** This function gives a random source of numbers in [0, 1) from a seed (mulberry32). The same seed gives the same numbers. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The rates of a resample of the alone processes. */
export interface Rates {
  /** The share of the resamples with no effect that give `no change` for E of the arm. A row with R2 also needs `no change` for R2. */
  readonly noEffectPass: number;
  /** The share of the resamples with the arm scaled by 1 + b that give `slower` for E of the arm. */
  readonly powerArm: number;
  /** The share of the resamples with the head arm scaled by 1 + b that give `slower` for E of R2. It is `null` for the base arm. */
  readonly powerR2: number | null;
  readonly resamples: number;
  readonly seed: number;
}

/** The count and the seed of the resamples of `resampleRates`. */
export const RESAMPLES = 1000;
export const RESAMPLE_SEED = 20261102;

/**
 * This function resamples the alone processes of each job (a bootstrap over the processes, with a fixed seed).
 * Each resample draws the three arms from one pool: the alone and A/A processes of the job.
 * With no effect, it counts `no change`. With the time of the row arm in order scaled by 1 + b, it counts `slower`.
 */
export function resampleRates(jobs: readonly JobSamples[], budget: number, r2: boolean, resamples = RESAMPLES, seed = RESAMPLE_SEED): Rates {
  const next = seeded(seed);
  const pools = jobs.map((j) => [...j.alone, ...j.aa]).filter((p) => p.length > 0);
  const draw = (pool: readonly Sample[], n: number): Sample[] => Array.from({ length: n }, () => pool[Math.floor(next() * pool.length)]!);
  let pass = 0;
  let arm = 0;
  let head = 0;
  for (let k = 0; k < resamples; k++) {
    const calm: JobSamples[] = [];
    const moved: JobSamples[] = [];
    pools.forEach((pool, i) => {
      const n = jobs[i]!.alone.length;
      const inOrder = draw(pool, n);
      const alone = draw(pool, n);
      const aa = draw(pool, n);
      calm.push({ inOrder, alone, aa });
      moved.push({ inOrder: inOrder.map((x) => ({ v: x.v * (1 + budget), base: x.base })), alone, aa });
    });
    const calmArm = effectOf(calm.map((j) => jobRatios(j, false)), budget).verdict;
    const calmR2 = r2 ? effectOf(calm.map((j) => jobRatios(j, true)), budget).verdict : "no change";
    if (calmArm === "no change" && calmR2 === "no change") pass++;
    if (effectOf(moved.map((j) => jobRatios(j, false)), budget).verdict === "slower") arm++;
    if (r2 && effectOf(moved.map((j) => jobRatios(j, true)), budget).verdict === "slower") head++;
  }
  const share = (x: number): number => (resamples === 0 ? Number.NaN : x / resamples);
  return { noEffectPass: share(pass), powerArm: share(arm), powerR2: r2 ? share(head) : null, resamples, seed };
}

/** The record of a case: the effects that the rows of the case show. The value `no effect shown` is not a verdict of no change. */
export type CaseEffect = "slower" | "faster" | "slower and faster" | "no effect shown" | "no budget";

/** This function gives the relative spread σ of a set of times: the standard deviation over the median. */
export function spreadOf(times: readonly number[]): number {
  if (times.length < 2) return Number.NaN;
  const median = quantileOf(times, 0.5);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const variance = times.reduce((a, b) => a + (b - mean) ** 2, 0) / (times.length - 1);
  return Math.sqrt(variance) / median;
}

/** This function gives the processes n for each arm of a sized run: ((1.64 + 0.84) × σ / b)², rounded up. Without a budget it gives `null`. */
export function sizeOf(sigma: number, budget: number | undefined): number | null {
  if (budget === undefined || !Number.isFinite(sigma)) return null;
  return Math.max(1, Math.ceil((((1.64 + 0.84) * sigma) / budget) ** 2));
}

/** One row of the verdict: one paired arm on one case. */
export interface CaseRow {
  readonly report: string;
  readonly input: string;
  readonly arm: string;
  /** The value `true` for the base arm of the report. The base arm has no R2. */
  readonly isBase: boolean;
  /** The rounds with a time of each of the three arms, over all jobs. */
  readonly rounds: number;
  readonly aloneMs: number;
  /** The median time of the arm in order. It is not the cost of the case (`IN_ORDER_NOTE`). */
  readonly inOrderMs: number;
  /** The slow processes of each arm, by `SLOW_RULE`, summed over the jobs. */
  readonly slowInOrder: number;
  readonly slowAA: number;
  /** The value `exceedP` of the slow count in order of each job, the smallest over the jobs. */
  readonly pInOrder: number;
  readonly effect: Effect;
  /** The effect of the ratio of ratios R2. It is `null` for the base arm. */
  readonly r2: Effect | null;
  /** The rates of the resample. They are `null` without a budget. */
  readonly rates: Rates | null;
  /** The relative spread σ of the single alone processes of the row (`SIZE_RULE`). */
  readonly sigma: number;
  /** The processes for each arm of a sized run at the budget b. It is `null` without a budget. */
  readonly n: number | null;
  /** The record of the case of the row: the same value on each row of the case. */
  readonly record: CaseEffect;
}

/** The verdict of one target. */
export interface CaseVerdict {
  readonly schema: "case-order-verdict/2";
  readonly target: CaseTarget;
  readonly describe: string;
  readonly jobs: readonly number[];
  readonly rounds: number;
  readonly cases: readonly string[];
  readonly env: RecordEnv | null;
  /** The budget b and its source: `default 0.1`, `input --budget`, or `no budget`. */
  readonly budget: number | null;
  readonly budgetSource: string;
  readonly rules: { readonly slow: string; readonly effect: string; readonly verdict: string; readonly r2: string; readonly record: string; readonly size: string };
  /** The label of the verdict columns: the run is a record, and it is not sized. */
  readonly label: typeof RECORD_LABEL;
  readonly rows: readonly CaseRow[];
  /** The count of the cases that record an effect: slower, faster, or both. */
  readonly withEffect: number;
}

/** This function gives the key of a value: the report, the input and the paired arm. */
const keyOf = (v: { readonly report: string; readonly input: string; readonly arm: string }): string => `${v.report}\u0000${v.input}\u0000${v.arm}`;

/** This function gives the budget of a target: the input `--budget`, else the budget of the plan, else no budget. */
export function budgetOf(plan: Pick<CasePlan, "budget">, input: number | undefined): { readonly value: number | undefined; readonly source: string } {
  if (input !== undefined) {
    if (!Number.isFinite(input) || input <= 0 || input >= 1) throw new RangeError("The budget is a number above 0 and below 1.");
    return { value: input, source: "input --budget" };
  }
  return plan.budget === undefined ? { value: undefined, source: "no budget" } : { value: plan.budget.value, source: plan.budget.source };
}

/**
 * This function gives the verdict of the records of a target. Each row is one paired arm on one case of the alone arms.
 * The records can come from several jobs. Each job pairs its own rounds.
 */
export function caseVerdict(plan: Pick<CasePlan, "target" | "describe" | "budget">, records: readonly CaseRecord[], cases: readonly string[], budgetInput?: number, resamples = RESAMPLES): CaseVerdict {
  const budget = budgetOf(plan, budgetInput);
  const want = new Set(cases);
  // The times by job, round and arm: the key of the value gives the time, and the key of its base gives the base time.
  const times = new Map<string, Map<string, number>>();
  const at = (job: number, round: number, arm: CaseArm): Map<string, number> => {
    const id = `${job}\u0000${round}\u0000${arm}`;
    const m = times.get(id) ?? new Map<string, number>();
    times.set(id, m);
    return m;
  };
  const rows = new Map<string, { report: string; input: string; arm: string; base: string }>();
  const rounds = new Map<number, Set<number>>();
  for (const r of records) {
    rounds.set(r.job, (rounds.get(r.job) ?? new Set()).add(r.round));
    const m = at(r.job, r.round, r.arm);
    for (const v of r.values) {
      if (!want.has(v.input) || (r.input !== undefined && v.input !== r.input)) continue;
      m.set(keyOf(v), v.ms);
      if (r.arm === IN_ORDER && !rows.has(keyOf(v))) rows.set(keyOf(v), { report: v.report, input: v.input, arm: v.arm, base: v.base });
    }
  }
  const jobs = [...rounds.keys()].sort((a, b) => a - b);
  const built = [...rows.entries()].map(([key, id]) => {
    const baseKey = keyOf({ ...id, arm: id.base });
    const isBase = id.arm === id.base;
    const samples: JobSamples[] = [];
    let slowInOrder = 0;
    let slowAA = 0;
    let pInOrder = 1;
    const io: number[] = [];
    const al: number[] = [];
    for (const job of jobs) {
      const s = { inOrder: [] as Sample[], alone: [] as Sample[], aa: [] as Sample[] };
      for (const round of [...rounds.get(job)!].sort((a, b) => a - b)) {
        const get = (arm: CaseArm): Sample | undefined => {
          const m = at(job, round, arm);
          const v = m.get(key);
          const base = m.get(baseKey);
          return v === undefined || base === undefined ? undefined : { v, base };
        };
        const x = get(IN_ORDER);
        const y = get(ALONE);
        const z = get(ALONE_AA);
        if (x === undefined || y === undefined || z === undefined) continue;
        s.inOrder.push(x);
        s.alone.push(y);
        s.aa.push(z);
      }
      if (s.inOrder.length === 0) continue;
      samples.push(s);
      const top = Math.max(...s.alone.map((a) => a.v));
      const slow = s.inOrder.filter((x) => x.v > top).length;
      slowInOrder += slow;
      slowAA += s.aa.filter((x) => x.v > top).length;
      pInOrder = Math.min(pInOrder, exceedP(s.inOrder.length, s.alone.length, slow));
      io.push(...s.inOrder.map((x) => x.v));
      al.push(...s.alone.map((x) => x.v));
    }
    const effect = effectOf(samples.map((s) => jobRatios(s, false)), budget.value);
    const r2 = isBase ? null : effectOf(samples.map((s) => jobRatios(s, true)), budget.value);
    const rates = budget.value === undefined || samples.length === 0 ? null : resampleRates(samples, budget.value, !isBase, resamples);
    const sigma = spreadOf(al);
    return { ...id, isBase, sigma, n: sizeOf(sigma, budget.value), rounds: io.length, aloneMs: quantileOf(al, 0.5), inOrderMs: quantileOf(io, 0.5), slowInOrder, slowAA, pInOrder, effect, r2, rates };
  });
  const kept = built.filter((r) => r.rounds > 0);
  // The record of a case takes each row of the case.
  const recordOf = new Map<string, CaseEffect>();
  for (const input of new Set(kept.map((r) => r.input))) {
    const mine = kept.filter((r) => r.input === input);
    const verdicts = mine.flatMap((r) => [r.effect.verdict, ...(r.r2 === null ? [] : [r.r2.verdict])]);
    const slower = verdicts.includes("slower");
    const faster = verdicts.includes("faster");
    recordOf.set(input, verdicts.includes("no budget") ? "no budget" : slower && faster ? "slower and faster" : slower ? "slower" : faster ? "faster" : "no effect shown");
  }
  const out: CaseRow[] = kept.map(({ base: _base, ...r }) => ({ ...r, record: recordOf.get(r.input)! }));
  const effects = [...recordOf.values()];
  return {
    schema: "case-order-verdict/2",
    target: plan.target,
    describe: plan.describe,
    jobs,
    rounds: Math.max(0, ...jobs.map((j) => rounds.get(j)!.size)),
    cases: [...cases],
    env: records.find((r) => r.arm === IN_ORDER)?.env ?? records[0]?.env ?? null,
    budget: budget.value ?? null,
    budgetSource: budget.source,
    rules: { slow: SLOW_RULE, effect: EFFECT_RULE, verdict: VERDICT_RULE, r2: R2_RULE, record: RECORD_RULE, size: SIZE_RULE },
    label: RECORD_LABEL,
    rows: out,
    withEffect: effects.filter((d) => d === "slower" || d === "faster" || d === "slower and faster").length,
  };
}

/** This function gives a number with 3 decimals, or `-`. */
const f3 = (x: number): string => (Number.isFinite(x) ? x.toFixed(3) : "-");
/** This function gives a time in ms with 1 decimal, or `-`. */
const ms1 = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : "-");
/** This function gives a probability in short form. */
const pText = (p: number): string => (p >= 0.001 ? p.toFixed(3) : p.toExponential(1));
/** This function gives a share as a percent, or `-`. */
const pct = (x: number | null | undefined): string => (x === null || x === undefined || !Number.isFinite(x) ? "-" : `${Math.round(x * 100)}%`);
/** This function gives an effect as `[lo, hi] verdict`. */
const effectText = (e: Effect | null): string => (e === null ? "-" : e.e === null ? e.verdict : `[${f3(e.e.lo)}, ${f3(e.e.hi)}] ${e.verdict}`);

/** This function gives the Markdown text of a verdict: one row for each paired arm on each case. */
export function verdictText(v: CaseVerdict): string[] {
  const env = v.env === null ? "unknown" : `${v.env.cpu}, ${v.env.cores} cores, ${v.env.os} ${v.env.arch}, Node.js ${v.env.node}, mode ${v.env.mode}`;
  const budget =
    v.budget === null
      ? "The budget: no budget. This target has no gate budget, so each verdict is no budget. The input `--budget` of the script gives one."
      : `The budget: b = ${v.budget} (${v.budgetSource}).`;
  const lines = [
    `## ${v.target}`,
    "",
    `The normal order: ${v.describe}.`,
    `The run has ${v.jobs.length} jobs of ${v.rounds} rounds, and ${v.cases.length} cases with alone arms. The computer: ${env}.`,
    "",
    `- ${budget}`,
    `- E: ${v.rules.effect}`,
    `- The verdict: ${v.rules.verdict}`,
    `- R2: ${v.rules.r2}`,
    `- The record: ${v.rules.record}`,
    `- The size: ${v.rules.size}`,
    `- The slow count: ${v.rules.slow} The value p is the chance of that count or more with no effect of the order.`,
    `- The resample: the pass rate is the share of \`no change\` with no effect. The power is the share of \`slower\` with the arm in order scaled by 1 + b.`,
    `- ${IN_ORDER_NOTE}`,
    "",
    `Of ${new Set(v.rows.map((r) => r.input)).size} cases, ${v.withEffect} record an effect of the order. The verdict columns are a record only. They are not sized.`,
    "",
    `| case | paired arm | E in-order / alone (${RECORD_LABEL}) | E of R2 (${RECORD_LABEL}) | record of the case | σ | b | n | pass rate, no effect | power of E | power of R2 | slow in order | slow A/A | p | alone ms | in-order ms (not the cost) |`,
    "|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const r of v.rows) {
    const id = r.report === "" ? r.input : `${r.report}: ${r.input}`;
    lines.push(
      `| ${id} | ${r.arm}${r.isBase ? " (base)" : ""} | ${effectText(r.effect)} | ${effectText(r.r2)} | ${r.record} | ${f3(r.sigma)} | ${v.budget ?? "-"} | ${r.n ?? "-"} | ${pct(r.rates?.noEffectPass)} | ${pct(r.rates?.powerArm)} | ${pct(r.rates?.powerR2)} | ${r.slowInOrder} of ${r.rounds} | ${r.slowAA} of ${r.rounds} | ${pText(r.pInOrder)} | ${ms1(r.aloneMs)} | ${ms1(r.inOrderMs)} |`,
    );
  }
  return lines;
}
