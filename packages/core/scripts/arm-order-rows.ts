/**
 * This module makes the record `arm-order/1` (ARM-ORDER).
 * Mode `fresh` of `gates/paired.ts` rotates the arms by round. With 3 arms, one arm of a pair goes first in 2 of 3 rounds.
 * This read asks if the order moves a ratio. It compares the rounds where each arm of a pair goes first, with a shuffle of those labels as the control.
 * A paired record with the field `order` states the mirrored order of the bench home, and this read takes the order of a record from that field.
 */
import { armOrder as mirrored } from "@mark1russell7/rigor-bench";
import { median, quantile } from "@mark1russell7/rigor-statistics";
import { mulberry32 } from "@mark1russell7/rigor-generators";

export const SCHEMA = "arm-order/1";
export const REGENERATE =
  "node packages/core/scripts/arm-order.ts <directory of the paired records> packages/core/scripts/data/arm-order/record.json";

/** The number of shuffles of the labels. */
export const SHUFFLES = 200;

/** The seed of the shuffles. */
export const SHUFFLE_SEED = 20261105;

/** One input of a paired record of one job. */
export interface OrderInput {
  readonly id: string;
  readonly group: string;
  readonly ms: Readonly<Record<string, readonly number[]>>;
}

/** The fields of a paired record that this read uses. */
export interface OrderJob {
  readonly schema: string;
  readonly mode: string;
  /** The value `mirrored` states `armOrder` of the bench home. A record without this field rotated the arms by the round. */
  readonly order?: "mirrored";
  readonly arms: readonly string[];
  readonly env?: { readonly cpu?: string; readonly speed?: unknown };
  readonly inputs: readonly OrderInput[];
}

/** The read of one input, or of one group of inputs. */
export interface OrderRead {
  /** The median log ratio where the first arm goes first, less the median where the second arm goes first. */
  readonly difference: number;
  /** The median log ratio of all rounds, less the mean of the two medians of `difference`. */
  readonly bias: number;
}

/** The two quantiles of the size of a value over the shuffles. */
export interface ShuffleRead {
  readonly q50: number;
  readonly q95: number;
}

/** The read of one pair of arms over the inputs of one group. */
export interface OrderGroup extends OrderRead {
  readonly group: string;
  readonly inputs: number;
  readonly shuffleDifference: ShuffleRead;
  readonly shuffleBias: ShuffleRead;
}

/** The read of one pair of arms. */
export interface OrderPair {
  readonly base: string;
  readonly other: string;
  readonly whole: OrderGroup;
  readonly groups: readonly OrderGroup[];
  /** The input with the largest size of `bias`. */
  readonly largest: { readonly id: string; readonly bias: number };
}

interface InputRead extends OrderRead {
  readonly id: string;
  readonly group: string;
}

/** This function gives the arms of a round in the rotated order of mode `fresh`, as this order was when the record was made. */
export function rotatedOrder(
  arms: readonly string[],
  round: number,
): readonly string[] {
  const shift = round % arms.length;
  return [...arms.slice(shift), ...arms.slice(0, shift)];
}

/** This function gives the arms of a round of one job, by the order that the job states. */
export function orderOf(job: OrderJob, round: number): readonly string[] {
  return job.order === "mirrored"
    ? mirrored(job.arms, round)
    : rotatedOrder(job.arms, round);
}

function shuffled(labels: readonly boolean[], next: () => number): boolean[] {
  const items = [...labels];
  for (let at = items.length - 1; at > 0; at -= 1) {
    const to = Math.floor(next() * (at + 1));
    const held = items[at] as boolean;
    items[at] = items[to] as boolean;
    items[to] = held;
  }
  return items;
}

/** This function reads each input for one pair. A shuffle changes the labels inside each job and input, and keeps their counts. */
function readInputs(
  jobs: readonly OrderJob[],
  base: string,
  other: string,
  next?: () => number,
): InputRead[] {
  const pooled = new Map<
    string,
    { group: string; first: number[]; second: number[] }
  >();
  for (const job of jobs) {
    for (const input of job.inputs) {
      const x = input.ms[base];
      const y = input.ms[other];
      if (!x || !y) continue;
      const logs: { round: number; log: number }[] = [];
      for (let round = 0; round < Math.min(x.length, y.length); round += 1) {
        const a = x[round] as number;
        const b = y[round] as number;
        if (a > 0 && b > 0) logs.push({ round, log: Math.log(b / a) });
      }
      const stated = logs.map(({ round }) => {
        const order = orderOf(job, round);
        return order.indexOf(base) < order.indexOf(other);
      });
      const labels = next ? shuffled(stated, next) : stated;
      const row = pooled.get(input.id) ?? {
        group: input.group,
        first: [],
        second: [],
      };
      logs.forEach(({ log }, at) =>
        (labels[at] ? row.first : row.second).push(log),
      );
      pooled.set(input.id, row);
    }
  }
  const out: InputRead[] = [];
  for (const [id, { group, first, second }] of pooled) {
    if (first.length === 0 || second.length === 0) continue;
    const a = median(first);
    const b = median(second);
    out.push({
      id,
      group,
      difference: a - b,
      bias: median([...first, ...second]) - (a + b) / 2,
    });
  }
  return out;
}

function summary(reads: readonly InputRead[]): OrderRead {
  return {
    difference: median(reads.map((r) => r.difference)),
    bias: median(reads.map((r) => r.bias)),
  };
}

function shuffleRead(values: readonly number[]): ShuffleRead {
  return { q50: quantile(values, 0.5), q95: quantile(values, 0.95) };
}

/** This function reads one pair of arms: each group, the whole set, and the shuffles of the labels. */
export function readPair(
  jobs: readonly OrderJob[],
  base: string,
  other: string,
  shuffles = SHUFFLES,
): OrderPair {
  const reads = readInputs(jobs, base, other);
  const names = [...new Set(reads.map((r) => r.group))].sort();
  const placebo = new Map<string, { difference: number[]; bias: number[] }>();
  const add = (name: string, read: OrderRead) => {
    const row = placebo.get(name) ?? { difference: [], bias: [] };
    row.difference.push(Math.abs(read.difference));
    row.bias.push(Math.abs(read.bias));
    placebo.set(name, row);
  };
  for (let at = 0; at < shuffles; at += 1) {
    const rows = readInputs(jobs, base, other, mulberry32(SHUFFLE_SEED + at));
    add("", summary(rows));
    for (const name of names)
      add(name, summary(rows.filter((r) => r.group === name)));
  }
  const group = (name: string, rows: readonly InputRead[]): OrderGroup => ({
    group: name,
    inputs: rows.length,
    ...summary(rows),
    shuffleDifference: shuffleRead(placebo.get(name)?.difference ?? [0]),
    shuffleBias: shuffleRead(placebo.get(name)?.bias ?? [0]),
  });
  const top = reads.reduce((a, b) =>
    Math.abs(b.bias) > Math.abs(a.bias) ? b : a,
  );
  return {
    base,
    other,
    whole: group("", reads),
    groups: names.map((name) =>
      group(
        name,
        reads.filter((r) => r.group === name),
      ),
    ),
    largest: { id: top.id, bias: top.bias },
  };
}

/** This function gives the pairs of the record: the A/A pair and the head pair. */
export function pairsOf(
  arms: readonly string[],
): readonly (readonly [string, string])[] {
  const [base, head, copy] = arms;
  if (!base || !head || !copy) throw new Error("The read needs 3 arms.");
  return [
    [base, copy],
    [base, head],
  ];
}

/** This function keeps the jobs of mode `fresh` with the arms of the first job. */
export function freshJobs(jobs: readonly OrderJob[]): readonly OrderJob[] {
  const arms = jobs[0]?.arms ?? [];
  return jobs.filter(
    (job) => job.mode === "fresh" && job.arms.join() === arms.join(),
  );
}

/** This function makes the slice of the record: one input of each group, in two jobs, with a read that a test repeats. */
export function orderSlice(jobs: readonly OrderJob[]) {
  const first = jobs[0];
  if (!first) throw new Error("No job of mode fresh.");
  const ids = first.inputs
    .filter(
      (input, at, list) =>
        list.findIndex((i) => i.group === input.group) === at,
    )
    .map((input) => input.id);
  const sliceJobs: OrderJob[] = jobs
    .slice(0, 2)
    .map(({ schema, mode, arms, inputs }) => ({
      schema,
      mode,
      arms,
      inputs: inputs
        .filter((input) => ids.includes(input.id))
        .map(({ id, group, ms }) => ({ id, group, ms })),
    }));
  return {
    jobs: sliceJobs,
    pairs: pairsOf(first.arms).map(([base, other]) =>
      readPair(sliceJobs, base, other, 20),
    ),
  };
}

/** The inputs that the sentinel check reads. Each one is outside the group of the claim. */
export const SENTINELS = [
  "router:uniform-100-s0",
  "router:clustered-100-s0",
  "router:hubs-100-s0",
  "router:fanout-100-s0",
  "setup:uniform-100-s0",
  "setup:fanout-100-s0",
] as const;

/** The largest absolute log of a sentinel after the check takes off the median of its job. */
export const SHAPE_LIMIT = 0.12;

/** The largest absolute median log of the A/A pair on a sentinel. */
export const SENTINEL_AA_LIMIT = 0.16;

/** The fewest jobs on a model of the reference that give a read. */
export const SENTINEL_JOBS = 3;

/** The old arm of one job of a reference run: the median time of each sentinel. */
export interface SentinelReference {
  readonly run?: string;
  readonly cpu: string;
  readonly medians: Readonly<Record<string, number>>;
}

/** The words of the sentinel check on what it gives up. */
export const SENTINEL_LIMIT = "An even slowdown passes, so no compare of ms across runs rests on this check.";

/** The sentinel check of one job. The field `holds` is null, a no read, when the reference has no job on the model of this job. */
export interface SentinelRead {
  readonly job: number;
  readonly cpu: string;
  /** The number of jobs of the reference on this model. */
  readonly referenceJobs: number;
  /** The text `reference: one job` marks a job with a thin margin, and the text `no read` marks a job with no reference. */
  readonly note?: string;
  /** The median log of the sentinels against the reference. The check prints this value and does not judge it. */
  readonly level: number | null;
  readonly shape: number | null;
  readonly aa: number;
  readonly holds: boolean | null;
  readonly speed?: unknown;
}

/**
 * This function reads the sentinels of each job as a shape.
 * It takes the logs of a job less their own median, and the same logs of each reference job on the model. The shape is the largest distance between the job and the mean of the reference.
 * So the level of a reference job does not count, and jobs of two speeds of one model can both be in the reference.
 * An even factor on all the sentinels of a job passes, because one name of a CPU model can hold two speeds.
 * The check cannot find an even shift, so a read of times across two runs cannot rest on it.
 */
export function sentinelReads(reference: readonly SentinelReference[], jobs: readonly OrderJob[]): readonly SentinelRead[] {
  return jobs.map((job, at) => {
    const cpu = job.env?.cpu ?? "unknown";
    const known = reference.filter((r) => r.cpu === cpu);
    const inputs = SENTINELS.map((id) => {
      const input = job.inputs.find((i) => i.id === id);
      if (!input) throw new Error(`The job ${at + 1} has no sentinel ${id}.`);
      return input;
    });
    const [base, ...others] = job.arms;
    const twin = others.find((arm) => arm === `${base}~aa`);
    if (!base || !twin) throw new Error(`The job ${at + 1} has no A/A pair.`);
    const aa = Math.max(
      ...inputs.map((input) => {
        const old = input.ms[base]!;
        return Math.abs(median(input.ms[twin]!.map((ms, round) => Math.log(ms / old[round]!))));
      }),
    );
    const speed = job.env?.speed === undefined ? {} : { speed: job.env.speed };
    if (known.length === 0) return { job: at + 1, cpu, referenceJobs: 0, note: "no read", level: null, shape: null, aa, holds: null, ...speed };
    const refs = known.map((r) => {
      const logs = SENTINELS.map((id) => Math.log(r.medians[id]!));
      const own = median(logs);
      return { own, shape: logs.map((log) => log - own) };
    });
    const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
    const logs = inputs.map((input) => Math.log(median(input.ms[base]!)));
    const own = median(logs);
    const apart = logs.map((log, at) => log - own - mean(refs.map((r) => r.shape[at]!)));
    const centre = median(apart);
    const level = own - mean(refs.map((r) => r.own));
    const shape = Math.max(...apart.map((value) => Math.abs(value - centre)));
    const note = known.length === 1 ? { note: "reference: one job" } : {};
    return { job: at + 1, cpu, referenceJobs: known.length, ...note, level, shape, aa, holds: shape <= SHAPE_LIMIT && aa <= SENTINEL_AA_LIMIT, ...speed };
  });
}

/** This function gives a copy of a job with a factor on each arm of one sentinel. It is the fault of the flip of the check. */
export function sentinelFault(job: OrderJob, id: string, factor: number): OrderJob {
  return {
    ...job,
    inputs: job.inputs.map((input) =>
      input.id === id ? { ...input, ms: Object.fromEntries(Object.entries(input.ms).map(([arm, ms]) => [arm, ms.map((value) => value * factor)])) } : input,
    ),
  };
}

/** The verdict of the sentinel check over the jobs of one run. */
export interface SentinelVerdict {
  readonly verdict: "holds" | "fails";
  /** The text of the verdict. A failed run names its reason here. */
  readonly reason: string;
  readonly jobs: number;
  /** The jobs on a model with one job in the reference. */
  readonly oneJobReference: number;
  /** The jobs on a model with no job in the reference. A no read is not a hold. */
  readonly noRead: number;
  readonly limit: string;
}

/** This function gives the verdict over the jobs: it fails on one job that fails, and on fewer than `SENTINEL_JOBS` jobs with a read. */
export function sentinelVerdict(reads: readonly SentinelRead[]): SentinelVerdict {
  const failed = reads.filter((r) => r.holds === false).map((r) => r.job);
  const noRead = reads.filter((r) => r.holds === null).length;
  const counts = { jobs: reads.length, oneJobReference: reads.filter((r) => r.referenceJobs === 1).length, noRead, limit: SENTINEL_LIMIT };
  if (failed.length > 0) return { verdict: "fails", reason: `The shape or the A/A pair of job ${failed.join(", ")} is over its limit.`, ...counts };
  if (reads.length - noRead < SENTINEL_JOBS) return { verdict: "fails", reason: `${noRead} of ${reads.length} jobs have no read, because the reference has no job on their model.`, ...counts };
  return { verdict: "holds", reason: `${reads.length - noRead} of ${reads.length} jobs hold the shape.`, ...counts };
}

/** This function makes the record from the paired records of one run. */
export function orderRecord(all: readonly OrderJob[], run: string, reference: readonly SentinelReference[] = []) {
  const jobs = freshJobs(all);
  const first = jobs[0];
  if (!first) throw new Error("No job of mode fresh.");
  return {
    schema: SCHEMA,
    regenerate: REGENERATE,
    run,
    order: first.order ?? "rotated",
    arms: first.arms,
    cpu: first.env?.cpu,
    jobs: jobs.length,
    inputs: first.inputs.length,
    shuffles: SHUFFLES,
    shuffleSeed: SHUFFLE_SEED,
    pairs: pairsOf(first.arms).map(([base, other]) =>
      readPair(jobs, base, other),
    ),
    slice: orderSlice(jobs),
    sentinels: { reads: sentinelReads(reference, jobs), ...sentinelVerdict(sentinelReads(reference, jobs)) },
  };
}
