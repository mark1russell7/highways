// The annotations of a gate on the check line of a pull request (NO-READ-LINE).
// A gate that cannot read a case writes a warning or an error with the count, the cases and the CPU models.
// Thus a "no read" is not only a line of a job log, and a green check does not hide it.

/** The level of an annotation: a warning keeps the check green, and an error goes with a red check. */
export type AnnotationLevel = "warning" | "error";

/** This function escapes the text of an annotation, so a percent sign or a new line does not cut the line. */
export function escapeData(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** This function gives the workflow command of an annotation. The title names the gate. */
export function annotation(level: AnnotationLevel, title: string, text: string): string {
  const t = escapeData(title).replace(/:/g, "%3A").replace(/,/g, "%2C");
  return `::${level} title=${t}::${escapeData(text)}`;
}

/** The facts of a "no read": the cases with no read, the reason, and the CPU model of each job that timed them. */
export interface NoRead {
  readonly cases: readonly string[];
  readonly why: string;
  /** The CPU model of each job of a time measure. A gate of a measure that is not a time gives no list. */
  readonly cpus?: readonly string[];
}

/** The count of cases that the line names. The count of the rest follows them. */
const NAMED = 10;

/** This function gives the words of a "no read": the count of the cases, the reason, the cases and the CPU models. */
export function noReadText(n: NoRead): string {
  const count = `${n.cases.length} ${n.cases.length === 1 ? "case" : "cases"}`;
  const rest = n.cases.length > NAMED ? `, and ${n.cases.length - NAMED} more` : "";
  const cases = n.cases.length === 0 ? "" : ` The cases: ${n.cases.slice(0, NAMED).join(", ")}${rest}.`;
  const cpus = [...new Set(n.cpus ?? [])];
  const cpu = n.cpus === undefined ? "" : cpus.length === 0 ? " The record has no CPU model." : ` The CPU ${cpus.length === 1 ? "model" : "models"}: ${cpus.join(" and ")}.`;
  return `No read of ${count}: ${n.why.replace(/\.$/, "")}.${cases}${cpu}`;
}

/** This function writes the annotation of a "no read" to the standard error. The runner reads the commands of both streams. */
export function warnNoRead(title: string, n: NoRead, level: AnnotationLevel = "warning"): void {
  console.error(annotation(level, title, noReadText(n)));
}

/** A record with a value of each measure, for an input and a seed. */
interface Measured {
  readonly input: string;
  readonly seed: number;
  readonly measures: Readonly<Record<string, number>>;
}

/**
 * This function gives the inputs and seeds whose value of the measure `name` a filter removed, as `input#seed`.
 * The list `after` has the records of `before` in the same order, for example the result of `withoutMixedKinds`.
 */
export function droppedCases(before: readonly Measured[], after: readonly Measured[], name: string): string[] {
  if (after.length !== before.length) throw new RangeError(`The filter gave ${after.length} records of ${before.length}, so the records do not pair.`);
  return [...new Set(before.flatMap((r, i) => (r.measures[name] !== undefined && after[i]!.measures[name] === undefined ? [`${r.input}#${r.seed}`] : [])))];
}

/** The reason of a value that a verdict leaves out, because its records pair an estimate with a full count (BENCH-PAIRS-HEAP). */
export const mixedKindsWhy = (name: string): string => `the measure ${name} pairs an estimate with a full count, so the verdict leaves these inputs out`;
