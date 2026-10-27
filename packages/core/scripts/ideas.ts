// The command line of the idea catalog (IDEA0): `pnpm ideas [--check]`.
// The script reads the five family files of `docs/research/ideas/`, checks them and writes `docs/research/ideas/index.json`.
// With `--check`, the script writes nothing. It stops with an error when a record is not correct or when the index is old.
// The test `src/bench/screen/ideas.test.ts` uses the same functions.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MEASURES } from "../src/bench/screen/measures.ts";

/** The folder of the idea files. */
export const IDEAS_DIR = new URL("../../../docs/research/ideas/", import.meta.url);

/** The family files, in the order of the research notes. */
export const FAMILIES = ["highway", "wild", "fields", "nature", "rules"] as const;
export type Family = (typeof FAMILIES)[number];

/** The stages of an idea, from the first to the last. `dropped` can follow each stage. */
export const STAGES = ["cataloged", "screened", "prototyped", "built", "kept", "dropped"] as const;

/** One idea record. The schema `schema.json` gives all fields. */
export interface Idea {
  readonly id: string;
  readonly family: Family;
  readonly name: string;
  readonly kind: string;
  readonly step: string;
  readonly cost: string;
  readonly wins: readonly string[];
  readonly risks: readonly string[];
  readonly screen: string;
  readonly stage: string;
  readonly related: readonly string[];
  readonly same?: readonly string[];
  readonly canonical?: string;
  readonly dependsOn?: readonly string[];
  readonly wave: number;
  readonly [field: string]: unknown;
}

/** The list MEAS3: the measures that the ideas need and that `MEASURES` does not have. */
export interface Meas3 {
  readonly meas0: readonly { readonly id: string; readonly name: string }[];
  readonly proposed: readonly { readonly id: string; readonly name: string; readonly from: readonly string[] }[];
}

const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, IDEAS_DIR), "utf8")) as unknown;

/** This function reads the records of all families, in the order of the files. */
export function loadIdeas(): Idea[] {
  return FAMILIES.flatMap((f) => readJson(`${f}.json`) as Idea[]);
}

/** This function reads the schema of a record. */
export function loadSchema(): Schema {
  return readJson("schema.json") as Schema;
}

/** This function reads the list MEAS3. */
export function loadMeas3(): Meas3 {
  return readJson("meas3.json") as Meas3;
}

/** A node of a JSON Schema. The validator knows only the keywords that `schema.json` uses. */
export interface Schema {
  readonly $ref?: string;
  readonly $defs?: Readonly<Record<string, Schema>>;
  readonly type?: string;
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly items?: Schema;
  readonly minItems?: number;
  readonly uniqueItems?: boolean;
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly allOf?: readonly Schema[];
  readonly if?: Schema;
  readonly then?: Schema;
  readonly [keyword: string]: unknown;
}

const NOTES = new Set(["$schema", "$id", "$defs", "title", "description"]);
const KEYWORDS = new Set([
  "$ref",
  "type",
  "enum",
  "const",
  "pattern",
  "minLength",
  "minimum",
  "maximum",
  "items",
  "minItems",
  "uniqueItems",
  "properties",
  "required",
  "additionalProperties",
  "allOf",
  "if",
  "then",
]);

const typeOf = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v;

/**
 * This function checks a value against a JSON Schema (draft 2020-12) and gives one message for each fault.
 * It knows a part of the keywords only, and it stops with an error at an other keyword.
 */
export function validate(schema: Schema, value: unknown, root: Schema = schema, path = "$"): string[] {
  const out: string[] = [];
  const s = schema;
  for (const k of Object.keys(s)) if (!KEYWORDS.has(k) && !NOTES.has(k)) throw new Error(`The validator does not know the keyword "${k}".`);
  if (typeof s.$ref === "string") {
    const name = /^#\/\$defs\/(.+)$/.exec(s.$ref)?.[1];
    const target = name === undefined ? undefined : root.$defs?.[name];
    if (!target) throw new Error(`The validator cannot find "${s.$ref}".`);
    out.push(...validate(target, value, root, path));
  }
  const t = typeOf(value);
  if (typeof s.type === "string" && !(s.type === t || (s.type === "number" && t === "integer"))) {
    out.push(`${path}: the type is ${t}, not ${s.type}`);
    return out;
  }
  if (Array.isArray(s.enum) && !s.enum.includes(value)) out.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(s.enum)}`);
  if ("const" in s && s.const !== value) out.push(`${path}: ${JSON.stringify(value)} is not ${JSON.stringify(s.const)}`);
  if (typeof value === "string") {
    if (typeof s.pattern === "string" && !new RegExp(s.pattern, "u").test(value)) out.push(`${path}: "${value}" does not match ${s.pattern}`);
    if (typeof s.minLength === "number" && [...value].length < s.minLength) out.push(`${path}: the text is too short`);
  }
  if (typeof value === "number") {
    if (typeof s.minimum === "number" && value < s.minimum) out.push(`${path}: ${value} is less than ${s.minimum}`);
    if (typeof s.maximum === "number" && value > s.maximum) out.push(`${path}: ${value} is more than ${s.maximum}`);
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === "number" && value.length < s.minItems) out.push(`${path}: fewer than ${s.minItems} items`);
    if (s.uniqueItems === true && new Set(value.map((x) => JSON.stringify(x))).size !== value.length) out.push(`${path}: the items are not unique`);
    const items = s.items;
    if (items) value.forEach((x, i) => out.push(...validate(items, x, root, `${path}[${i}]`)));
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const props = s.properties ?? {};
    for (const r of s.required ?? []) if (!(r in obj)) out.push(`${path}: the field "${r}" is missing`);
    for (const [k, v] of Object.entries(obj)) {
      const p = props[k];
      if (p) out.push(...validate(p, v, root, `${path}.${k}`));
      else if (s.additionalProperties === false) out.push(`${path}: the field "${k}" is not in the schema`);
    }
  }
  for (const sub of s.allOf ?? []) out.push(...validate(sub, value, root, path));
  if (s.if && s.then && validate(s.if, value, root, path).length === 0) out.push(...validate(s.then, value, root, path));
  return out;
}

/** The measure ids in a text, for example `B3` in "B3 falls by 5%". */
export const measureIdsIn = (text: string): string[] => [...new Set(text.match(/\b[RBCGZMH]\d{1,2}\b/g) ?? [])];

/** This function gives the measure ids that the screen knows, and the ids of MEAS3. */
export function knownMeasures(meas3: Meas3): { readonly screen: Set<string>; readonly meas3: Set<string> } {
  return { screen: new Set(MEASURES.map((m) => m.id)), meas3: new Set([...meas3.meas0, ...meas3.proposed].map((m) => m.id)) };
}

/** This function checks the records together: the ids, the links, the duplicate groups, the waves and the measures. It gives one message for each fault. */
export function checkIdeas(ideas: readonly Idea[], schema: Schema, meas3: Meas3): string[] {
  const out: string[] = [];
  const byId = new Map<string, Idea>();
  for (const r of ideas) {
    for (const m of validate(schema, r)) out.push(`${r.id}: ${m}`);
    if (byId.has(r.id)) out.push(`${r.id}: the id is not unique`);
    byId.set(r.id, r);
  }
  const known = knownMeasures(meas3);
  for (const id of known.meas3) if (known.screen.has(id)) out.push(`meas3.json: ${id} is in MEASURES now. Remove it from MEAS3.`);
  for (const r of ideas) {
    for (const field of ["related", "same", "dependsOn"] as const) {
      for (const id of r[field] ?? []) {
        if (id === r.id) out.push(`${r.id}: ${field} holds the id of the record`);
        else if (!byId.has(id)) out.push(`${r.id}: ${field} holds ${id}, which does not exist`);
      }
    }
    const used = new Set([...r.wins, ...r.risks, ...measureIdsIn(r.screen)]);
    for (const id of used) if (!known.screen.has(id) && !known.meas3.has(id)) out.push(`${r.id}: the measure ${id} is not in MEASURES or in MEAS3`);
    for (const id of r.dependsOn ?? []) {
      const d = byId.get(id);
      if (d?.canonical !== undefined) out.push(`${r.id}: dependsOn holds ${id}. Use its canonical ${d.canonical}.`);
      if (d && d.wave > r.wave) out.push(`${r.id}: wave ${r.wave} depends on ${id} of the later wave ${d.wave}`);
    }
    if (r.canonical !== undefined) {
      const c = byId.get(r.canonical);
      if (!c) out.push(`${r.id}: the canonical ${r.canonical} does not exist`);
      else {
        if (c.canonical !== undefined) out.push(`${r.id}: the canonical ${c.id} has a canonical too`);
        if (c.stage !== r.stage) out.push(`${r.id}: the stage ${r.stage} is not the stage ${c.stage} of its canonical`);
        if (c.wave !== r.wave) out.push(`${r.id}: the wave ${r.wave} is not the wave ${c.wave} of its canonical`);
      }
      if (!r.same?.includes(r.canonical)) out.push(`${r.id}: same does not hold its canonical`);
    }
    if (r.same) {
      const group = [r.id, ...r.same].sort();
      for (const id of r.same) {
        const o = byId.get(id);
        if (o && JSON.stringify([o.id, ...(o.same ?? [])].sort()) !== JSON.stringify(group)) out.push(`${r.id}: the group of ${id} is not the same group`);
      }
      const heads = group.filter((id) => byId.get(id)?.canonical === undefined);
      if (heads.length !== 1) out.push(`${r.id}: the group has ${heads.length} records without a canonical, not 1`);
    }
  }
  return out;
}

const countBy = (ideas: readonly Idea[], key: (r: Idea) => string | number): Record<string, number> => {
  const m = new Map<string, number>();
  for (const r of ideas) m.set(String(key(r)), (m.get(String(key(r))) ?? 0) + 1);
  return Object.fromEntries([...m].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
};

/** The index: all records sorted by id, and the counts. */
export interface IdeaIndex {
  readonly counts: Record<string, unknown>;
  readonly records: readonly Idea[];
}

/** This function makes the index of the catalog. A record with a canonical counts as a record, but not as a distinct idea. */
export function buildIndex(ideas: readonly Idea[], meas3: Meas3): IdeaIndex {
  const records = [...ideas].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const distinct = records.filter((r) => r.canonical === undefined);
  const known = knownMeasures(meas3);
  const needed = new Map<string, number>();
  for (const r of distinct) {
    for (const id of new Set([...r.wins, ...r.risks, ...measureIdsIn(r.screen)])) if (!known.screen.has(id)) needed.set(id, (needed.get(id) ?? 0) + 1);
  }
  const counts = {
    records: records.length,
    distinct: distinct.length,
    duplicateGroups: records.filter((r) => r.same !== undefined && r.canonical === undefined).length,
    byFamily: countBy(records, (r) => r.family),
    byKind: countBy(distinct, (r) => r.kind),
    byStep: countBy(distinct, (r) => r.step),
    byStage: Object.fromEntries(STAGES.map((s) => [s, records.filter((r) => r.stage === s).length])),
    byWave: countBy(distinct, (r) => r.wave),
    meas3: Object.fromEntries([...needed].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))),
  };
  return { counts, records };
}

/** This function gives the text of `index.json`. */
export const indexText = (index: IdeaIndex): string => `${JSON.stringify(index, null, 2)}\n`;

/** The URL of `index.json`. */
export const INDEX_URL = new URL("index.json", IDEAS_DIR);

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  const ideas = loadIdeas();
  const meas3 = loadMeas3();
  const faults = checkIdeas(ideas, loadSchema(), meas3);
  for (const f of faults) console.error(f);
  const text = indexText(buildIndex(ideas, meas3));
  if (process.argv.includes("--check")) {
    let old = "";
    try {
      old = readFileSync(INDEX_URL, "utf8").replace(/\r\n/g, "\n");
    } catch {
      // The index does not exist yet.
    }
    if (old !== text) console.error("index.json is old. Run `pnpm ideas`.");
    if (faults.length > 0 || old !== text) process.exit(1);
  } else {
    if (faults.length > 0) process.exit(1);
    writeFileSync(INDEX_URL, text);
    console.log(`Wrote ${fileURLToPath(INDEX_URL)}: ${ideas.length} records.`);
  }
}
