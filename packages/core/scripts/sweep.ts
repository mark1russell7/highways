// The command line of the sweep (EXPLORER-1): `node scripts/sweep.ts [--step router|room|...] [--strategy <name,...>] [--families <a,b>] [--set screen-v1]
// [--values <n>] [--name <text>] [--out sweep.json]`.
// The sweep changes one number option of a strategy at a time. The other options keep their defaults.
// The default strategies are `corners`, `trunks` and `shared`. Without `--families`, the sweep takes each family of the set.
// The values of an option come from its declaration: its marks, else `--values` values on its range (5 by default). The default value is also a value.
// The screen routes the inputs of the families with each setting. The script writes one record of the format `response-records/1` of `@mark1russell7/rigor-statistics`.
// The record has the categorical dimensions `step` and `strategy`, and one dimension for each option of each strategy.
// An option dimension has a condition on `strategy`, so it applies only to its strategy. The group of a point is its input, so one input stays in one fold.
// A strategy with no number option gets a line on stderr, and the sweep continues without it. An option with no number default also gets a line.
// Each measure also has a ratio to the value of its strategy at the defaults on the same input, for example `crossings.ratio`.
// The size of a board sets most of a raw value, so the ratio shows the effect of an option more clearly.
// The time `ms` comes from one process on one computer. It is not a paired time, so two records do not compare their times.
// The screen has no step `room`. With `--step room`, each setting starts the strategy `pipeline` of the step `whole` with the room strategy and its options (ROOM-SWEEP).
// The pipeline routes with its default router `corners`. The points have the step `room` and the name of the room strategy, so a card is `room/<name>`.
// A room record also has the 3 measures of the board of the step `whole`: the faults of the order, the displacement and the distortion of the boxes.
// The workflow `Sweep` starts it in CI. Locally, start it only on one or two small families, for example `--families tiny-uniform`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  fitResponse,
  RESPONSE_RECORDS_SCHEMA,
  type ResponseData,
  type ResponseDimension,
  type ResponseMeasure,
  type ResponsePoint,
  type ResponseReason,
  type ResponseRecord,
} from "@mark1russell7/rigor-statistics";
import { screen, SCREEN_SETS, SCREEN_STEPS, type LayoutRecord, type ScreenStep } from "../src/bench/screen/index.ts";
import { STRATEGIES } from "../src/strategies/builtins.ts";
import { getStrategy, type Step, type Strategy } from "../src/strategies/model.ts";
import { optionDefaults, sweepValues, type AnyOption, type NumberOption } from "../src/strategies/options.ts";
import { corpusInputs } from "./corpus-files.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const list = (name: string): string[] | undefined =>
  opt(name)
    ?.split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
const warn = (line: string): void => void process.stderr.write(line + "\n");

/** One measure of the record: the id in the record, the name in a screen record, the label and the unit. Lower is better for each. */
interface SweepMeasure {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly unit: string;
}

/** The measures of the routes. Each record has them. */
const ROUTE_MEASURES: readonly SweepMeasure[] = [
  { id: "crossings", key: "route.crossings", label: "Crossings", unit: "count" },
  { id: "bends", key: "route.bends", label: "Bends for each route", unit: "count" },
  { id: "length", key: "route.ink", label: "Ink length", unit: "units" },
  { id: "ms", key: "ms", label: "Time in one process", unit: "ms" },
];

/** The measures of the board that the screen of the step `whole` gives (M2, M3 and M5). A room record also has them. */
const BOARD_MEASURES: readonly SweepMeasure[] = [
  { id: "order", key: "route.room.order", label: "Pairs of boxes with a changed order", unit: "count" },
  { id: "displacement", key: "route.room.displacement", label: "Mean move of a box, over the unit of the board", unit: "no unit" },
  { id: "distortion", key: "route.room.distortion", label: "Stress of the distances to the 4 nearest boxes", unit: "0 to 1" },
];

/** The reasons of a measure with no value. */
const REASONS: readonly ResponseReason[] = [
  { id: "skipped", label: "The strategy skipped the input" },
  { id: "no-value", label: "The run gave no finite value" },
  { id: "zero-base", label: "The run at the defaults gave 0, and this run did not" },
];

/** One number option of a strategy, with its values for the sweep. */
interface SweptOption {
  readonly key: string;
  readonly declaration: NumberOption;
  readonly base: number;
  readonly values: readonly number[];
}

/** One strategy of the sweep, with its swept options. */
interface SweptStrategy {
  readonly name: string;
  readonly strategy: Strategy<Step, object>;
  readonly options: readonly SweptOption[];
}

/** One setting: the strategy and the options of the call. An empty object gives the defaults. */
interface Setting {
  readonly strategy: SweptStrategy;
  readonly options: Readonly<Record<string, number>>;
}

/** The steps of the sweep: the steps of the screen, and the step `room` through the strategy `pipeline`. */
const SWEEP_STEPS: readonly Step[] = [...SCREEN_STEPS, "room"];
const step = (opt("--step") ?? "router") as Step;
if (!SWEEP_STEPS.includes(step)) throw new Error(`The sweep has no step "${step}". The steps are ${SWEEP_STEPS.join(", ")}.`);
const isRoom = step === "room";
const MEASURES: readonly SweepMeasure[] = isRoom ? [...ROUTE_MEASURES, ...BOARD_MEASURES] : ROUTE_MEASURES;
// An empty list, for example the empty input of a workflow, gives the default routers.
const names = list("--strategy")?.length ? list("--strategy")! : ["corners", "trunks", "shared"];
const setId = opt("--set") ?? "screen-v1";
const set = SCREEN_SETS[setId];
if (!set) throw new Error(`There is no screen set "${setId}". The sets are ${Object.keys(SCREEN_SETS).join(", ")}.`);
const families = list("--families")?.length ? list("--families") : undefined;
const countText = opt("--values");
const count = countText === undefined ? undefined : Number(countText);
if (count !== undefined && (!Number.isInteger(count) || count < 2)) throw new Error(`The value of --values is not a whole number of 2 or more.`);
const out = opt("--out") ?? "sweep.json";

const isNumber = (d: AnyOption): d is NumberOption => d.type === "number" || d.type === "integer";
const inRange = (d: NumberOption, v: number): boolean => Number.isFinite(v) && v >= d.min && v <= d.max;

/**
 * This function gives the swept options of a strategy. An option needs a finite default in its range, and two values or more.
 * Each option that the sweep cannot use gets a line on stderr.
 */
function sweptOptions(strategy: Strategy<Step, object>): SweptOption[] {
  const defaults = optionDefaults(strategy) as Readonly<Record<string, unknown>>;
  const out: SweptOption[] = [];
  for (const [key, declaration] of Object.entries((strategy.schema ?? {}) as Readonly<Record<string, AnyOption>>)) {
    if (!isNumber(declaration)) continue;
    const base = defaults[key];
    if (typeof base !== "number" || !inRange(declaration, base)) {
      warn(`The sweep skips the option ${strategy.name}.${key}: it has no finite default in its range.`);
      continue;
    }
    const swept = sweepValues(declaration, count === undefined ? {} : { count }).filter((v): v is number => typeof v === "number" && inRange(declaration, v));
    const values = [...new Set([...swept, base])].sort((a, b) => a - b);
    if (values.length < 2) {
      warn(`The sweep skips the option ${strategy.name}.${key}: it has fewer than 2 values.`);
      continue;
    }
    out.push({ key, declaration, base, values });
  }
  return out;
}

const strategies: SweptStrategy[] = [];
for (const name of names) {
  const strategy = getStrategy(STRATEGIES, step, name) as Strategy<Step, object>;
  const options = sweptOptions(strategy);
  if (options.length === 0) {
    warn(`The sweep skips the strategy ${name}: it has no number option to sweep.`);
    continue;
  }
  strategies.push({ name, strategy, options });
}
if (strategies.length === 0) throw new Error(`No strategy of ${names.join(", ")} has a number option to sweep.`);

/** The id of the dimension of an option. Two strategies can have an option with the same key, so the id has the name of the strategy. */
const dimensionId = (strategy: string, key: string): string => `${strategy}.${key}`;

/** This function gives the settings of the sweep: the defaults of each strategy, and each other value of each option. */
function settings(): Setting[] {
  const out: Setting[] = [];
  for (const s of strategies) {
    out.push({ strategy: s, options: {} });
    for (const o of s.options) for (const v of o.values) if (v !== o.base) out.push({ strategy: s, options: { [o.key]: v } });
  }
  return out;
}

/** This function gives the measured value and the reason of an absent value of one measure of a screen record. */
function measureOf(record: LayoutRecord, key: string): { value: number | null; reason?: string } {
  if (record.skipped !== undefined) return { value: null, reason: "skipped" };
  const value = key === "ms" ? record.ms : record.measures[key];
  // The record keeps 4 decimals of each value, so the file stays small.
  return typeof value === "number" && Number.isFinite(value) ? { value: Number(value.toFixed(4)) } : { value: null, reason: "no-value" };
}

/** The measured values of each strategy at its defaults, by the key `<strategy>|<input>`. The ratio measures divide by them. */
const bases = new Map<string, Readonly<Record<string, number | null>>>();

/**
 * This function gives the ratio of a value to the value of its strategy at the defaults on the same input.
 * An absent ratio also gets its reason.
 * The size of a board sets most of a raw value. The ratio removes the board, so the fit sees the effect of the option.
 * Two values of 0 give the ratio 1. A value above 0 over a base of 0 gives no ratio.
 */
function ratioOf(value: number | null, base: number | null | undefined): { value: number | null; reason?: string } {
  if (value === null || base === null || base === undefined) return { value: null, reason: "no-value" };
  if (base === 0) return value === 0 ? { value: 1 } : { value: null, reason: "zero-base" };
  return { value: Number((value / base).toFixed(4)) };
}

/** This function gives the points of one setting: one point for each input of the screen. The setting of the defaults of a strategy comes first. */
function pointsOf(setting: Setting, records: readonly LayoutRecord[]): ResponsePoint[] {
  const values: Record<string, number | string | null> = { step, strategy: setting.strategy.name };
  for (const s of strategies)
    for (const o of s.options) values[dimensionId(s.name, o.key)] = s === setting.strategy ? (setting.options[o.key] ?? o.base) : null;
  const changed = Object.entries(setting.options).map(([k, v]) => `${k}=${v}`);
  return records.map((record) => {
    const measures: Record<string, number | null> = {};
    const absent: Record<string, string> = {};
    for (const m of MEASURES) {
      const { value, reason } = measureOf(record, m.key);
      measures[m.id] = value;
      if (reason !== undefined) absent[m.id] = reason;
    }
    const key = `${setting.strategy.name}|${record.input}`;
    if (changed.length === 0) bases.set(key, { ...measures });
    for (const m of MEASURES) {
      const { value, reason } = ratioOf(measures[m.id] ?? null, bases.get(key)?.[m.id]);
      measures[`${m.id}.ratio`] = value;
      if (reason !== undefined) absent[`${m.id}.ratio`] = reason;
    }
    return {
      id: `${setting.strategy.name}/${changed.length === 0 ? "defaults" : changed.join(",")}/${record.input}`,
      values,
      measures,
      group: record.input,
      ...(Object.keys(absent).length > 0 ? { absent } : {}),
    };
  });
}

/** This function gives the JSON text of a record, with each point, each model and each fold on its own line. */
function recordText(record: ResponseRecord): string {
  const { points: ps, models, folds, ...head } = record;
  const lines = (items: readonly unknown[]): string => items.map((x) => JSON.stringify(x)).join(",\n");
  const body = JSON.stringify(head).slice(0, -1);
  return `${body},\n"points":[\n${lines(ps)}\n],\n"models":[\n${lines(models)}\n],\n"folds":[\n${lines(folds)}\n]}\n`;
}

const start = performance.now();
const inputs = corpusInputs(set.id);
const points: ResponsePoint[] = [];
const all = settings();
/** This function gives the step, the strategy and the options of the screen of one setting. A room setting starts the strategy `pipeline`. */
function screenCall(setting: Setting): { step: ScreenStep; name: string; options: Readonly<Record<string, object>> } {
  const name = setting.strategy.name;
  if (!isRoom) return { step: step as ScreenStep, name, options: { [name]: setting.options } };
  return { step: "whole", name: "pipeline", options: { pipeline: { room: setting.strategy.strategy, roomOptions: setting.options } } };
}

for (const [i, setting] of all.entries()) {
  const name = setting.strategy.name;
  const call = screenCall(setting);
  const report = screen(call.step, [call.name], {
    set,
    ...(inputs ? { inputs } : {}),
    ...(families ? { families } : {}),
    baseline: false,
    options: call.options,
  });
  const records = report.records.filter((r) => r.strategy === call.name);
  if (records.length === 0) throw new Error(`The screen gave no record of ${name}. Look at the names of --families.`);
  points.push(...pointsOf(setting, records));
  warn(`${i + 1}/${all.length} ${name} ${JSON.stringify(setting.options)}: ${records.length} inputs.`);
}

// The ratio measures come first, so the first view of the explorer shows the effect of an option with no effect of the board.
// A measure with no value at each point has no model, so the record does not have it.
const ALL: readonly ResponseMeasure[] = [
  ...MEASURES.map((m): ResponseMeasure => ({ id: `${m.id}.ratio`, label: `${m.label}, ratio to the defaults`, unit: "ratio", direction: "lower" })),
  ...MEASURES.map((m): ResponseMeasure => ({ id: m.id, label: m.label, unit: m.unit, direction: "lower" })),
];
const measures: ResponseMeasure[] = [];
for (const m of ALL) {
  if (points.some((p) => p.measures[m.id] !== null)) measures.push(m);
  else warn(`The record has no measure ${m.id}: no run gave it a value.`);
}
if (measures.length === 0) throw new Error(`No run of the step ${step} gave a measure of ${MEASURES.map((m) => m.id).join(", ")}.`);
const kept = new Set(measures.map((m) => m.id));
const keptPoints = points.map((p): ResponsePoint => {
  const absent = Object.fromEntries(Object.entries(p.absent ?? {}).filter(([k]) => kept.has(k)));
  return {
    id: p.id,
    values: p.values,
    measures: Object.fromEntries(Object.entries(p.measures).filter(([k]) => kept.has(k))),
    ...(p.group === undefined ? {} : { group: p.group }),
    ...(Object.keys(absent).length > 0 ? { absent } : {}),
  };
});

const dimensions: ResponseDimension[] = [
  { id: "step", label: "Step", unit: "", kind: "categorical", levels: [step] },
  { id: "strategy", label: "Strategy", unit: "", kind: "categorical", levels: strategies.map((s) => s.name) },
  ...strategies.flatMap((s) =>
    s.options.map(
      (o): ResponseDimension => ({
        id: dimensionId(s.name, o.key),
        label: `${o.key} (${s.name})`,
        unit: "",
        kind: "continuous",
        range: [o.declaration.min, o.declaration.max],
        ...(o.declaration.scale === "log" ? { log: true } : {}),
        when: { dimension: "strategy", levels: [s.name] },
      }),
    ),
  ),
];

const data: ResponseData = {
  schema: RESPONSE_RECORDS_SCHEMA,
  name: opt("--name") ?? `${step} ${strategies.map((s) => s.name).join(", ")} on ${set.id}${families ? ` (${families.join(", ")})` : ""}`,
  dimensions,
  measures,
  reasons: REASONS,
  points: keptPoints,
};
// The times have a long tail, so their model uses a log scale. A time below 0.01 ms gets 0.01 ms.
const record = fitResponse(data, { interactions: "seen", ...(kept.has("ms") ? { log: ["ms"], logFloor: 0.01 } : {}) });
mkdirSync(dirname(out), { recursive: true });
// The record has one point on each line, so a change of a record gives a short diff.
writeFileSync(out, recordText(record));
const seconds = ((performance.now() - start) / 1000).toFixed(1);
warn(`The sweep wrote ${out}: ${strategies.length} strategies, ${dimensions.length - 2} options, ${keptPoints.length} points, ${measures.length} measures, in ${seconds} s.`);
