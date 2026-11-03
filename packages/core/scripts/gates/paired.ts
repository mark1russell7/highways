// The paired time test of two or more arms, to the shared interface paired-time/1 (MEASURE-ISOLATE).
// The rule: a comparison runs its arms in one job, in turn on each input, and an A/A arm (the base against itself) gives the noise floor.
// This module imports only node modules and knows no type of highways. Two other repos keep a copy to the same interface, and the copies merge with no rewrite.
//
// - Mode `process`: one process. In each round, the arms run in turn on each input. Odd rounds reverse the order (ABBA).
// - Mode `fresh`: a fresh process for each arm, each input and each round. Each input takes the arms in turn. The order rotates by the round.
//   The order `turn` puts the base first in each even global round and last in each odd one, so each pair with the base turns its order.
//
// The child protocol of mode `fresh`: the helper appends `--input <id> --warmup <n>` to the command of the arm.
// The child runs the warm-up untimed, times one run itself, and prints one JSON line `{"ms": n, "peakRss"?: bytes}`. `runChild` does this for a script.
import { spawn } from "node:child_process";
import { arch, cpus, platform } from "node:os";
import { performance } from "node:perf_hooks";

/** The mode of a paired time run: one process, or a fresh process for each arm in each round. */
export type Mode = "process" | "fresh";

/**
 * The order of the arms in a round of mode `fresh`.
 * - The order `rotate` rotates all the arms by the round. It is the order of each report without the field `order`.
 * - The order `turn` puts the base first in an even global round and last in an odd global round. The other arms rotate.
 *   Thus the pair of the base and each other arm starts with the base in each second round, as `firstArm` of rigor-bench.
 */
export type Order = "rotate" | "turn";

/** One arm of a paired time run. Mode `process` calls `run`, and mode `fresh` starts `command` with the child protocol. */
export interface Arm<I> {
  readonly id: string;
  readonly run?: (input: I) => unknown;
  /** The argv of the child. The helper appends `--input <id> --warmup <n>`. */
  readonly command?: readonly string[];
}

/** One input of a paired time run. The `group` is a fold of the inputs, for example a family or a seed. */
export interface Input<I> {
  readonly id: string;
  readonly group?: string;
  readonly value?: I;
}

/** The result of one child of mode `fresh`: its time in milliseconds, and its memory peak in bytes. */
export interface ChildResult {
  readonly ms: number;
  readonly peakRss?: number;
}

/** The computer of a paired time run. The `cpu` is the model of the first CPU. */
export interface PairedEnv {
  readonly cpu: string;
  readonly cores: number;
  readonly os: string;
  readonly arch: string;
  readonly node: string;
  readonly runner?: string;
}

/** The options of `measureIsolated`. */
export interface PairedOptions<I> {
  /** The arms. The arm 0 is the base: the denominator of each ratio. */
  readonly arms: readonly Arm<I>[];
  readonly inputs: readonly Input<I>[];
  /** The timed rounds of each arm on each input. */
  readonly repeats: number;
  /** The untimed runs of each arm before its timed run. The default is 1. */
  readonly warmup?: number;
  readonly mode: Mode;
  /** The value `true` adds a second copy of the base with the id `${base}~aa`. The default is `true`. */
  readonly aa?: boolean;
  /** The clock of mode `process`, in milliseconds. The default is `performance.now`. A test gives its own. */
  readonly clock?: () => number;
  /** The start of one child of mode `fresh`. The default starts a process. A test gives its own. */
  readonly startChild?: (command: readonly string[], input: string, warmup: number) => Promise<ChildResult>;
  /** The computer. The default is the computer of this process. */
  readonly env?: PairedEnv;
  /** The context of the run. The default is `pairedContext()`. */
  readonly context?: string;
  /** The order of the arms of mode `fresh`. The default is `rotate`. */
  readonly order?: Order;
  /** The global round of the first round of this job. The default is 0. A run of many jobs sets it to `(job - 1) * repeats`. */
  readonly roundOffset?: number;
  /** The label of the job, for example the index of its CI job. */
  readonly job?: string;
}

/** The fields of a report that tell the job of its rounds. Each field is optional, so an older report still reads. */
export interface RunFields {
  readonly job?: string;
  readonly roundOffset?: number;
  readonly order?: Order;
}

/** The statistics of the ratios of one arm over the base. */
export interface PairedRatio {
  /** The count of the inputs with a ratio. */
  readonly inputs: number;
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
  /** The share of the inputs whose ratio is outside [p10, p90] of the A/A arm. It is `null` without the A/A arm. */
  readonly moved: number | null;
  /** The median ratio of the inputs of each group. An input with no group is in the group `all`. */
  readonly groups: Readonly<Record<string, number>>;
  /** The mean of the group medians. */
  readonly groupMean: number;
  /** The sample SD (n - 1) of the group medians. Fewer than 2 groups give 0. */
  readonly groupSD: number;
}

/** One input of a report. */
export interface PairedInput {
  readonly id: string;
  readonly group?: string;
  /** The raw times of each arm, one value for each round, in milliseconds. */
  readonly ms: Readonly<Record<string, readonly number[]>>;
  readonly median: Readonly<Record<string, number>>;
  /** The median time of the arm over the median time of the base, on this input. The base has no ratio. */
  readonly ratio: Readonly<Record<string, number>>;
  /** The largest memory peak of each arm over its rounds, in bytes. Only mode `fresh` has it. */
  readonly peakRss?: Readonly<Record<string, number>>;
}

/**
 * The report of a paired time run, with the schema `paired-time/1`.
 * The optional fields `job`, `roundOffset` and `order` of `RunFields` tell the job, the global round of its round 0 and the order of the arms.
 */
export interface PairedReport extends RunFields {
  readonly schema: "paired-time/1";
  readonly mode: Mode;
  /** The context of the run: `BENCH_MODE`, else `ci` or `local`, then the flags of Node.js. */
  readonly context?: string;
  readonly env: PairedEnv;
  readonly base: string;
  /** The ids of the arms, with the A/A arm. */
  readonly arms: readonly string[];
  readonly inputs: readonly PairedInput[];
  /** The statistics of each arm that is not the base, with the A/A arm. */
  readonly ratios: Readonly<Record<string, PairedRatio>>;
  /** The ratios of the A/A arm. It is `null` without the A/A arm. */
  readonly noiseFloor: { readonly median: number; readonly p10: number; readonly p90: number } | null;
}

/**
 * The computer and the mode of one timing record of highways (MEASURE-ISOLATE).
 * The `mode` is `process` for a time in one process, and `fresh` for a time in a fresh process.
 */
export interface RecordEnv {
  readonly cpu: string;
  readonly cores: number;
  readonly os: string;
  readonly arch: string;
  readonly node: string;
  readonly mode: string;
  readonly context?: string;
}

/** The suffix of the id of the A/A arm. */
export const AA_SUFFIX = "~aa";

/** This function gives the id of the A/A arm of a base. */
export const aaId = (base: string): string => `${base}${AA_SUFFIX}`;

/** This function gives the computer of this process. The runner comes from `BENCH_RUNNER`, else `RUNNER_NAME`. */
export function pairedEnv(): PairedEnv {
  const all = cpus();
  const runner = process.env["BENCH_RUNNER"] || process.env["RUNNER_NAME"];
  return {
    cpu: all[0]?.model.trim() || "unknown",
    cores: all.length,
    os: platform(),
    arch: arch(),
    node: process.version,
    ...(runner ? { runner } : {}),
  };
}

/** This function gives the context of this process: `BENCH_MODE`, else `ci` in CI and `local` on other computers, then the flags of Node.js. */
export function pairedContext(): string {
  const where = process.env["BENCH_MODE"] || (process.env["CI"] ? "ci" : "local");
  return [where, ...process.execArgv].join(" ");
}

/** This function gives the computer and the mode of a timing record. Each script of highways names its environment with it. */
export function envOf(mode: Mode): RecordEnv {
  const { cpu, cores, os, arch: a, node } = pairedEnv();
  return { cpu, cores, os, arch: a, node, mode, context: pairedContext() };
}

/**
 * This function gives the order of the arms in one round, as indexes into the arms. The arm 0 is the base.
 *
 * - Mode `process`: the order of the arms, reversed in each odd round (ABBA).
 * - Mode `fresh` with the order `rotate`: the order of the arms, rotated by the index of the round.
 * - Mode `fresh` with the order `turn`: the base first in an even round and last in an odd round. The other arms rotate by half the round.
 */
export function armOrder(arms: number, round: number, mode: Mode, order: Order = "rotate"): number[] {
  const at = Array.from({ length: arms }, (_, i) => i);
  if (mode === "process") return round % 2 === 1 ? at.reverse() : at;
  if (order === "turn" && arms > 1) {
    const others = at.slice(1);
    const shift = Math.floor(round / 2) % others.length;
    const turned = [...others.slice(shift), ...others.slice(0, shift)];
    return round % 2 === 0 ? [0, ...turned] : [...turned, 0];
  }
  const shift = arms === 0 ? 0 : round % arms;
  return [...at.slice(shift), ...at.slice(0, shift)];
}

/**
 * This function gives the first arm of a pair in the round `k` of a report. It gives `a` for the base and `b` for the other arm.
 * It uses the mode, the order and the round offset of the report. The order `turn` uses the global round `roundOffset + k`.
 */
export function firstOf(report: PairedReport, k: number, baseAt: number, armAt: number): "a" | "b" {
  const turn = report.order === "turn";
  const round = turn ? (report.roundOffset ?? 0) + k : k;
  const order = armOrder(report.arms.length, round, report.mode, turn ? "turn" : "rotate");
  return order.indexOf(baseAt) < order.indexOf(armAt) ? "a" : "b";
}

/**
 * This function gives the quantile `q` of a list, with a linear interpolation between the two nearest values. An empty list gives NaN.
 * This copy stays. The nearest home method is `quantile(values, q, "linear")` of `@mark1russell7/rigor-statistics`, with the same values for finite lists.
 * The home throws for an empty list and for a NaN. Some callers give a NaN for a missing median, and this copy does not throw.
 * With `Infinity` at a rank that it reads, this copy can give `NaN`, and the home gives `Infinity`. For -0, this copy gives 0.
 */
export function quantileOf(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (at - low);
}

/** This function gives the mean of a list. An empty list gives NaN. */
const meanOf = (values: readonly number[]): number => (values.length === 0 ? Number.NaN : values.reduce((a, b) => a + b, 0) / values.length);

/** This function gives the sample SD (n - 1) of a list. Fewer than 2 values give 0. */
function sampleSD(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = meanOf(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

/** This function checks the options, and gives the arms with the A/A arm after the other arms. It throws a `RangeError` for a bad option. */
function armsOf<I>(o: PairedOptions<I>): Arm<I>[] {
  if (!Number.isInteger(o.repeats) || o.repeats < 1) throw new RangeError("The repeats are a whole number of 1 or more.");
  const warmup = o.warmup ?? 1;
  if (!Number.isInteger(warmup) || warmup < 0) throw new RangeError("The warm-up runs are a whole number of 0 or more.");
  const base = o.arms[0];
  if (base === undefined) throw new RangeError("A paired time run needs a base arm.");
  const arms = o.aa === false ? [...o.arms] : [...o.arms, { ...base, id: aaId(base.id) }];
  if (arms.length < 2) throw new RangeError("A paired time run needs 2 arms or more, with the A/A arm.");
  if (new Set(arms.map((a) => a.id)).size !== arms.length) throw new RangeError("The ids of the arms are not unique.");
  for (const a of arms) {
    if (o.mode === "process" && a.run === undefined) throw new RangeError(`The arm ${a.id} has no run for mode process.`);
    if (o.mode === "fresh" && (a.command === undefined || a.command.length === 0)) throw new RangeError(`The arm ${a.id} has no command for mode fresh.`);
  }
  if (o.inputs.length === 0) throw new RangeError("A paired time run needs 1 input or more.");
  if (new Set(o.inputs.map((i) => i.id)).size !== o.inputs.length) throw new RangeError("The ids of the inputs are not unique.");
  return arms;
}

/** The raw times of a run, before the statistics: for each input, the times and the memory peaks of each arm. */
export interface RawTimes {
  readonly ms: Map<string, Map<string, number[]>>;
  readonly peak: Map<string, Map<string, number>>;
}

/** This function makes empty raw times for the inputs and the arms. */
function rawOf(inputs: readonly { readonly id: string }[], arms: readonly { readonly id: string }[]): RawTimes {
  const ms = new Map(inputs.map((i) => [i.id, new Map(arms.map((a) => [a.id, [] as number[]]))]));
  return { ms, peak: new Map(inputs.map((i) => [i.id, new Map<string, number>()])) };
}

/** This function gives the statistics of the ratios of one arm. The band is [p10, p90] of the A/A arm. */
function ratioOf(rows: readonly { readonly group?: string; readonly ratio: number }[], band: { readonly p10: number; readonly p90: number } | undefined): PairedRatio {
  const values = rows.map((r) => r.ratio);
  const byGroup = new Map<string, number[]>();
  for (const r of rows) {
    const key = r.group ?? "all";
    byGroup.set(key, [...(byGroup.get(key) ?? []), r.ratio]);
  }
  const groups: Record<string, number> = {};
  for (const key of [...byGroup.keys()].sort()) groups[key] = quantileOf(byGroup.get(key)!, 0.5);
  const medians = Object.values(groups);
  return {
    inputs: rows.length,
    median: quantileOf(values, 0.5),
    p10: quantileOf(values, 0.1),
    p90: quantileOf(values, 0.9),
    moved: band === undefined ? null : rows.length === 0 ? 0 : values.filter((v) => v < band.p10 || v > band.p90).length / rows.length,
    groups,
    groupMean: meanOf(medians),
    groupSD: sampleSD(medians),
  };
}

/**
 * This function gives the report of the raw times of a run.
 *
 * - The ratio of an input is the median of the arm over the median of the base. An input with a base median of 0 gets no ratio.
 * - With the A/A arm, the noise floor is its ratios, and `moved` of each arm uses the band [p10, p90] of the A/A ratios.
 */
export function pairedReport<I>(mode: Mode, env: PairedEnv, context: string | undefined, arms: readonly Arm<I>[], inputs: readonly Input<I>[], raw: RawTimes, run: RunFields = {}): PairedReport {
  const base = arms[0]!.id;
  const aa = arms.find((a) => a.id === aaId(base))?.id;
  const rows: PairedInput[] = inputs.map((input) => {
    const own = raw.ms.get(input.id)!;
    const ms: Record<string, number[]> = {};
    const median: Record<string, number> = {};
    for (const a of arms) {
      const times = own.get(a.id) ?? [];
      ms[a.id] = times;
      if (times.length > 0) median[a.id] = quantileOf(times, 0.5);
    }
    const ratio: Record<string, number> = {};
    const b = median[base];
    if (b !== undefined && b > 0) for (const a of arms.slice(1)) if (median[a.id] !== undefined) ratio[a.id] = median[a.id]! / b;
    const peak = raw.peak.get(input.id)!;
    return {
      id: input.id,
      ...(input.group === undefined ? {} : { group: input.group }),
      ms,
      median,
      ratio,
      ...(mode === "fresh" && peak.size > 0 ? { peakRss: Object.fromEntries(peak) } : {}),
    };
  });
  const rowsOf = (id: string) => rows.filter((r) => r.ratio[id] !== undefined).map((r) => ({ ...(r.group === undefined ? {} : { group: r.group }), ratio: r.ratio[id]! }));
  const floor = aa === undefined ? undefined : ratioOf(rowsOf(aa), undefined);
  const band = floor === undefined ? undefined : { p10: floor.p10, p90: floor.p90 };
  const ratios: Record<string, PairedRatio> = {};
  for (const a of arms.slice(1)) ratios[a.id] = ratioOf(rowsOf(a.id), band);
  return {
    schema: "paired-time/1",
    mode,
    ...(context === undefined ? {} : { context }),
    ...(run.job === undefined ? {} : { job: run.job }),
    ...(run.roundOffset === undefined ? {} : { roundOffset: run.roundOffset }),
    ...(run.order === undefined ? {} : { order: run.order }),
    env,
    base,
    arms: arms.map((a) => a.id),
    inputs: rows,
    ratios,
    noiseFloor: floor === undefined ? null : { median: floor.median, p10: floor.p10, p90: floor.p90 },
  };
}

/** This function reads the last line of the stdout of a child: `{"ms": n, "peakRss"?: bytes}`. A line with no finite `ms` is an error. */
export function childResult(stdout: string): ChildResult {
  const line = stdout.trim().split(/\r?\n/).at(-1) ?? "";
  let value: { ms?: unknown; peakRss?: unknown };
  try {
    value = JSON.parse(line) as { ms?: unknown; peakRss?: unknown };
  } catch {
    throw new Error(`The child gave no line {"ms": n}: ${line}`);
  }
  if (typeof value?.ms !== "number" || !Number.isFinite(value.ms)) throw new Error(`The child gave no line {"ms": n}: ${line}`);
  return typeof value.peakRss === "number" ? { ms: value.ms, peakRss: value.peakRss } : { ms: value.ms };
}

/** This function starts a child with the child protocol, and gives its result. A child that exits with a code other than 0 is an error. */
function startProcess(command: readonly string[], input: string, warmup: number): Promise<ChildResult> {
  const argv = [...command, "--input", input, "--warmup", String(warmup)];
  return new Promise((done, fail) => {
    const child = spawn(argv[0]!, argv.slice(1), { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (out += chunk));
    child.on("error", fail);
    child.on("close", (code) => {
      if (code !== 0) return fail(new Error(`The child ${argv.join(" ")} exited with the code ${code}.`));
      try {
        done(childResult(out));
      } catch (error) {
        fail(error as Error);
      }
    });
  });
}

/** This function times the arms in one process: in each round, the arms in turn on each input, with the order reversed in odd rounds. */
function measureProcess<I>(o: PairedOptions<I>, arms: readonly Arm<I>[]): PairedReport {
  const clock = o.clock ?? (() => performance.now());
  const warmup = o.warmup ?? 1;
  const raw = rawOf(o.inputs, arms);
  for (let round = 0; round < o.repeats; round++) {
    for (const input of o.inputs) {
      for (const at of armOrder(arms.length, round, "process")) {
        const arm = arms[at]!;
        const run = arm.run!;
        for (let w = 0; w < warmup; w++) run(input.value as I);
        const start = clock();
        const out = run(input.value as I);
        raw.ms.get(input.id)!.get(arm.id)!.push(clock() - start);
        // A memory peak counts only in mode fresh: one process holds the heap of each arm.
        if (typeof out === "object" && out !== null && typeof (out as { peakRss?: unknown }).peakRss === "number")
          throw new RangeError(`The arm ${arm.id} gave a peakRss in mode process. A memory peak counts only in mode fresh.`);
      }
    }
  }
  return pairedReport("process", o.env ?? pairedEnv(), o.context ?? pairedContext(), arms, o.inputs, raw);
}

/**
 * This function times the arms with a fresh process for each arm, each input and each round.
 * With the order `rotate`, each input takes the arms rotated by the round r. The order `turn` uses the global round `roundOffset + r`.
 */
async function measureFresh<I>(o: PairedOptions<I>): Promise<PairedReport> {
  const arms = armsOf(o);
  const start = o.startChild ?? startProcess;
  const warmup = o.warmup ?? 1;
  const order = o.order ?? "rotate";
  const offset = o.roundOffset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError("The round offset is a whole number of 0 or more.");
  const raw = rawOf(o.inputs, arms);
  for (let round = 0; round < o.repeats; round++) {
    for (const input of o.inputs) {
      for (const at of armOrder(arms.length, order === "turn" ? offset + round : round, "fresh", order)) {
        const arm = arms[at]!;
        // The children run one at a time, because two children at one time change the times of each other.
        const result = await start(arm.command!, input.id, warmup);
        if (typeof result?.ms !== "number" || !Number.isFinite(result.ms)) throw new Error(`The child of the arm ${arm.id} on ${input.id} gave no time.`);
        raw.ms.get(input.id)!.get(arm.id)!.push(result.ms);
        if (result.peakRss !== undefined) {
          const peak = raw.peak.get(input.id)!;
          peak.set(arm.id, Math.max(peak.get(arm.id) ?? 0, result.peakRss));
        }
      }
    }
  }
  const run: RunFields = { ...(o.job === undefined ? {} : { job: o.job }), ...(o.roundOffset === undefined ? {} : { roundOffset: offset }), ...(o.order === undefined ? {} : { order }) };
  return pairedReport("fresh", o.env ?? pairedEnv(), o.context ?? pairedContext(), arms, o.inputs, raw, run);
}

/**
 * This function times the arms of a comparison, and gives the report of schema `paired-time/1`.
 *
 * - Mode `process` gives the report. Mode `fresh` gives a promise of the report.
 * - With `aa` (the default), the report has an A/A arm and the noise floor.
 * - A bad option throws a `RangeError`. In mode `fresh`, the promise rejects with it.
 */
export function measureIsolated<I>(options: PairedOptions<I> & { readonly mode: "process" }): PairedReport;
export function measureIsolated<I>(options: PairedOptions<I> & { readonly mode: "fresh" }): Promise<PairedReport>;
export function measureIsolated<I>(options: PairedOptions<I>): PairedReport | Promise<PairedReport>;
export function measureIsolated<I>(options: PairedOptions<I>): PairedReport | Promise<PairedReport> {
  if (options.mode === "fresh") return measureFresh(options);
  if (options.mode !== "process") throw new RangeError(`There is no mode "${String(options.mode)}". The modes are process and fresh.`);
  return measureProcess(options, armsOf(options));
}

/** The options of `runChild`. */
export interface ChildOptions {
  /** The arguments of the child. The default is `process.argv.slice(2)`. */
  readonly argv?: readonly string[];
  /** The clock, in milliseconds. The default is `performance.now`. */
  readonly clock?: () => number;
  /** The value `false` keeps `peakRss` out of the line. The default is `true`. */
  readonly peakRss?: boolean;
  /** The output of the line. The default writes it to stdout. */
  readonly write?: (line: string) => void;
}

/**
 * This function makes a script a child of mode `fresh`. It reads `--input <id> --warmup <n>` from the arguments.
 * Then `load` gives the value of the input, untimed. The warm-up runs are untimed, and the function times one run.
 * It prints the line `{"ms": n, "peakRss"?: bytes}` and gives the same result.
 */
export function runChild<I>(load: (input: string) => I, run: (value: I) => unknown, options: ChildOptions = {}): ChildResult {
  const argv = options.argv ?? process.argv.slice(2);
  const opt = (key: string): string | undefined => {
    const i = argv.indexOf(key);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const input = opt("--input");
  if (input === undefined) throw new RangeError("The child needs --input <id>.");
  const warmup = Number(opt("--warmup") ?? "1");
  if (!Number.isInteger(warmup) || warmup < 0) throw new RangeError("The child needs --warmup with a whole number of 0 or more.");
  const clock = options.clock ?? (() => performance.now());
  const value = load(input);
  for (let w = 0; w < warmup; w++) run(value);
  const start = clock();
  run(value);
  const ms = clock() - start;
  // The value maxRSS of Node.js is in kilobytes.
  const result: ChildResult = options.peakRss === false ? { ms } : { ms, peakRss: process.resourceUsage().maxRSS * 1024 };
  (options.write ?? ((line: string) => process.stdout.write(line + "\n")))(JSON.stringify(result));
  return result;
}
