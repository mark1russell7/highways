// The command line of the idea queue (IDEA-QUEUE): `pnpm queue [--check | --take <id> --by <item> | --calibration]`.
// The script reads the idea records, the verdict snapshots and the list of taken ideas. It writes `docs/research/queue.json`.
// `docs/research/CATALOG.md` tells the formula, in the section "The build queue".
// With `--check`, the script writes nothing. It stops with an error when `queue.json` is old.
// With `--take`, the script freezes the predicted numbers of one idea in `queue-taken.json`, then writes the queue.
// With `--calibration`, the script writes the table of the predicted and the measured gain, and the rank correlation.
// The queue also scores the enablers: each one removes a block of ideas. The header has the back test with its bootstrap interval.
// The test `src/bench/screen/queue.test.ts` uses the same functions.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STEPS } from "../src/strategies/model.ts";
import { FAMILIES, knownMeasures, loadIdeas, loadMeas3, measureIdsIn, type Idea } from "./ideas.ts";
import { builders, strategyIdeas, type StrategyIdeas } from "./strategy-ideas.ts";

/** The version of the formula. A change of the formula changes this text. */
export const FORMULA = "queue/2";

const RESEARCH = new URL("../../../docs/research/", import.meta.url);
/** The URL of `queue.json`. */
export const QUEUE_URL = new URL("queue.json", RESEARCH);
/** The URL of the list of the taken ideas. */
export const TAKEN_URL = new URL("queue-taken.json", RESEARCH);
/** The folder of the verdict snapshots. */
export const VERDICTS_DIR = new URL("verdicts/", RESEARCH);

/** The uncertainty of each kind of idea. */
export const UNCERTAINTY: Readonly<Record<string, number>> = { ours: 1.0, hybrid: 0.85, literature: 0.7 };
/** The factor of the uncertainty when no near idea has a screen result. */
export const NOVELTY = 1.2;
/** The cost of each size of prototype. */
export const SIZE: Readonly<Record<string, number>> = { S: 1, M: 2, L: 4 };
/** A cost text that matches this pattern tells a slow idea. Its cost doubles. */
export const SLOW = /CI only|slow|100 s|60 s/i;
/** The stages of an idea that is not built. */
export const OPEN_STAGES: readonly string[] = ["cataloged", "prototyped"];
/** The number of resamples of the bootstrap interval of the back test. */
export const RESAMPLES = 2000;
/** The seed of the random numbers of the bootstrap. A fixed seed gives the same interval on each run. */
export const SEED = 1;

/** An enabler: an item that removes a block of ideas. It gets a score on the same list as the ideas. */
export interface Enabler {
  readonly id: string;
  readonly name: string;
  /** The blocks that the enabler removes. A text that ends in `:` removes each block that starts with it. */
  readonly removes: readonly string[];
  /** The size of the item: `S`, `M` or `L`, on the scale of `SIZE`. */
  readonly size: string;
}

/**
 * The enablers of the queue. Each one is an open item of `docs/ROADMAP.md`.
 * A built enabler leaves the list. `STEP-SLOTS` (#154) removed each block `step:`, so it is not on the list.
 */
export const ENABLERS: readonly Enabler[] = [{ id: "SCREEN-MEASURES", name: "The measures that the screen does not have", removes: ["measure:"], size: "L" }];

/** The fields of a verdict snapshot that the queue reads. */
export interface QueueSnapshot {
  readonly set: string;
  readonly step: string;
  readonly run: number;
  readonly rows: readonly {
    readonly strategy: string;
    readonly guard: string;
    readonly label: string;
    readonly families: readonly { readonly family: string; readonly sign: number }[];
    readonly breadth: { readonly against: number };
  }[];
}

/** One taken idea: a build took it from the queue. `predicted` holds the numbers of the queue at that time. */
export interface Taken {
  readonly id: string;
  readonly takenAt: string;
  readonly by: string;
  /** The strategy that the build made. The measured gain reads its rows in the snapshots. */
  readonly strategy?: string;
  readonly predicted: Predicted;
}

/** The numbers of a row at the time a build takes it. */
export interface Predicted {
  readonly formula: string;
  readonly gain: number;
  readonly uncertainty: number;
  readonly cost: number;
  readonly score: number;
  readonly rank: number | null;
}

/** An open target: a `better` verdict of the newest set with 1 or more families against it. */
export interface Target {
  readonly step: string;
  readonly strategy: string;
  readonly guard: string;
  /** The measure id of the guard, for example `B3` of `B3 q0.95`. */
  readonly measure: string;
  /** The families where the strategy loses. */
  readonly against: readonly string[];
}

/** The status of a row. */
export type QueueStatus = "queued" | "building" | "built";

/** One row of the queue: one idea. */
export interface QueueRow {
  readonly id: string;
  readonly name: string;
  readonly step: string;
  readonly kind: string;
  readonly wins: readonly string[];
  readonly gain: number;
  readonly uncertainty: number;
  readonly cost: number;
  readonly score: number;
  /** The rank on the joint list of the enablers and the canonical rows that are not built. A duplicate and a built row have no rank. */
  readonly rank: number | null;
  /** True when the step of the idea has a strategy slot in `STEPS`. */
  readonly slot: boolean;
  /** The id of the canonical idea of the group. It is the id of the row for a canonical idea. */
  readonly canonical: string;
  /** The reasons that block a build: `step:<step>`, `measure:<id>` or `idea:<id>`. */
  readonly blockedBy: readonly string[];
  readonly status: QueueStatus;
  readonly takenAt?: string;
  readonly predicted?: Predicted;
  /** The registered strategy that builds the idea, from `strategy-ideas.ts` or from the taken idea. */
  readonly strategy?: string;
  readonly measured?: number;
}

/** One enabler of the queue, with its score and its rank on the joint list. */
export interface EnablerRow {
  readonly id: string;
  readonly name: string;
  readonly removes: readonly string[];
  readonly cost: number;
  /** The ranked ideas that the enabler unblocks, transitively, from the first rank to the last. */
  readonly unblocks: readonly string[];
  /** The sum of the scores of the ideas that the enabler unblocks. */
  readonly sum: number;
  readonly score: number;
  readonly rank: number;
}

/** The back test of the gain, with its bootstrap interval of 95 %. */
export interface Backtest {
  readonly ideas: number;
  readonly rho: number;
  readonly low: number;
  readonly high: number;
  readonly resamples: number;
  readonly seed: number;
}

/** The queue: the header, the enablers and the rows, from the first rank to the last. */
export interface Queue {
  readonly formula: string;
  readonly date: string;
  readonly commit: string;
  readonly inputs: readonly string[];
  readonly snapshots: readonly { readonly set: string; readonly step: string; readonly run: number }[];
  readonly counts: Readonly<Record<string, unknown>>;
  readonly backtest: Backtest;
  readonly enablers: readonly EnablerRow[];
  readonly rows: readonly QueueRow[];
}

const round = (x: number): number => Math.round(x * 1000) / 1000;
const measureOf = (guard: string): string => guard.split(" ")[0]!;

/** This function reads the verdict snapshots of the folder, sorted by name. */
export function loadSnapshots(): { readonly name: string; readonly snapshot: QueueSnapshot }[] {
  return readdirSync(VERDICTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((name) => ({ name, snapshot: JSON.parse(readFileSync(new URL(name, VERDICTS_DIR), "utf8")) as QueueSnapshot }));
}

/** This function reads the list of the taken ideas. */
export function loadTaken(): Taken[] {
  return JSON.parse(readFileSync(TAKEN_URL, "utf8")) as Taken[];
}

/** This function gives the snapshots of the newest set: the last set name in the sequence of the text. */
export function newestSet(snapshots: readonly QueueSnapshot[]): QueueSnapshot[] {
  const set = [...snapshots].map((s) => s.set).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).at(-1);
  return snapshots.filter((s) => s.set === set);
}

/** This function gives the open targets of the newest set. */
export function openTargets(snapshots: readonly QueueSnapshot[]): Target[] {
  return newestSet(snapshots).flatMap((s) =>
    s.rows
      .filter((r) => r.label === "better" && r.breadth.against >= 1)
      .map((r) => ({ step: s.step, strategy: r.strategy, guard: r.guard, measure: measureOf(r.guard), against: r.families.filter((f) => f.sign === -1).map((f) => f.family) })),
  );
}

/** This function gives the gain of an idea: 1, plus 0.5 and the count of the open targets for each named win. */
export function gainOf(wins: readonly string[], targets: readonly Target[]): number {
  return round(1 + wins.reduce((sum, w) => sum + 0.5 + targets.filter((t) => t.measure === w).length, 0));
}

/**
 * This function gives the measured gain of a built strategy on the scale of the gain.
 * The value is 1, plus for each named win: 0.5 when a guard of the win is `better`, and the count of the open targets that the strategy closes.
 * The strategy closes a target of another strategy when, on the guard of the target, it wins on each family against the target.
 * It gives `undefined` when the newest set has no row of the strategy.
 */
export function measuredGain(strategy: string, wins: readonly string[], snapshots: readonly QueueSnapshot[]): number | undefined {
  const newest = newestSet(snapshots);
  const own = newest.flatMap((s) => s.rows.filter((r) => r.strategy === strategy).map((r) => ({ ...r, step: s.step })));
  if (own.length === 0) return undefined;
  const targets = openTargets(snapshots).filter((t) => t.strategy !== strategy);
  let gain = 1;
  for (const w of wins) {
    if (own.some((r) => measureOf(r.guard) === w && r.label === "better")) gain += 0.5;
    for (const t of targets.filter((x) => x.measure === w)) {
      const row = own.find((r) => r.step === t.step && r.guard === t.guard);
      if (row && t.against.every((f) => row.families.find((x) => x.family === f)?.sign === 1)) gain += 1;
    }
  }
  return round(gain);
}

/** The inputs of `buildQueue`. */
export interface QueueInput {
  readonly ideas: readonly Idea[];
  readonly snapshots: readonly QueueSnapshot[];
  readonly taken: readonly Taken[];
  /** The map from each registered strategy to the ideas that it builds. */
  readonly strategies: readonly StrategyIdeas[];
  /** The measure ids of the screen. */
  readonly measures: ReadonlySet<string>;
  readonly steps: readonly string[];
  /** The enablers that get a score on the joint list. */
  readonly enablers: readonly Enabler[];
  readonly date: string;
  readonly commit: string;
  readonly inputs: readonly string[];
}

/** This function makes the queue: one row for each idea that is not built, and one row for each taken idea that is built. */
export function buildQueue(input: QueueInput): Queue {
  const byId = new Map(input.ideas.map((r) => [r.id, r]));
  const takenBy = new Map(input.taken.map((t) => [t.id, t]));
  const builtBy = builders(input.strategies);
  const targets = openTargets(input.snapshots);
  // The near ideas of a record: its `related` and `same`, and each record that names it in `related`.
  const near = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    near.set(a, (near.get(a) ?? new Set()).add(b));
  };
  for (const r of input.ideas) {
    for (const id of [...r.related, ...(r.same ?? [])]) {
      link(r.id, id);
      link(id, r.id);
    }
  }
  const rowOf = (r: Idea): Omit<QueueRow, "rank"> => {
    const canonical = r.canonical ?? r.id;
    const novel = ![...(near.get(r.id) ?? [])].some((id) => byId.get(id)?.["result"] !== undefined);
    const gain = gainOf(r.wins, targets);
    const uncertainty = round((UNCERTAINTY[r.kind] ?? 0.85) * (novel ? NOVELTY : 1));
    const slot = input.steps.includes(r.step);
    const cost = round((SIZE[String(r["prototype"])] ?? 2) * (SLOW.test(r.cost) ? 2 : 1) * (slot ? 1 : 2) * (r.stage === "prototyped" ? 0.5 : 1));
    const missing = [...new Set([...r.wins, ...measureIdsIn(r.screen)])].filter((id) => !input.measures.has(id)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    const waiting = (r.dependsOn ?? []).filter((id) => OPEN_STAGES.includes(byId.get(id)?.stage ?? ""));
    const blockedBy = [...(slot ? [] : [`step:${r.step}`]), ...missing.map((id) => `measure:${id}`), ...waiting.map((id) => `idea:${id}`)];
    const taken = takenBy.get(canonical);
    const open = OPEN_STAGES.includes(r.stage);
    // An idea that a registered strategy builds is built, also when its stage is old.
    const strategy = taken?.strategy ?? builtBy.get(canonical);
    const status: QueueStatus = builtBy.has(canonical) || (taken !== undefined && !open) ? "built" : taken === undefined ? "queued" : "building";
    const measured = status === "built" && strategy !== undefined ? measuredGain(strategy, r.wins, input.snapshots) : undefined;
    return {
      id: r.id,
      name: r.name,
      step: r.step,
      kind: r.kind,
      wins: r.wins,
      gain,
      uncertainty,
      cost,
      score: round((gain * uncertainty) / cost),
      slot,
      canonical,
      blockedBy,
      status,
      ...(taken === undefined ? {} : { takenAt: taken.takenAt, predicted: taken.predicted }),
      ...(strategy === undefined ? {} : { strategy }),
      ...(measured === undefined ? {} : { measured }),
    };
  };
  const chosen = input.ideas.filter((r) => OPEN_STAGES.includes(r.stage) || takenBy.has(r.canonical ?? r.id));
  const rows = chosen.map(rowOf);
  const ranked = rows
    .filter((r) => r.canonical === r.id && r.status !== "built")
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const scored = input.enablers.map((e) => {
    const unblocks = unblocked(e, rows).filter((id) => ranked.some((r) => r.id === id));
    const sum = round(ranked.filter((r) => unblocks.includes(r.id)).reduce((t, r) => t + r.score, 0));
    const cost = SIZE[e.size] ?? 2;
    return { id: e.id, name: e.name, removes: e.removes, cost, unblocks: ranked.filter((r) => unblocks.includes(r.id)).map((r) => r.id), sum, score: round(sum / cost) };
  });
  // The joint list: the enablers and the ranked ideas, by score, then by id.
  const joint = [...ranked, ...scored].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const rank = new Map(joint.map((r, i) => [r.id, i + 1]));
  const enablers: EnablerRow[] = scored.map((e) => ({ ...e, rank: rank.get(e.id)! })).sort((a, b) => a.rank - b.rank);
  const order = (r: { readonly id: string }): number => rank.get(r.id) ?? Number.POSITIVE_INFINITY;
  const out: QueueRow[] = rows
    .map((r) => {
      const { slot, canonical, blockedBy, status, ...rest } = r;
      const { takenAt, predicted, strategy, measured, ...head } = rest;
      // The fields of a row in the sequence of the brief: the numbers, the rank, then the state.
      return { ...head, rank: rank.get(r.id) ?? null, slot, canonical, blockedBy, status, ...(takenAt === undefined ? {} : { takenAt }), ...(predicted === undefined ? {} : { predicted }), ...(strategy === undefined ? {} : { strategy }), ...(measured === undefined ? {} : { measured }) } as QueueRow;
    })
    .sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));
  const count = (key: (r: Omit<QueueRow, "rank">) => string, list: readonly Omit<QueueRow, "rank">[]): Record<string, number> => {
    const m = new Map<string, number>();
    for (const r of list) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return Object.fromEntries([...m].sort(([a], [b]) => a.localeCompare(b)));
  };
  const canonicalRows = out.filter((r) => r.canonical === r.id);
  return {
    formula: FORMULA,
    date: input.date,
    commit: input.commit,
    inputs: input.inputs,
    snapshots: newestSet(input.snapshots).map((s) => ({ set: s.set, step: s.step, run: s.run })),
    counts: {
      rows: out.length,
      ranked: ranked.length,
      duplicates: out.length - canonicalRows.length,
      blocked: ranked.filter((r) => r.blockedBy.length > 0).length,
      blockedByStepAndMeasure: ranked.filter((r) => r.blockedBy.some((b) => b.startsWith("step:")) && r.blockedBy.some((b) => b.startsWith("measure:"))).length,
      openTargets: targets.length,
      byStatus: count((r) => r.status, canonicalRows),
      byStep: count((r) => r.step, ranked),
    },
    backtest: bootstrap(backtest(input.ideas, input.snapshots, input.strategies), RESAMPLES, SEED),
    enablers,
    rows: out,
  };
}

/** This function tells if an enabler removes a block. */
export function removes(e: Enabler, block: string): boolean {
  return e.removes.some((x) => (x.endsWith(":") ? block.startsWith(x) : block === x));
}

/**
 * This function gives the ids of the rows that an enabler unblocks, transitively.
 * A blocked row is unblocked when the enabler removes each block of it, or when the block is an idea that the enabler unblocks.
 * A row with blocks of two enablers needs both. Neither one unblocks it alone.
 */
export function unblocked(e: Enabler, rows: readonly Pick<QueueRow, "id" | "blockedBy" | "status">[]): string[] {
  const open = rows.filter((r) => r.status !== "built" && r.blockedBy.length > 0);
  const out = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of open) {
      if (out.has(r.id)) continue;
      if (r.blockedBy.every((b) => removes(e, b) || (b.startsWith("idea:") && out.has(b.slice(5))))) {
        out.add(r.id);
        grew = true;
      }
    }
  }
  return [...out].sort();
}

/** This function gives the text of `queue.json`: the header, one enabler on each line, and one row on each line. */
export function queueText(q: Queue): string {
  const { rows, enablers, ...header } = q;
  const head = JSON.stringify(header, null, 2).replace(/\n}$/, "");
  const lines = (xs: readonly unknown[]): string => xs.map((x) => `    ${JSON.stringify(x)}`).join(",\n");
  return `${head},\n  "enablers": [\n${lines(enablers)}\n  ],\n  "rows": [\n${lines(rows)}\n  ]\n}\n`;
}

/** The files that the queue reads, relative to the root of the repository. */
export function inputNames(snapshotNames: readonly string[]): string[] {
  return [
    ...FAMILIES.map((f) => `docs/research/ideas/${f}.json`),
    "docs/research/ideas/meas3.json",
    ...snapshotNames.map((n) => `docs/research/verdicts/${n}`),
    "docs/research/queue-taken.json",
    "packages/core/src/strategies/model.ts (STEPS)",
    "packages/core/scripts/strategy-ideas.ts (the strategies and their ideas)",
    "packages/core/src/bench/screen/measures.ts (MEASURES)",
  ];
}

/** This function makes the queue from the files of the repository, with the date and the commit that it gets. */
export function readQueue(date: string, commit: string): Queue {
  const snaps = loadSnapshots();
  return buildQueue({
    ideas: loadIdeas(),
    snapshots: snaps.map((s) => s.snapshot),
    taken: loadTaken(),
    strategies: strategyIdeas(),
    measures: knownMeasures(loadMeas3()).screen,
    steps: STEPS,
    enablers: ENABLERS,
    date,
    commit,
    inputs: inputNames(snaps.map((s) => s.name)),
  });
}

/** This function reads the committed `queue.json`, or gives `undefined` when it does not exist. */
export function committedQueue(): { readonly text: string; readonly queue: Queue } | undefined {
  try {
    const text = readFileSync(QUEUE_URL, "utf8").replace(/\r\n/g, "\n");
    return { text, queue: JSON.parse(text) as Queue };
  } catch {
    return undefined;
  }
}

/** This function gives the Spearman rank correlation of two lists of the same length, with the mean rank for ties. */
export function spearman(a: readonly number[], b: readonly number[]): number {
  const ranks = (xs: readonly number[]): number[] => {
    const idx = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const out = new Array<number>(xs.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
      for (let k = i; k <= j; k++) out[idx[k]![1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return out;
  };
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i]! - ma) * (rb[i]! - mb);
    da += (ra[i]! - ma) ** 2;
    db += (rb[i]! - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** This function gives the calibration table as Markdown: each built row with its predicted and measured gain, and the rank correlation for 5 rows or more. */
export function calibrationText(q: Queue): string {
  const built = q.rows.filter((r) => r.status === "built" && r.canonical === r.id);
  const lines = ["| Idea | Taken | Predicted gain | Predicted score | Measured gain |", "|---|---|---:|---:|---:|"];
  for (const r of built) lines.push(`| \`${r.id}\` | ${r.takenAt ?? ""} | ${r.predicted?.gain ?? ""} | ${r.predicted?.score ?? ""} | ${r.measured ?? ""} |`);
  const pairs = built.filter((r) => r.predicted !== undefined && r.measured !== undefined);
  const rho = pairs.length >= 5 ? spearman(pairs.map((r) => r.predicted!.gain), pairs.map((r) => r.measured!)).toFixed(2) : "not yet: fewer than 5 built ideas";
  return `${lines.join("\n")}\n\nThe rank correlation of the predicted and the measured gain: ${rho} (${pairs.length} built ideas).\n`;
}

/** One pair of the back test: an idea with a screen result from before the queue. */
export interface BacktestPair {
  readonly id: string;
  readonly strategy: string;
  readonly predicted: number;
  readonly measured: number;
}

/**
 * This function gives the back test: the gain formula on the canonical ideas with a screen result from before the queue.
 * The strategy of an idea comes from `strategy-ideas.ts`. The predicted gain does not count the open targets of the strategy itself.
 */
export function backtest(ideas: readonly Idea[], snapshots: readonly QueueSnapshot[], strategies: readonly StrategyIdeas[]): BacktestPair[] {
  const builtBy = builders(strategies);
  const targets = openTargets(snapshots);
  const out: BacktestPair[] = [];
  for (const r of ideas) {
    const strategy = builtBy.get(r.id);
    if (r.canonical !== undefined || r["result"] === undefined || strategy === undefined) continue;
    const measured = measuredGain(strategy, r.wins, snapshots);
    if (measured === undefined) continue;
    out.push({ id: r.id, strategy, predicted: gainOf(r.wins, targets.filter((t) => t.strategy !== strategy)), measured });
  }
  return out;
}

/** This function gives a list of random numbers from 0 to 1 (mulberry32). The same seed gives the same list. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * This function gives the rank correlation of the back test and its percentile bootstrap interval of 95 %.
 * Each resample takes as many pairs as the back test has, with replacement.
 */
export function bootstrap(pairs: readonly BacktestPair[], resamples: number, seed: number): Backtest {
  const rho = (xs: readonly BacktestPair[]): number => spearman(xs.map((p) => p.predicted), xs.map((p) => p.measured));
  const next = random(seed);
  const values: number[] = [];
  for (let i = 0; i < resamples; i++) values.push(rho(Array.from({ length: pairs.length }, () => pairs[Math.floor(next() * pairs.length)]!)));
  values.sort((a, b) => a - b);
  const at = (q: number): number => values[Math.min(values.length - 1, Math.max(0, Math.ceil(q * values.length) - 1))] ?? 0;
  return { ideas: pairs.length, rho: round(rho(pairs)), low: round(at(0.025)), high: round(at(0.975)), resamples, seed };
}

/** This function gives the line of the back test as Markdown. */
export function backtestText(b: Backtest): string {
  return `The back test: ${b.ideas} ideas with a screen result from before the queue. The rank correlation of the predicted and the measured gain is ${b.rho.toFixed(2)}, with a bootstrap interval of 95 % from ${b.low.toFixed(2)} to ${b.high.toFixed(2)} (${b.resamples} resamples).\n`;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const head = (): string => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const old = committedQueue();
  if (process.argv.includes("--check")) {
    const text = queueText(readQueue(old?.queue.date ?? "", old?.queue.commit ?? ""));
    if (old?.text !== text) {
      console.error("queue.json is old. Run `pnpm queue`.");
      process.exit(1);
    }
  } else if (process.argv.includes("--calibration")) {
    console.log(calibrationText(readQueue(old?.queue.date ?? "", old?.queue.commit ?? "")));
    console.log(backtestText(bootstrap(backtest(loadIdeas(), loadSnapshots().map((s) => s.snapshot), strategyIdeas()), RESAMPLES, SEED)));
  } else {
    const take = argOf("--take");
    if (take !== undefined) {
      const by = argOf("--by");
      if (by === undefined) throw new Error("--take needs --by <item>.");
      const row = readQueue(today(), head()).rows.find((r) => r.id === take);
      if (!row) throw new Error(`${take} is not in the queue.`);
      if (row.canonical !== row.id) throw new Error(`${take} is a duplicate. Take its canonical ${row.canonical}.`);
      const all = loadTaken();
      const before = all.find((t) => t.id === take);
      const strategy = argOf("--strategy") ?? before?.strategy;
      // A second `--take` of the same idea keeps the frozen numbers and the date. It only sets the strategy.
      const predicted: Predicted = before?.predicted ?? { formula: FORMULA, gain: row.gain, uncertainty: row.uncertainty, cost: row.cost, score: row.score, rank: row.rank };
      const entry: Taken = { id: take, takenAt: before?.takenAt ?? argOf("--date") ?? today(), by, ...(strategy === undefined ? {} : { strategy }), predicted };
      const next = [...all.filter((t) => t.id !== take), entry].sort((a, b) => a.id.localeCompare(b.id));
      writeFileSync(TAKEN_URL, `${JSON.stringify(next, null, 2)}\n`);
    }
    // The date and the commit change only when the rows or the counts change.
    const same = old !== undefined && queueText(readQueue(old.queue.date, old.queue.commit)) === old.text;
    const q = same ? old.queue : readQueue(today(), head());
    if (!same) writeFileSync(QUEUE_URL, queueText(q));
    console.log(`${same ? "No change in" : "Wrote"} ${fileURLToPath(QUEUE_URL)}: ${q.rows.length} rows, ${String(q.counts["ranked"])} ranked.`);
  }
}
