// The fits of SPACE-COVERAGE from the committed sweep records. This file reads no file, so its test gives it made-up records.
// For each measure of a record, the fit takes the held-out skill of each fold. A fit that passes the fold rule also gets its Sobol indices.
import { createHash } from "node:crypto";
import { fitResponse, heldOutError, sobolIndices, type ResponseData, type ResponseRecord } from "@mark1russell7/rigor-statistics";
import { fitCounts, FIT_EFFECT_BAR, FIT_MIN_FOLDS, type SpaceFit } from "../src/bench/space-coverage.ts";
import { measureNameOf } from "./sweep-measures.ts";

/** The form of the file of the fits. */
export const SPACE_FITS_SCHEMA = "space-fits/1";

/** The count of folds that the fit asks for. A record with fewer inputs gives one fold for each input. */
export const FIT_FOLDS = 10;

/** The seed of the split of the folds and of the Sobol sample. */
export const FIT_SEED = 1;

/** The count of the base samples of the Sobol estimate. */
export const SOBOL_SAMPLES = 4096;

/** The note of the file. It tells how a dimension of a sweep becomes a dimension of the space. */
export const SPACE_FITS_NOTE =
  "Each level of the dimension strategy of a record gets the total Sobol index of that dimension. " +
  "An option dimension gets its own total index. The dimension step has one level, so it is not a dimension of a fit.";

/** A measure of a record with no fit, and the reason. */
export interface SkippedMeasure {
  readonly run: string;
  readonly measure: string;
  readonly reason: string;
}

/** A dimension of a record that the space does not have. */
export interface UnmappedDimension {
  readonly run: string;
  readonly dimension: string;
}

/** A record that the fits read, with the digest of its data. A record with another digest makes the file stale. */
export interface FittedRecord {
  readonly run: string;
  readonly digest: string;
}

/** The file of the fits. */
export interface SpaceFitsFile {
  readonly schema: string;
  readonly note: string;
  readonly folds: number;
  readonly seed: number;
  readonly samples: number;
  readonly minFolds: number;
  readonly effectBar: number;
  readonly records: readonly FittedRecord[];
  readonly fits: readonly SpaceFit[];
  readonly skipped: readonly SkippedMeasure[];
  readonly unmapped: readonly UnmappedDimension[];
}

/** The fits of one record, with the measures and the dimensions that the fits do not use. */
export interface RecordFits {
  readonly fits: SpaceFit[];
  readonly skipped: SkippedMeasure[];
  readonly unmapped: UnmappedDimension[];
}

/** The categorical dimension of a sweep record with the name of each strategy. */
const STRATEGY = "strategy";
/** The categorical dimension of a sweep record with its step, of one level. */
const STEP = "step";

/**
 * This function gives the dimensions of the space for one dimension of a sweep record of the step `step`.
 * The dimension `strategy` gives one dimension for each level. The dimension `step` gives none.
 */
export function spaceIdsOf(record: Pick<ResponseData, "dimensions">, step: string, dimension: string): string[] {
  if (dimension === STEP) return [];
  if (dimension === STRATEGY) {
    const d = record.dimensions.find((x) => x.id === STRATEGY);
    return d?.kind === "categorical" ? d.levels.map((name) => `strategy:${step}/${name}`) : [];
  }
  return [`option:${step}/${dimension}`];
}

/** This function gives the step of a sweep record: the one level of its dimension `step`. */
export function stepOf(record: Pick<ResponseData, "dimensions">): string {
  const d = record.dimensions.find((x) => x.id === STEP);
  if (d?.kind !== "categorical" || d.levels.length !== 1) throw new Error("The record has no dimension step with one level.");
  return d.levels[0]!;
}

/** This function gives the held-out skill of each fold of a measure. A fold where the mean has no error gives 0, because the model cannot beat it. */
export function foldSkills(record: Pick<ResponseRecord, "folds">, measure: string): number[] {
  return record.folds.flatMap((f) => {
    const e = f.errors[measure];
    return e === undefined ? [] : [e.baselineMae > 0 ? 1 - e.mae / e.baselineMae : 0];
  });
}

/**
 * This function fits each measure of a sweep record again with `FIT_FOLDS` folds, and gives a fit for each measure with a key in `measures`.
 *
 * @param data - The sweep record. Its models and folds are not used.
 * @param run - The source of the record, for example its path.
 * @param measures - The key in `MEASURES` of each measure, by its name in a screen record.
 * @param known - The ids of the dimensions of the space.
 */
export function recordFits(data: ResponseData, run: string, measures: ReadonlyMap<string, string>, known: ReadonlySet<string>): RecordFits {
  const step = stepOf(data);
  const skipped: SkippedMeasure[] = [];
  const keyOf = (id: string): string | undefined => measures.get(measureNameOf(id) ?? "");
  const kept = data.measures.filter((m) => {
    if (keyOf(m.id) !== undefined) return true;
    skipped.push({ run, measure: m.id, reason: "The measure has no key in MEASURES." });
    return false;
  });
  const ids = new Set(kept.map((m) => m.id));
  const only = <T>(o: Readonly<Record<string, T>> | undefined): Record<string, T> => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => ids.has(k)));
  const points = data.points.map((p) => {
    const absent = only(p.absent);
    return { id: p.id, values: p.values, measures: only(p.measures), ...(p.group === undefined ? {} : { group: p.group }), ...(Object.keys(absent).length > 0 ? { absent } : {}) };
  });
  if (kept.length === 0) return { fits: [], skipped, unmapped: [] };
  const record = fitResponse({ ...data, measures: kept, points }, { folds: FIT_FOLDS, seed: FIT_SEED, interactions: "seen" });

  const unmapped: UnmappedDimension[] = [];
  const mapped = new Map<string, string[]>();
  for (const d of record.dimensions) {
    const out: string[] = [];
    for (const id of spaceIdsOf(record, step, d.id)) {
      if (known.has(id)) out.push(id);
      else unmapped.push({ run, dimension: id });
    }
    if (out.length > 0) mapped.set(d.id, out);
  }
  const dimensions = [...mapped.values()].flat();

  const fits: SpaceFit[] = [];
  for (const m of kept) {
    const base = { measure: keyOf(m.id)!, source: m.id, dimensions, heldOutError: heldOutError(record, m.id).rmse, foldSkill: foldSkills(record, m.id), sobol: {}, run };
    // Only a fit that passes the fold rule needs its Sobol indices. The estimate is the slow part.
    const candidate = { ...base, sobol: Object.fromEntries(dimensions.map((d) => [d, 0])) };
    if (!fitCounts(candidate)) {
      fits.push(base);
      continue;
    }
    const sobol: Record<string, number> = {};
    for (const i of sobolIndices(record, m.id, { n: SOBOL_SAMPLES, seed: FIT_SEED }).indices) {
      for (const id of mapped.get(i.dimension) ?? []) sobol[id] = i.total;
    }
    fits.push({ ...base, sobol });
  }
  return { fits, skipped, unmapped };
}

/** This function gives the SHA-256 of the JSON text of a record. A change of a point, a dimension or a measure changes it. */
export function recordDigest(data: ResponseData): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/** This function gives the file of the fits of the records, in the order of the records. */
export function fitsFile(records: readonly { readonly run: string; readonly data: ResponseData }[], measures: ReadonlyMap<string, string>, known: ReadonlySet<string>): SpaceFitsFile {
  const parts = records.map((r) => recordFits(r.data, r.run, measures, known));
  return {
    schema: SPACE_FITS_SCHEMA,
    note: SPACE_FITS_NOTE,
    folds: FIT_FOLDS,
    seed: FIT_SEED,
    samples: SOBOL_SAMPLES,
    minFolds: FIT_MIN_FOLDS,
    effectBar: FIT_EFFECT_BAR,
    records: records.map((r) => ({ run: r.run, digest: recordDigest(r.data) })),
    fits: parts.flatMap((p) => p.fits),
    skipped: parts.flatMap((p) => p.skipped),
    unmapped: parts.flatMap((p) => p.unmapped),
  };
}
