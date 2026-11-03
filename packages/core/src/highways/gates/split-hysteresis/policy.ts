// The split and merge policy with hysteresis of the gate `split-hysteresis`, for links between two ends.
//
// The caller gives one reading for each evaluation. A link splits when a split condition holds for `pressEvaluations` evaluations in a row.
// It merges again when the merge condition holds for `mergeEvaluations` evaluations in a row.
// The merge condition is harder than the split condition, so a link does not flicker.
// The function is pure. It does not change the reading or the memory, and it gives a new memory.

/** The reading of one end of a link, at one evaluation. */
export interface EndReading {
  readonly id: string;
  /** The current size of the end. */
  readonly size: number;
  /** The rest size of the end: its size with no pressure. */
  readonly restSize: number;
  /** The least usable size of the end. The value 0 gives no least size. */
  readonly minSize: number;
  /** The current pressure on the end, in the units of `yieldPressure`. */
  readonly pressure: number;
}

/**
 * The closure of a link: how well the link holds its two ends together.
 * The link cannot close when `need` is above 0 and `value` is below `unclosed * need`.
 */
export interface Closure {
  /** The current value. A value below 0 tells that the ends do not touch. */
  readonly value: number;
  /** The least value that the link asks for. A value of 0 or less asks for nothing. */
  readonly need: number;
}

/** The reading of one link, at one evaluation. */
export interface LinkReading {
  /** This id is stable from evaluation to evaluation. The memory keeps the timers by this id. */
  readonly id: string;
  /** The id of the first end. */
  readonly a: string;
  /** The id of the second end. */
  readonly b: string;
  /** The rank of the link. The policy reads the links in this order. A tie of two candidates goes to the higher rank. */
  readonly order: number;
  /** A forced link splits at its first evaluation and does not merge again. */
  readonly forced?: boolean;
  /** The closure of the link. A link without a closure does not split by closure. */
  readonly closure?: Closure;
}

/** The input of one evaluation. */
export interface Reading {
  readonly ends: readonly EndReading[];
  readonly links: readonly LinkReading[];
  /** An end with a pressure above this value is pressed. */
  readonly yieldPressure: number;
  /**
   * The total demand of the system. A split keeps the demand of its evaluation.
   * The link merges only after the demand drops below that value. A reading without a demand does not use this rule.
   */
  readonly demand?: number;
}

/**
 * The reason of a split.
 *
 * - `forced`: the link is forced.
 * - `unclosed`: the link did not close for `pressEvaluations` evaluations in a row.
 * - `undersize`: an end was below its least size, with a high pressure, for `pressEvaluations` evaluations in a row.
 */
export type SplitReason = "forced" | "unclosed" | "undersize";

/** The record of one split link. */
export interface SplitRecord {
  /** The index of the evaluation that split the link, from 0. */
  readonly since: number;
  readonly forced: boolean;
  readonly reason: SplitReason;
  /** The demand of the evaluation that split the link, when the reading had a demand. */
  readonly demand?: number;
}

/** The memory of the policy between two evaluations. */
export interface SplitMemory {
  /** The count of the evaluations before this one. The next evaluation has this index. */
  readonly evaluations: number;
  /** This map gives, for each link that is not split, the count of the evaluations in a row with a split condition. */
  readonly pressed: ReadonlyMap<string, number>;
  /** This map gives, for each split link, the count of the evaluations in a row with the merge condition. */
  readonly relaxed: ReadonlyMap<string, number>;
  /** The split links. */
  readonly split: ReadonlyMap<string, SplitRecord>;
}

/** One split of an evaluation. */
export interface SplitEvent {
  readonly id: string;
  readonly reason: SplitReason;
  readonly forced: boolean;
}

/** The changes of one evaluation. */
export interface Decision {
  /** The links that split at this evaluation, in the order that the policy applied them. */
  readonly split: readonly SplitEvent[];
  /** The links that merged at this evaluation, in the order of the links. */
  readonly merged: readonly string[];
}

/** The result of one evaluation. */
export interface Evaluation {
  readonly memory: SplitMemory;
  readonly decision: Decision;
}

/** The options of the policy. */
export interface SplitOptions {
  /** A split condition must hold for this count of evaluations in a row. */
  readonly pressEvaluations: number;
  /** The merge condition must hold for this count of evaluations in a row. This value must be more than `pressEvaluations`. */
  readonly mergeEvaluations: number;
  /** A merge needs each end at `mergeSize * restSize` or more. */
  readonly mergeSize: number;
  /** A merge needs each end below `relief * yieldPressure`. */
  readonly relief: number;
  /** A link cannot close when its closure value is below `unclosed * need`. The value 0 tells that the ends do not touch. */
  readonly unclosed: number;
  /** The least drop of the demand that counts for a merge. */
  readonly demandDrop: number;
}

/** The default options, for a caller that evaluates on each frame of an animation. */
export const SPLIT_DEFAULTS: Readonly<SplitOptions> = Object.freeze({
  pressEvaluations: 45,
  mergeEvaluations: 60,
  mergeSize: 0.9,
  relief: 0.7,
  unclosed: 0,
  demandDrop: 1e-6,
});

/** The rank of each reason among the candidates of one evaluation. A higher rank goes first. */
const REASON_RANK: Readonly<Record<SplitReason, number>> = Object.freeze({ forced: 2, unclosed: 1, undersize: 0 });

/** This function compares two strings by their UTF-16 code units. */
const byCode = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

/** This function checks the options. It throws a `RangeError` for a bad value. */
export function checkSplitOptions(o: SplitOptions): void {
  for (const k of ["pressEvaluations", "mergeEvaluations"] as const)
    if (!(Number.isInteger(o[k]) && o[k] >= 1)) throw new RangeError(`The option ${k} must be a whole number of 1 or more, not ${String(o[k])}.`);
  if (!(o.mergeEvaluations > o.pressEvaluations)) throw new RangeError(`The option mergeEvaluations (${o.mergeEvaluations}) must be more than pressEvaluations (${o.pressEvaluations}).`);
  for (const k of ["mergeSize", "relief"] as const) if (!(o[k] > 0 && o[k] <= 1)) throw new RangeError(`The option ${k} must be above 0 and at most 1, not ${String(o[k])}.`);
  for (const k of ["unclosed", "demandDrop"] as const) if (!(Number.isFinite(o[k]) && o[k] >= 0)) throw new RangeError(`The option ${k} must be a finite number of 0 or more, not ${String(o[k])}.`);
}

/** This function gives an empty memory. */
export function newSplitMemory(): SplitMemory {
  return { evaluations: 0, pressed: new Map(), relaxed: new Map(), split: new Map() };
}

/** This function gives the memory without the timers and the split record of one link. It does not count an evaluation. */
export function forgetLink(memory: SplitMemory, id: string): SplitMemory {
  const pressed = new Map(memory.pressed);
  const relaxed = new Map(memory.relaxed);
  const split = new Map(memory.split);
  pressed.delete(id);
  relaxed.delete(id);
  split.delete(id);
  return { evaluations: memory.evaluations, pressed, relaxed, split };
}

interface Candidate {
  readonly link: LinkReading;
  readonly reason: SplitReason;
  readonly score: number;
}

/**
 * This function does one evaluation of the policy. It gives the new memory, and the splits and the merges of the evaluation.
 *
 * - The policy finds the ends by their ids, not by their places in `reading.ends`. It does not judge a link with an unknown end.
 * - The policy reads the links by `order`, with ties by id. Thus the order of `reading.links` has no effect.
 * - Each timer counts evaluations. The policy reads no clock.
 * - No end gets two splits in one evaluation. The candidate with the higher reason rank goes first.
 *   Next comes the candidate with the larger shortfall, and last the candidate with the higher order.
 * - The policy drops the timers of a link that is not in the reading. Its split record stays until `forgetLink`.
 *
 * The function throws a `RangeError` for a repeated end id or link id, or for a bad option.
 */
export function decideSplits(reading: Reading, memory: SplitMemory, options: Partial<SplitOptions> = {}): Evaluation {
  const o: SplitOptions = { ...SPLIT_DEFAULTS, ...options };
  checkSplitOptions(o);
  const at = memory.evaluations;
  const pressed = new Map(memory.pressed);
  const relaxed = new Map(memory.relaxed);
  const split = new Map(memory.split);
  const splits: SplitEvent[] = [];
  const merged: string[] = [];

  const ends = new Map<string, EndReading>();
  for (const e of reading.ends) {
    if (ends.has(e.id)) throw new RangeError(`The reading has the end "${e.id}" two times.`);
    ends.set(e.id, e);
  }
  const links = [...reading.links].sort((x, y) => x.order - y.order || byCode(x.id, y.id));
  const live = new Set<string>();
  for (const l of links) {
    if (live.has(l.id)) throw new RangeError(`The reading has the link "${l.id}" two times.`);
    live.add(l.id);
  }

  const y = reading.yieldPressure;
  const candidates: Candidate[] = [];
  for (const l of links) {
    if (l.forced === true) {
      pressed.delete(l.id);
      relaxed.delete(l.id);
      if (!split.has(l.id)) {
        split.set(l.id, { since: at, forced: true, reason: "forced" });
        splits.push({ id: l.id, reason: "forced", forced: true });
      }
      continue;
    }
    const A = ends.get(l.a);
    const B = ends.get(l.b);
    if (A === undefined || B === undefined) {
      pressed.delete(l.id);
      relaxed.delete(l.id);
      continue;
    }
    const record = split.get(l.id);
    if (record !== undefined) {
      // The merge needs both ends at their size again and with a low pressure, and a drop of the demand since the split.
      // The relief of the split itself does not count. Else the link splits and merges in a loop.
      const demandOk = record.demand === undefined || reading.demand === undefined || reading.demand <= record.demand - o.demandDrop;
      const calm =
        demandOk &&
        A.size >= o.mergeSize * A.restSize &&
        B.size >= o.mergeSize * B.restSize &&
        A.pressure < o.relief * y &&
        B.pressure < o.relief * y;
      if (!calm) {
        relaxed.delete(l.id);
        continue;
      }
      const n = (relaxed.get(l.id) ?? 0) + 1;
      if (n >= o.mergeEvaluations) {
        split.delete(l.id);
        relaxed.delete(l.id);
        pressed.delete(l.id);
        merged.push(l.id);
      } else relaxed.set(l.id, n);
      continue;
    }
    const underA = A.minSize > 0 && A.size < A.minSize && A.pressure > y;
    const underB = B.minSize > 0 && B.size < B.minSize && B.pressure > y;
    const c = l.closure;
    const open = c !== undefined && c.need > 0 && c.value < o.unclosed * c.need;
    if (!underA && !underB && !open) {
      pressed.delete(l.id);
      continue;
    }
    const n = (pressed.get(l.id) ?? 0) + 1;
    pressed.set(l.id, n);
    if (n < o.pressEvaluations) continue;
    if (open) candidates.push({ link: l, reason: "unclosed", score: (c.need - c.value) / c.need });
    else {
      const short = (e: EndReading, under: boolean): number => (under ? (e.minSize - e.size) / e.minSize : 0);
      candidates.push({ link: l, reason: "undersize", score: Math.max(short(A, underA), short(B, underB)) });
    }
  }

  for (const k of [...pressed.keys()]) if (!live.has(k)) pressed.delete(k);
  for (const k of [...relaxed.keys()]) if (!live.has(k)) relaxed.delete(k);

  candidates.sort(
    (x, z) => REASON_RANK[z.reason] - REASON_RANK[x.reason] || z.score - x.score || z.link.order - x.link.order || byCode(z.link.id, x.link.id),
  );
  const relieved = new Set<string>();
  for (const c of candidates) {
    if (relieved.has(c.link.a) || relieved.has(c.link.b)) continue;
    split.set(c.link.id, { since: at, forced: false, reason: c.reason, ...(reading.demand === undefined ? {} : { demand: reading.demand }) });
    pressed.delete(c.link.id);
    splits.push({ id: c.link.id, reason: c.reason, forced: false });
    relieved.add(c.link.a);
    relieved.add(c.link.b);
  }
  return { memory: { evaluations: at + 1, pressed, relaxed, split }, decision: { split: splits, merged } };
}
