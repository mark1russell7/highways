// The strategy space of the engine `highways` (STAGE-DATA). The stages, their options and the ranges of their params are data
// of the schema `strategy-space/1` of `@mark1russell7/layout-contract`. `routeConfig` routes a config with the strategies of
// the registry. It adds no new algorithm.

import {
  canonicalConfig,
  checkConfig,
  paramValue,
  STRATEGY_SPACE_SCHEMA,
  type ParamValue,
  type SpaceConstraint,
  type SpaceParam,
  type SpaceStage,
  type StageChoice,
  type StageOption,
  type StrategyConfig,
  type StrategySpace,
} from "@mark1russell7/layout-contract";
import { ambiguityGate } from "./highways/gates/ambiguity/index.ts";
import { breakEvenGate } from "./highways/gates/breakeven/index.ts";
import { hysteresisGate } from "./highways/gates/hysteresis/index.ts";
import { stableIdGate } from "./highways/gates/ids/index.ts";
import { gateStrategy, type Gate } from "./highways/gates/model.ts";
import { stretchGate } from "./highways/gates/stretch/index.ts";
import { ARC_SOURCES } from "./highways/hub-arcs/index.ts";
import { highwayRouterStrategy } from "./highways/router.ts";
import { CANDIDATE_SOURCES } from "./highways/select/index.ts";
import type { Graph, Result } from "./model.ts";
import { MEMBER_FORMS, type MemberForm } from "./portfolio/members.ts";
import { byCollection } from "./routers/trunks.ts";
import { groupStrategies, highwayStrategies, levelStrategies, plugStrategies, routerStrategies } from "./strategies/builtins.ts";
import type { Step, Strategy } from "./strategies/model.ts";
import { optionDefaults, type AnyOption, type NumberOption } from "./strategies/options.ts";

/** The engine name of `routeSpace`. Each config of the space has it in `space`. */
const ENGINE = "highways";

/** The options of a strategy as a record. */
type Options = Record<string, unknown>;

/**
 * The code of one option of a strategy as params of a stage option.
 *
 * - `plain`: one param with the name of the option.
 * - `switch`: a `bool` param and a conditional param. The value `false` of the switch gives `off`, the special value of the option, or no value.
 * - `set`: one `bool` param for each source of a list. The list has the sources whose param is `true`, in the order of `sources`.
 */
type Codec =
  | { readonly kind: "plain"; readonly key: string; readonly param: SpaceParam }
  | { readonly kind: "switch"; readonly key: string; readonly flag: SpaceParam; readonly param: SpaceParam; readonly off: number | undefined }
  | { readonly kind: "set"; readonly key: string; readonly params: readonly SpaceParam[]; readonly sources: readonly string[] };

/** The params of a stage option and the codes of the options of its strategy. */
interface Coded {
  readonly params: readonly SpaceParam[];
  readonly codecs: readonly Codec[];
}

/** The names of the built-in functions of an option with the declaration `custom: "function"`. A function of the caller is not in the space. */
const FUNCTION_NAMES: ReadonlyMap<unknown, string> = new Map<unknown, string>([[byCollection, "collection"]]);

/** The sources of each list option that names other plans, by `<strategy>.<option>`. A list with a set of sources is one `bool` param for each source. */
const LIST_SOURCES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "select.generators": CANDIDATE_SOURCES,
  "consensus.members": CANDIDATE_SOURCES,
  "search.pool": CANDIDATE_SOURCES,
  "hub-arcs.generators": ARC_SOURCES,
});

/** The name of the param of one source of a list option. */
const sourceParam = (key: string, source: string): string => `${key}:${source}`;

/** This function gives the name with a capital first letter. */
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** This function gives the range fields of a number declaration as the fields of a `SpaceParam`. */
function rangeOf(d: NumberOption): Pick<SpaceParam, "kind" | "min" | "max" | "step" | "scale"> {
  const kind = d.type === "integer" ? "int" : "real";
  const step = d.step === undefined || (kind === "int" && d.step === 1) ? {} : { step: d.step };
  return { kind, min: d.min, max: d.max, ...step, ...(d.scale === "log" ? { scale: "log" as const } : {}) };
}

/** This function tells if a number is in the range of a declaration and on its step. */
function inRange(d: NumberOption, v: unknown): v is number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < d.min || v > d.max) return false;
  if (d.step === undefined) return true;
  const q = (v - d.min) / d.step;
  return Math.abs(q - Math.round(q)) <= 1e-9 * Math.max(1, Math.abs(q));
}

/**
 * This function gives the codes of the options of a strategy, without the keys of `skip`. It reads the declarations of the schema and the effective defaults.
 * The keys of the left-out options go into `left`, with the name of the strategy.
 */
function codecsOf(strategy: Strategy<Step, object>, skip: ReadonlySet<string>, left: string[]): Coded {
  const defaults = optionDefaults(strategy) as Options;
  const schema = (strategy.schema ?? {}) as Readonly<Record<string, AnyOption>>;
  const params: SpaceParam[] = [];
  const codecs: Codec[] = [];
  for (const [key, d] of Object.entries(schema)) {
    if (skip.has(key)) continue;
    const v = defaults[key];
    if (d.type === "number" || d.type === "integer") {
      if (d.values !== undefined) {
        const param: SpaceParam = { name: key, kind: "enum", values: [...d.values], default: v as number };
        params.push(param);
        codecs.push({ kind: "plain", key, param });
        continue;
      }
      const special = (d.special ?? []).find((s) => !Number.isFinite(s));
      if (special === undefined && inRange(d, v)) {
        const param: SpaceParam = { name: key, ...rangeOf(d), default: v };
        params.push(param);
        codecs.push({ kind: "plain", key, param });
        continue;
      }
      // An infinite limit or an option without a default: a `bool` switch and a conditional param.
      const on = inRange(d, v);
      const flag: SpaceParam = { name: `${special === undefined ? "set" : "limit"}${capital(key)}`, kind: "bool", default: on };
      const fallback = [d.default, ...(d.marks ?? []), d.min].find((x) => inRange(d, x)) as number;
      const param: SpaceParam = { name: key, ...rangeOf(d), default: on ? v : fallback, when: { param: flag.name, in: [true] } };
      params.push(flag, param);
      codecs.push({ kind: "switch", key, flag, param, off: special });
      continue;
    }
    if (d.type === "boolean") {
      const param: SpaceParam = { name: key, kind: "bool", default: (v ?? d.default ?? false) as boolean };
      params.push(param);
      codecs.push({ kind: "plain", key, param });
      continue;
    }
    if (d.type === "enum") {
      const value = typeof v === "function" ? FUNCTION_NAMES.get(v) : (v ?? d.default ?? d.values[0]);
      if (value === undefined) throw new Error(`The function of the option ${strategy.name}.${key} has no name in the space highways.`);
      const param: SpaceParam = { name: key, kind: "enum", values: [...d.values], default: value as string };
      params.push(param);
      codecs.push({ kind: "plain", key, param });
      continue;
    }
    const sources = d.type === "list" ? LIST_SOURCES[`${strategy.name}.${key}`] : undefined;
    if (sources !== undefined) {
      const chosen = new Set(v as readonly string[]);
      const own = sources.map((s): SpaceParam => ({ name: sourceParam(key, s), kind: "bool", default: chosen.has(s) }));
      params.push(...own);
      codecs.push({ kind: "set", key, params: own, sources });
      continue;
    }
    left.push(`${strategy.name}.${key}`);
  }
  return { params, codecs };
}

/** This function tells if a value of a param is its default, in the stable form of `canonicalConfig`. */
const isDefault = (p: SpaceParam, v: ParamValue | undefined): boolean => v === undefined || v === paramValue(p, p.default);

/**
 * This function gives the options of a strategy from the params of a canonical choice. An option with each param at its default stays out.
 * Thus the strategy gets its own default, with the exact value of its `defaults`.
 */
function decode(codecs: readonly Codec[], values: Readonly<Record<string, ParamValue>>): Options {
  const out: Options = {};
  for (const c of codecs) {
    if (c.kind === "plain") {
      if (!isDefault(c.param, values[c.param.name])) out[c.key] = values[c.param.name];
    } else if (c.kind === "switch") {
      const on = values[c.flag.name] === true;
      if (on === c.flag.default && (!on || isDefault(c.param, values[c.param.name]))) continue;
      if (on) out[c.key] = values[c.param.name];
      else if (c.off !== undefined) out[c.key] = c.off;
    } else {
      if (c.params.every((p) => isDefault(p, values[p.name]))) continue;
      out[c.key] = c.sources.filter((s) => values[sourceParam(c.key, s)] === true);
    }
  }
  return out;
}

/** The keys of the options that each stage takes from the options of a router. The stage `routing` holds the other keys. */
const STAGE_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  grouping: ["rule", "group", "groupOptions", "cap", "maxDepth", "collapse"],
  plugs: ["plugs", "plugGap", "plug", "plugOptions"],
  "lane-order": ["laneOrder", "stretchOrder", "siftPasses"],
  smoothing: ["smooth"],
  levels: ["levels", "level", "levelOptions"],
});

/** The options of a router that the router itself owns, as the stage options read them: the router options and the router of a plan. */
interface RoutingEntry {
  /** The strategy of the router or of the plan, at the step `router` or `highway`. */
  readonly strategy: Strategy<"router", object> | Strategy<"highway", object>;
  readonly coded: Coded;
  /** The stages that the router reads, by name. */
  readonly reads: ReadonlySet<string>;
}

/** The keys of the declarations of a strategy. */
const keysOf = (s: Strategy<Step, object>): Set<string> => new Set(Object.keys(s.schema ?? {}));

/** This function gives the stages that a router reads, from the keys of its declarations. */
function readsOf(s: Strategy<Step, object>): Set<string> {
  const schema = (s.schema ?? {}) as Readonly<Record<string, AnyOption>>;
  const out = new Set<string>();
  // An option `rule` with built-in names is a key of the edges. An option `group` of the type `strategy` is a tree of sections.
  if (schema["rule"]?.type === "enum" && (schema["rule"] as { custom?: string }).custom === "function") out.add("grouping");
  if (schema["group"]?.type === "strategy") out.add("grouping");
  if (schema["plug"]?.type === "strategy") out.add("plugs");
  if (schema["laneOrder"] !== undefined) out.add("lane-order");
  if (schema["smooth"] !== undefined) out.add("smoothing");
  if (schema["level"]?.type === "strategy") out.add("levels");
  return out;
}

/** The options of `routeSpace` that the space does not hold, by `<strategy>.<option>`. `ROUTE_SPACE_LEFT_OUT` gives the reason of each. */
const left: string[] = [];

/** The routers of the stage `routing`: the routers of `routerStrategies` without a preset, then each highway plan without a gate. */
const ROUTING: ReadonlyMap<string, RoutingEntry> = (() => {
  const out = new Map<string, RoutingEntry>();
  const routers = [routerStrategies.straight, routerStrategies.plugs, routerStrategies.corners, routerStrategies.trunks, routerStrategies.shared, routerStrategies.sections];
  const plans = Object.values(highwayStrategies).filter((s) => !s.name.includes("+"));
  for (const s of [...routers, ...plans] as (Strategy<"router", object> | Strategy<"highway", object>)[]) {
    const reads = readsOf(s);
    const skip = new Set([...reads].flatMap((stage) => STAGE_KEYS[stage] ?? []));
    out.set(s.name, { strategy: s, coded: codecsOf(s, skip, left), reads });
  }
  return out;
})();

/** The options of the router `sections` that go with a tree of sections: `cap`, `maxDepth` and `collapse` of the quadtree of `buildSections`. */
const QUADTREE: Coded = codecsOf(
  routerStrategies.sections,
  new Set(Object.keys(routerStrategies.sections.schema ?? {}).filter((k) => !["cap", "maxDepth", "collapse"].includes(k))),
  [],
);

/** The group strategies of the stage `grouping`, besides the quadtree of `buildSections`. The strategy `keys` is the option `data-keys`. */
const GROUPS: ReadonlyMap<string, { readonly strategy: Strategy<"group", object>; readonly coded: Coded }> = new Map([
  ["kd", { strategy: groupStrategies.kd as Strategy<"group", object>, coded: codecsOf(groupStrategies.kd, new Set(), left) }],
  ["cut", { strategy: groupStrategies.cut as Strategy<"group", object>, coded: codecsOf(groupStrategies.cut, new Set(), left) }],
  ["data-keys", { strategy: groupStrategies.keys as Strategy<"group", object>, coded: codecsOf(groupStrategies.keys, new Set(), left) }],
]);

/** The option `plugGap` of the router `corners`, for the plug places `facing` and `side`. */
const PLUG_GAP: Coded = codecsOf(routerStrategies.corners, new Set([...keysOf(routerStrategies.corners)].filter((k) => k !== "plugGap")), []);

/** The plug rules of the stage `plugs`: each strategy of the step `plugs`, with the option id `rule-<name>`. */
const PLUG_RULES: ReadonlyMap<string, { readonly strategy: Strategy<"plugs", object>; readonly coded: Coded }> = new Map(
  Object.values(plugStrategies).map((s) => [`rule-${s.name}`, { strategy: s as Strategy<"plugs", object>, coded: codecsOf(s as Strategy<"plugs", object>, new Set(), left) }]),
);

/** The options of a level strategy that come from the router `sections`. The other options of the strategy are params of its option. */
const LEVEL_SHARED: ReadonlySet<string> = new Set(["margin", "k", "tightMargin", "plugInset", "throughCost", "levels"]);

/** The level rules of the stage `levels`: `depths`, the default of `sections`, then `venation` and `detail`. */
const LEVELS: ReadonlyMap<string, { readonly strategy: Strategy<"levels", object>; readonly coded: Coded }> = new Map(
  Object.values(levelStrategies).map((s) => [s.name, { strategy: s as Strategy<"levels", object>, coded: codecsOf(s as Strategy<"levels", object>, LEVEL_SHARED, []) }]),
);

/** The gates of the stage `gate`: a gate after a highway plan (`gateStrategy`). */
const GATES: ReadonlyMap<string, { readonly gate: Gate<object>; readonly coded: Coded }> = new Map(
  ([breakEvenGate, stretchGate, ambiguityGate, hysteresisGate, stableIdGate] as Gate<object>[]).map((g) => {
    const s = { step: "highway", name: g.name, describe: g.describe, defaults: g.defaults, schema: g.schema } as unknown as Strategy<"highway", object>;
    return [g.name, { gate: g, coded: codecsOf(s, new Set(), left) }];
  }),
);

/** The params of the lane order `stretch` (LANE-STRETCH): the order of each stretch of runs, and the passes of `sifting`. */
const STRETCH_PARAMS: readonly SpaceParam[] = [
  { name: "order", kind: "enum", values: ["consensus", "periphery", "sifting"], default: "sifting" },
  { name: "siftPasses", kind: "int", min: 1, max: 4, default: 2, when: { param: "order", in: ["sifting"] } },
];

/** This function gives a stage option from its id and its params. */
const option = (id: string, params: readonly SpaceParam[] = []): StageOption => ({ id, params });

/** The stages of `routeSpace`, in the order of the pipeline. */
const STAGES: readonly SpaceStage[] = [
  {
    name: "grouping",
    optional: true,
    options: [
      option("edge-key", [{ name: "rule", kind: "enum", values: ["collection", "all"], default: "collection" }]),
      option("quadtree", QUADTREE.params),
      ...[...GROUPS].map(([id, g]) => option(id, g.coded.params)),
    ],
  },
  { name: "plugs", optional: true, options: [option("facing", PLUG_GAP.params), option("side", PLUG_GAP.params), ...[...PLUG_RULES].map(([id, p]) => option(id, p.coded.params))] },
  { name: "routing", options: [...ROUTING].map(([id, r]) => option(id, r.coded.params)) },
  { name: "gate", optional: true, options: [...GATES].map(([id, g]) => option(id, g.coded.params)) },
  { name: "lane-order", optional: true, options: [option("bundle"), option("run"), option("stretch", STRETCH_PARAMS)] },
  { name: "smoothing", optional: true, options: [option("smooth")] },
  { name: "levels", optional: true, options: [...LEVELS].map(([id, l]) => option(id, l.coded.params)) },
];

/** The options of a stage, with `null` for an optional stage without an option. */
const choicesOf = (stage: SpaceStage): (string | null)[] => [...(stage.optional ? [null] : []), ...stage.options.map((o) => o.id)];

/**
 * This function gives the options of a stage that a router permits. A stage that the router does not read has only `null`.
 * A stage that the router reads has no `null`, but `gate` and `smoothing` stay optional.
 */
function permitted(id: string, r: RoutingEntry, stage: SpaceStage): (string | null)[] {
  const all = choicesOf(stage);
  const isPlan = r.strategy.step === "highway";
  switch (stage.name) {
    case "grouping":
      if (!r.reads.has("grouping")) return [null];
      return id === "sections" ? all.filter((o) => o !== null && o !== "edge-key") : ["edge-key"];
    case "plugs":
      return r.reads.has("plugs") ? all.filter((o) => o !== null) : [null];
    case "gate": {
      if (!isPlan) return [null];
      const own = new Set(Object.keys(r.strategy.defaults));
      return all.filter((o) => o === null || Object.keys(GATES.get(o)!.gate.defaults).every((k) => !own.has(k)));
    }
    case "lane-order":
      if (!r.reads.has("lane-order")) return [null];
      return all.filter((o) => o !== null && (o !== "stretch" || "stretchOrder" in (r.strategy.schema ?? {})));
    case "smoothing":
      return r.reads.has("smoothing") ? all : [null];
    case "levels":
      return r.reads.has("levels") ? all.filter((o) => o !== null) : [null];
    default:
      return all;
  }
}

/** The constraints of `routeSpace`: for each router, the options of each other stage that it does not permit. */
const CONSTRAINTS: readonly SpaceConstraint[] = (() => {
  const out: SpaceConstraint[] = [];
  for (const [id, r] of ROUTING) {
    for (const stage of STAGES) {
      if (stage.name === "routing") continue;
      const ok = permitted(id, r, stage);
      const at = { stage: "routing", option: id };
      if (ok.length === 1 && ok[0] === null) {
        out.push({ if: at, then: { stage: stage.name, option: null } });
        continue;
      }
      for (const o of choicesOf(stage)) if (!ok.includes(o)) out.push({ if: at, then: { not: { stage: stage.name, option: o } } });
    }
  }
  return out;
})();

/** This function gives the stage choice of a param list, without an empty list of params. */
const choice = (id: string, params: Readonly<Record<string, ParamValue>> = {}): StageChoice => (Object.keys(params).length === 0 ? { option: id } : { option: id, params });

/**
 * This function gives the default point of a router of the stage `routing`. Each stage that the router reads gets the option of the defaults of the router.
 * Thus the point routes as the router with no options.
 */
function pointOf(id: string, routing: Readonly<Record<string, ParamValue>> = {}, more: Readonly<Record<string, StageChoice | null>> = {}): StrategyConfig {
  const r = ROUTING.get(id)!;
  const d = optionDefaults(r.strategy) as Options;
  const stages: Record<string, StageChoice | null> = { routing: choice(id, routing) };
  if (r.reads.has("grouping")) stages["grouping"] = id === "sections" ? choice("quadtree") : choice("edge-key", d["rule"] === undefined || d["rule"] === "all" ? { rule: "all" } : {});
  if (r.reads.has("plugs")) stages["plugs"] = choice("facing");
  if (r.reads.has("lane-order")) {
    const stretch = d["stretchOrder"];
    stages["lane-order"] = stretch !== undefined && stretch !== "none" ? choice("stretch", { order: stretch as string }) : choice(d["laneOrder"] as string);
  }
  if (r.reads.has("smoothing") && d["smooth"] === true) stages["smoothing"] = choice("smooth");
  if (r.reads.has("levels")) stages["levels"] = choice("depths");
  return { space: ENGINE, stages: { ...stages, ...more } };
}

/**
 * The named points of `routeSpace`: each row of the router table of today, then the opt-in router `shared-stretch`.
 * The rows are the routers of `routerStrategies`, then each highway strategy of `highwayStrategies`.
 */
const NAMED: Readonly<Record<string, StrategyConfig>> = (() => {
  const out: Record<string, StrategyConfig> = {
    straight: pointOf("straight"),
    plugs: pointOf("plugs"),
    corners: pointOf("corners"),
    "corners-smooth": pointOf("corners", {}, { smoothing: choice("smooth") }),
    trunks: pointOf("trunks"),
    shared: pointOf("shared"),
    "shared-all": pointOf("shared", {}, { grouping: choice("edge-key", { rule: "all" }) }),
    sections: pointOf("sections"),
    "sections-tree": pointOf("sections", { limitStretch: false }),
  };
  for (const s of Object.values(highwayStrategies)) {
    const [plan, gate] = s.name.split("+") as [string, string | undefined];
    out[s.name] = pointOf(plan, {}, gate === undefined ? {} : { gate: choice(gate) });
  }
  out["shared-stretch"] = pointOf("shared", {}, { "lane-order": choice("stretch", { order: "sifting" }) });
  return out;
})();

/**
 * The strategy space of `highways`, schema `strategy-space/1`. It has 7 stages: `grouping`, `plugs`, `routing`, `gate`, `lane-order`, `smoothing` and `levels`.
 * Each row of the router table is a named point, and `routeConfig` of the point gives the routes of that router.
 *
 * - `routing` holds the 6 routers without a preset and the 61 highway plans without a gate. Each option of a router is a param, or a param of another stage.
 * - `grouping` holds the key of the edges of `trunks`, `shared`, `keys`, `shared-ways` and `soft-keys`. It also holds the tree of sections of `sections`.
 * - `plugs` holds the plugs of `corners`: the places `facing` and `side`, and each plug strategy as `rule-<name>`.
 * - `gate` holds a gate after a highway plan. A gate goes with each plan whose options do not have the keys of the gate.
 * - `lane-order` holds the lane order of the runs. The option `stretch` goes only with `shared` and `shared-ways`.
 * - `smoothing` holds the option `smooth` of the way finder. `levels` holds the level rule of `sections`.
 * - A router that does not read a stage has `null` there. The constraints keep the other options out.
 * - An infinite limit is a `bool` param `limit<Key>` and a conditional param. An option without a default is a `bool` param `set<Key>` and a conditional param.
 * - A list of other plans is one `bool` param `<key>:<source>` for each source, in the order of the sources.
 * - `portfolio` is not in the space. It is a selector over the routers.
 */
export const routeSpace: StrategySpace = Object.freeze({
  schema: STRATEGY_SPACE_SCHEMA,
  engine: ENGINE,
  version: "1",
  stages: STAGES,
  constraints: CONSTRAINTS,
  named: NAMED,
} satisfies StrategySpace);

/**
 * The options that `routeSpace` does not hold, by `<strategy>.<option>`, with the reason of each. The router gets the default of each one.
 * The options of a stage that a router reads (`rule`, `group`, `plug`, `level`, `laneOrder` and `smooth`) are params of that stage, so they are not in this list.
 */
export const ROUTE_SPACE_LEFT_OUT: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    [...new Set(left)].map((key) => {
      if (key === "soft-keys.attributes") return [key, "It is a list of the names of the number fields of the data of an edge. It is data of the input, not a choice."];
      if (key === "keys.split") return [key, "It is an object: the split of a key of the data into parts. It is data of the input, not a choice."];
      if (key === "keys.key") return [key, "It is a function of the caller. The option `data-keys` uses the default key, `byDataGroup`."];
      return [key, "It is an object or a function of the caller, without a list of named values."];
    }),
  ),
);

/**
 * The routers of the router table that are not a named point of `routeSpace`, with the reason of each. The list is empty: each router fits.
 * A test checks that each row of the table is a named point or a row of this list.
 */
export const ROUTE_SPACE_MISFITS: Readonly<Record<string, string>> = Object.freeze({});

/** This function gives the params of a canonical choice, or an empty record. */
const paramsOf = (c: StageChoice | null | undefined): Readonly<Record<string, ParamValue>> => c?.params ?? {};

/** This function gives the strategy of the stage `routing` of a canonical config, with the options of each stage, as a router strategy. */
function routerOf(config: StrategyConfig): { readonly router: Strategy<"router", object>; readonly options: Options } {
  const s = config.stages;
  const id = s["routing"]!.option;
  const r = ROUTING.get(id)!;
  const options: Options = decode(r.coded.codecs, paramsOf(s["routing"]));
  const grouping = s["grouping"];
  if (grouping?.option === "edge-key") options["rule"] = paramsOf(grouping)["rule"];
  else if (grouping?.option === "quadtree") Object.assign(options, decode(QUADTREE.codecs, paramsOf(grouping)));
  else if (grouping) {
    const g = GROUPS.get(grouping.option)!;
    options["group"] = g.strategy;
    options["groupOptions"] = decode(g.coded.codecs, paramsOf(grouping));
  }
  const plugs = s["plugs"];
  if (plugs?.option === "facing" || plugs?.option === "side") Object.assign(options, { plugs: plugs.option }, decode(PLUG_GAP.codecs, paramsOf(plugs)));
  else if (plugs) {
    const p = PLUG_RULES.get(plugs.option)!;
    options["plug"] = p.strategy;
    options["plugOptions"] = decode(p.coded.codecs, paramsOf(plugs));
  }
  const lanes = s["lane-order"];
  if (lanes?.option === "stretch") {
    const p = paramsOf(lanes);
    Object.assign(options, { laneOrder: "bundle", stretchOrder: p["order"] }, p["order"] === "sifting" ? { siftPasses: p["siftPasses"] } : {});
  } else if (lanes) options["laneOrder"] = lanes.option;
  if (r.reads.has("smoothing")) options["smooth"] = s["smoothing"]?.option === "smooth";
  const levels = s["levels"];
  if (levels && levels.option !== "depths") {
    const l = LEVELS.get(levels.option)!;
    options["level"] = l.strategy;
    options["levelOptions"] = decode(l.coded.codecs, paramsOf(levels));
  }
  // An option with the value of the defaults of the router stays out, so the router gets the exact value of its `defaults`.
  const defaults = optionDefaults(r.strategy) as Options;
  for (const [key, value] of Object.entries(options)) if (Object.is(value, defaults[key]) || (key === "rule" && value === FUNCTION_NAMES.get(defaults[key]))) delete options[key];
  if (r.strategy.step === "router") return { router: r.strategy, options };
  const gate = s["gate"];
  if (!gate) return { router: highwayRouterStrategy(r.strategy) as Strategy<"router", object>, options };
  const g = GATES.get(gate.option)!;
  const plan = gateStrategy(r.strategy, g.gate) as Strategy<"highway", object>;
  return { router: highwayRouterStrategy(plan) as Strategy<"router", object>, options: { ...options, ...decode(g.coded.codecs, paramsOf(gate)) } };
}

/**
 * This function routes a graph with a config of `routeSpace`. It runs the strategies of the registry, and adds no new algorithm.
 *
 * - The function checks the config with `checkConfig`. A config with a break causes a `RangeError` with the details of each break.
 * - A param at its default stays out of the options, so the router gets the exact value of its `defaults`.
 * - A plan routes with `follow` (`highwayRouterStrategy`). A plan with a gate routes with `gateStrategy` and then `follow`.
 * - The routes of each named point are equal to the routes of the router of that name.
 */
export function routeConfig(graph: Graph, config: StrategyConfig): Result {
  const breaks = checkConfig(routeSpace, config);
  if (breaks.length > 0) throw new RangeError(`The config is not a config of the space highways: ${breaks.map((b) => b.detail).join("; ")}.`);
  const { router, options } = routerOf(canonicalConfig(routeSpace, config));
  return router.run(graph, options);
}

/** The point of a member in `routeSpace`: its config, or the reason that it has no config. */
export type MemberPoint = { readonly ok: true; readonly config: StrategyConfig } | { readonly ok: false; readonly reason: string };

/**
 * The names with no point in `routeSpace`, with the reason of each. Each refused form of `MEMBER_FORMS` has a row here.
 * The name `portfolio` is not a form. It has a row because a consumer can ask for it.
 */
export const MEMBER_MISFITS: Readonly<Record<string, string>> = Object.freeze({
  portfolio: "It is a selector, not a router. One route for each board comes from a choice among the members, and the stage `routing` holds one router.",
  "w3a:diffusion-l3": "Its option `lambda` is 3, and the schema of `diffusion` stops at 2. The space takes its ranges from the schemas, so the value is not in the space.",
});

/** This function gives the params of the options of a strategy, the reverse of `decode`, or a reason for an option with no param. */
function encode(codecs: readonly Codec[], options: Options): Record<string, ParamValue> | string {
  const out: Record<string, ParamValue> = {};
  for (const [key, value] of Object.entries(options)) {
    const c = codecs.find((x) => x.key === key);
    if (c === undefined) return `The option ${key} has no param.`;
    if (c.kind === "plain") out[c.param.name] = value as ParamValue;
    else if (c.kind === "switch") {
      out[c.flag.name] = value !== c.off;
      if (value !== c.off) out[c.param.name] = value as ParamValue;
    } else for (const s of c.sources) out[sourceParam(key, s)] = (value as readonly string[]).includes(s);
  }
  return out;
}

/** This function gives the config of a router with options, before a check. The option `plugs` goes to its stage, and the other options go to `routing`. */
function routerPoint(id: string, options: Options): MemberPoint {
  const r = ROUTING.get(id);
  if (r === undefined) return { ok: false, reason: `The stage routing has no option ${id}.` };
  const { plugs, ...own } = options;
  const staged = r.reads.has("plugs") && typeof plugs === "string";
  const routing = encode(r.coded.codecs, staged ? own : options);
  if (typeof routing === "string") return { ok: false, reason: routing };
  return { ok: true, config: pointOf(id, routing, staged ? { plugs: choice(plugs) } : {}) };
}

/** This function gives the config of a member form, before a check. */
function formPoint(form: MemberForm): MemberPoint {
  switch (form[0]) {
    case "highway":
      return { ok: true, config: form[1] === "shared-ways-all" ? pointOf("shared-ways", {}, { grouping: choice("edge-key", { rule: "all" }) }) : NAMED[form[1]]! };
    case "gate":
      return ROUTING.has(form[1])
        ? { ok: true, config: pointOf(form[1], {}, { gate: choice(form[2], form[3] === undefined ? {} : { budget: form[3] }) }) }
        : { ok: false, reason: `The stage routing has no option ${form[1]}.` };
    case "plan":
      return routerPoint(form[1], form[2]);
    default:
      return routerPoint(form[0], form[1]);
  }
}

/**
 * This function gives the canonical point in `routeSpace` of a member of `MEMBER_FORMS`. `routeConfig` of the point gives the routes of the member.
 *
 * - A name without a form gets a reason in place of a config. An option with no param and a break of `checkConfig` also give a reason.
 * - The reason is the row of `MEMBER_MISFITS` when the name has a row. The function examines the form first, so a test finds a row that is out of date.
 */
export function configOfMember(name: string): MemberPoint {
  const row = MEMBER_MISFITS[name];
  const form = MEMBER_FORMS[name];
  if (form === undefined) return { ok: false, reason: row ?? `The name ${name} is not a member of MEMBER_FORMS.` };
  const raw = formPoint(form);
  if (!raw.ok) return { ok: false, reason: row ?? raw.reason };
  const breaks = checkConfig(routeSpace, raw.config);
  if (breaks.length > 0) return { ok: false, reason: row ?? `The config is not a point of routeSpace: ${breaks.map((b) => `${b.claim}: ${b.detail}`).join("; ")}.` };
  return { ok: true, config: canonicalConfig(routeSpace, raw.config) };
}
