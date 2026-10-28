// The data of the strategy cards (STRATEGY-CARDS). The build gives the registry and the committed files to these functions.
// This module has no access to the file system and to the network, so the page and the tests use the same rules.
import type { Snapshot, VerdictLabel } from "./results-data.ts";

/** This pattern finds the id of an idea record in a text, for example `HWY-031`. */
export const IDEA_ID = /\b(?:HWY|WILD|EDA|NAT|RULE)-\d{3}\b/g;

/** The map `docs/research/ideas/built.json`: the idea records that each registered strategy builds. The keys are `<step>/<name>`. */
export interface BuiltMap {
  readonly description?: string;
  /** The ideas that the strategy is. */
  readonly strategies: Readonly<Record<string, readonly string[]>>;
  /** The ideas that an option of the strategy builds, by the key of the option. */
  readonly options: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  /** The strategies with no idea record. */
  readonly noRecord: readonly string[];
}

/** One source of an idea record. */
export interface IdeaSource {
  readonly title: string;
  readonly authors: string;
  readonly year: number;
  readonly url: string;
}

/** The fields of an idea record that a card shows. `docs/research/ideas/schema.json` has all the fields. */
export interface CardRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly stage: string;
  readonly sources: readonly IdeaSource[];
  readonly mechanism: string;
  readonly math: string;
  readonly cost: string;
  readonly canonical?: string;
  readonly result?: { readonly date?: string; readonly run?: string; readonly verdict?: string; readonly note?: string };
}

/** One idea of a card, with the sentences of the record that state a guarantee. */
export interface CardIdea extends Omit<CardRecord, "result"> {
  /** The sentences of `math` and `cost` that state a guarantee. The list is empty when the record states none. */
  readonly guarantee: readonly string[];
  /** The verdict of the screen of the record, or an empty text. */
  readonly verdict: string;
}

/** A strategy as the build reads it from the registry. The values of the options are plain data. */
export interface StrategyInput {
  readonly step: string;
  readonly name: string;
  readonly describe: string;
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly schema: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/** One option of a card: its name, its type, its range and its default. */
export interface CardOption {
  readonly key: string;
  readonly type: string;
  readonly range: string;
  readonly default: string;
  readonly describe: string;
  /** The ideas that this option builds. */
  readonly ideas: readonly string[];
}

/** The verdict of a strategy on one guard measure of one set. */
export interface CardVerdict {
  readonly guard: string;
  readonly measure: string;
  readonly label: VerdictLabel;
  /** The breadth as text, for example "worse on 2 of 6". */
  readonly breadth: string;
}

/** The verdicts of a strategy on one set. */
export interface CardSet {
  readonly set: string;
  readonly base: string;
  readonly run: number;
  readonly verdicts: readonly CardVerdict[];
}

/** The time of a router strategy in the benchmark snapshot. */
export interface CardBench {
  /** The number of fixtures with a time. */
  readonly fixtures: number;
  /** The median time over the fixtures, in milliseconds. */
  readonly medianMs: number;
  /** The median of the ratio of its time to the time of `shared` on the same fixture. */
  readonly ratio: number;
}

/** The status of a strategy on its card. */
export type CardStatus = "default" | "kept" | "screened" | "dropped" | "built";

/** The statuses in the sequence of the page, with the text of each one. */
export const STATUSES: readonly { readonly id: CardStatus; readonly text: string }[] = [
  { id: "default", text: "default" },
  { id: "kept", text: "kept, opt-in" },
  { id: "screened", text: "screened" },
  { id: "dropped", text: "dropped" },
  { id: "built", text: "built, not screened" },
];

/** The default strategy of each step. The steps `highway` and `curve` have no default: a caller picks one. */
export const STEP_DEFAULTS: Readonly<Record<string, string>> = { group: "quadtree", router: "shared", room: "routes" };

/** The place of part 2 of the cards: the curves of one option at a time and the Sobol indices. */
export const SWEEPS_LINE = "Sweeps: waits for STAGE-DATA and PASS-GRID.";

/** One card: one registered strategy of one step. */
export interface StrategyCard {
  readonly step: string;
  readonly name: string;
  readonly describe: string;
  readonly status: CardStatus;
  /** The ideas that the strategy is. */
  readonly ideas: readonly string[];
  /** The ideas that its options build. */
  readonly optionIdeas: readonly string[];
  readonly options: readonly CardOption[];
  readonly sets: readonly CardSet[];
  readonly bench?: CardBench;
  /** The URL hash of the compare page with this strategy picked. */
  readonly compare: string;
}

/** The data of the strategies page. */
export interface StrategiesData {
  readonly steps: readonly string[];
  readonly cards: readonly StrategyCard[];
  /** The idea records of the cards, by id. */
  readonly ideas: Readonly<Record<string, CardIdea>>;
  /** The run and the date of the benchmark snapshot. */
  readonly bench: { readonly run?: number; readonly date?: string };
}

/** The inputs of `strategiesData`. */
export interface StrategiesInput {
  readonly steps: readonly string[];
  readonly strategies: readonly StrategyInput[];
  readonly records: readonly CardRecord[];
  readonly built: BuiltMap;
  readonly snapshots: readonly Snapshot[];
  readonly bench: readonly { readonly router: string; readonly fixture: string; readonly ms?: number }[];
  readonly benchMeta: { readonly run?: number; readonly date?: string };
}

/** A sentence that states a guarantee has one of these words: a bound to the optimum, a proof or a convergence. */
const GUARANTEE = /\b(guarantees?|guaranteed|approximation|to the optimum|optimum|NP-hard|converges?|proves?|exact solution)\b/i;

/** This function gives the sentences of `math` and `cost` of a record that state a guarantee. */
export function guaranteeOf(r: Pick<CardRecord, "math" | "cost">): string[] {
  return [r.math, r.cost].flatMap((t) => t.split(/(?<=\.)\s+/)).filter((s) => GUARANTEE.test(s));
}

/** This function gives a value of an option as text. */
export function valueText(v: unknown): string {
  if (v === undefined) return "none";
  if (typeof v === "function") return v.name ? `the function \`${v.name}\`` : "a function";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** This function gives the range of an option declaration as text. */
export function rangeText(d: Readonly<Record<string, unknown>>): string {
  switch (d["type"]) {
    case "number":
    case "integer": {
      const parts = [`${String(d["min"])} to ${String(d["max"])}`];
      if (typeof d["step"] === "number") parts.push(`step ${d["step"]}`);
      if (d["scale"] === "log") parts.push("log scale");
      if (Array.isArray(d["special"]) && d["special"].length > 0) parts.push(`also ${d["special"].map(String).join(", ")}`);
      return parts.join(", ");
    }
    case "boolean":
      return "true or false";
    case "enum":
      return (d["values"] as readonly string[]).join(", ");
    case "strategy":
      return `a strategy of the step ${String(d["step"] ?? "")}`.trim();
    default:
      return "no range";
  }
}

/** This function gives the breadth of a verdict as text, for example "worse on 2 of 6". */
export function breadthText(label: VerdictLabel, b: { readonly against: number; readonly of: number; readonly ties: number }, signs: readonly number[]): string {
  const ties = b.ties > 0 ? ` (${b.ties} ${b.ties === 1 ? "tie" : "ties"})` : "";
  if (label === "better") return `worse on ${b.against} of ${b.of}${ties}`;
  if (label === "worse") return `better on ${b.against} of ${b.of}${ties}`;
  return `wins ${signs.filter((s) => s === 1).length}, loses ${signs.filter((s) => s === -1).length} of ${b.of}`;
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** This function gives the time of each router in the benchmark snapshot, with the paired ratio to `shared`. */
export function benchTimes(rows: StrategiesInput["bench"]): Map<string, CardBench> {
  const ms = new Map<string, Map<string, number>>();
  for (const r of rows) if (typeof r.ms === "number" && Number.isFinite(r.ms)) (ms.get(r.router) ?? ms.set(r.router, new Map()).get(r.router)!).set(r.fixture, r.ms);
  const base = ms.get("shared");
  const out = new Map<string, CardBench>();
  for (const [router, byFixture] of ms) {
    const ratios = base === undefined ? [] : [...byFixture].filter(([f]) => (base.get(f) ?? 0) > 0).map(([f, t]) => t / base.get(f)!);
    out.set(router, { fixtures: byFixture.size, medianMs: Number(median([...byFixture.values()]).toPrecision(3)), ratio: ratios.length === 0 ? NaN : Number(median(ratios).toPrecision(3)) });
  }
  return out;
}

/** The order of the stages of the ideas: the first stage of this list that a linked idea has gives the status. */
const STAGE_STATUS: readonly [string, CardStatus][] = [
  ["kept", "kept"],
  ["screened", "screened"],
  ["dropped", "dropped"],
];

/** This function gives the status of a strategy from its step default, the stages of its ideas and its verdicts. */
export function statusOf(step: string, name: string, stages: readonly string[], hasVerdicts: boolean): CardStatus {
  if (STEP_DEFAULTS[step] === name) return "default";
  for (const [stage, status] of STAGE_STATUS) if (stages.includes(stage)) return status;
  return hasVerdicts ? "screened" : "built";
}

/** This function makes the data of the strategies page: one card for each strategy of the registry, in the order of the steps. */
export function strategiesData(input: StrategiesInput): StrategiesData {
  const records = new Map(input.records.map((r) => [r.id, r]));
  const times = benchTimes(input.bench);
  const used = new Set<string>();
  const cards = input.strategies.map((s): StrategyCard => {
    const key = `${s.step}/${s.name}`;
    const ideas = [...(input.built.strategies[key] ?? [])];
    const byOption = input.built.options[key] ?? {};
    const optionIdeas = [...new Set(Object.values(byOption).flat())].filter((id) => !ideas.includes(id));
    for (const id of [...ideas, ...optionIdeas]) used.add(id);
    const sets = input.snapshots
      .filter((snap) => snap.step === s.step)
      .map((snap) => ({
        set: snap.set,
        base: snap.base,
        run: snap.run,
        verdicts: snap.rows
          .filter((r) => r.strategy === s.name)
          .map((r) => ({ guard: r.guard, measure: r.measure, label: r.label, breadth: breadthText(r.label, r.breadth, r.families.map((f) => f.sign)) })),
      }))
      .filter((x) => x.verdicts.length > 0);
    const options = Object.entries(s.schema).map(([k, d]) => ({
      key: k,
      type: String(d["type"]),
      range: rangeText(d),
      default: valueText(k in s.defaults ? s.defaults[k] : d["default"]),
      describe: String(d["describe"] ?? ""),
      ideas: byOption[k] ?? [],
    }));
    const bench = s.step === "router" ? times.get(s.name) : undefined;
    const stages = ideas.map((id) => records.get(id)?.stage ?? "");
    const params = new URLSearchParams({ step: s.step, pick: s.name });
    return {
      step: s.step,
      name: s.name,
      describe: s.describe,
      status: statusOf(s.step, s.name, stages, sets.length > 0),
      ideas,
      optionIdeas,
      options,
      sets,
      ...(bench === undefined ? {} : { bench }),
      compare: `#${params.toString()}`,
    };
  });
  const ideas: Record<string, CardIdea> = {};
  for (const id of [...used].sort()) {
    const r = records.get(id);
    if (r === undefined) continue;
    const { result, ...rest } = r;
    ideas[id] = {
      id: rest.id,
      name: rest.name,
      kind: rest.kind,
      stage: rest.stage,
      sources: rest.sources.map((x) => ({ title: x.title, authors: x.authors, year: x.year, url: x.url })),
      mechanism: rest.mechanism,
      math: rest.math,
      cost: rest.cost,
      ...(rest.canonical === undefined ? {} : { canonical: rest.canonical }),
      guarantee: guaranteeOf(rest),
      verdict: result?.verdict ?? "",
    };
  }
  return { steps: input.steps, cards, ideas, bench: input.benchMeta };
}

/** This function counts the cards of each status, in the sequence of `STATUSES`. */
export function statusCounts(cards: readonly StrategyCard[]): { readonly status: CardStatus; readonly count: number }[] {
  return STATUSES.map(({ id }) => ({ status: id, count: cards.filter((c) => c.status === id).length }));
}

/** This function gives the element id of the card of a strategy, for a link `strategies.html#<id>`. */
export const cardId = (step: string, name: string): string => `s-${step}-${name}`;
