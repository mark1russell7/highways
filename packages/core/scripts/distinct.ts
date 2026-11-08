// The distinctness gate of the layout space program (D23-DISTINCT). A variant counts only when its routes differ from each operator
// of its stage on at least one board. The caller gives the hash of the routes of each strategy on each board of a fixed set.
// This file imports nothing, so it moves whole into the package `strategy-space`.

/** The hashes of the routes of one strategy: one hash for each board, by the id of the board. */
export interface RouteHashes {
  readonly id: string;
  readonly stage: string;
  readonly boards: Readonly<Record<string, string>>;
}

/** The options of the gate. */
export interface DistinctOptions {
  /** The ids of the boards of the set. Each variant needs a hash on each of them. */
  readonly boards: readonly string[];
  /** The hash that a strategy gives for a board that it refuses. A refused board is not a difference. */
  readonly refused?: string;
}

/**
 * The verdict of the gate on one variant.
 * `distinct`: on at least one board, its routes differ from those of each operator of its stage.
 * `same`: an operator of its stage has the same hash on each board of the set.
 * `no-read`: the gate cannot decide. A board has no hash, or no board shows a difference from an operator that is not the same.
 */
export type DistinctVerdict = "distinct" | "same" | "no-read";

/** The row of the gate for one variant. */
export interface DistinctRow {
  readonly id: string;
  readonly stage: string;
  readonly verdict: DistinctVerdict;
  /** The first id of the variants with the same hash on each board. A variant with a different id is a duplicate of it. */
  readonly canonical: string;
  /** The operators with the same hash on each board. */
  readonly sameAs: readonly string[];
  /** The operators with no difference on a compared board, and no equal hash on each board. */
  readonly undecided: readonly string[];
  /** The boards of the set with no hash for this variant. */
  readonly missing: readonly string[];
  /** The first board where the routes differ from each operator, by the id of the operator. */
  readonly differsOn: Readonly<Record<string, string>>;
}

/** This function gives the key of the hashes of a strategy on the boards, in the order of the boards. */
function vectorKey(s: RouteHashes, boards: readonly string[]): string {
  return JSON.stringify(boards.map((b) => s.boards[b] ?? null));
}

/** This function gives the ids that are in the list more than once. */
function repeated(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  return [...new Set(ids.filter((id) => seen.has(id) || !seen.add(id)))];
}

/**
 * This function gives the verdict of the gate on each variant, sorted by id.
 * It compares a variant only with the operators of its stage. A stage with no operator gives `distinct` to each complete variant.
 *
 * @param operators - The hashes of the existing operators.
 * @param variants - The hashes of the variants that the gate examines.
 * @param options - The boards of the set and the refused hash.
 * @throws Error when an id is in the operators or in the variants more than once, or when the set has no board.
 */
export function distinctness(operators: readonly RouteHashes[], variants: readonly RouteHashes[], options: DistinctOptions): DistinctRow[] {
  const { boards, refused } = options;
  if (boards.length === 0) throw new Error("The gate has no board.");
  const twice = repeated([...operators.map((o) => o.id), ...variants.map((v) => v.id)]);
  if (twice.length > 0) throw new Error(`These ids are not unique: ${twice.join(", ")}.`);

  // The first id of each class of variants with the same hashes.
  const canonical = new Map<string, string>();
  for (const v of [...variants].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const key = `${v.stage}\u0000${vectorKey(v, boards)}`;
    if (!canonical.has(key)) canonical.set(key, v.id);
  }

  const compared = (a: string | undefined, b: string | undefined): boolean => a !== undefined && b !== undefined && a !== refused && b !== refused;
  return [...variants]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((v) => {
      const missing = boards.filter((b) => v.boards[b] === undefined);
      const sameAs: string[] = [];
      const undecided: string[] = [];
      const differsOn: Record<string, string> = {};
      for (const op of operators.filter((o) => o.stage === v.stage).sort((a, b) => (a.id < b.id ? -1 : 1))) {
        const board = boards.find((b) => compared(v.boards[b], op.boards[b]) && v.boards[b] !== op.boards[b]);
        if (board !== undefined) differsOn[op.id] = board;
        else if (missing.length === 0 && boards.every((b) => op.boards[b] === v.boards[b])) sameAs.push(op.id);
        else undecided.push(op.id);
      }
      const verdict: DistinctVerdict = missing.length > 0 ? "no-read" : sameAs.length > 0 ? "same" : undecided.length > 0 ? "no-read" : "distinct";
      return { id: v.id, stage: v.stage, verdict, canonical: canonical.get(`${v.stage}\u0000${vectorKey(v, boards)}`)!, sameAs, undecided, missing, differsOn };
    });
}

/** This function gives the count of the distinct variants: the canonical variants with the verdict `distinct`. A duplicate does not count. */
export function distinctCount(rows: readonly DistinctRow[]): number {
  return rows.filter((r) => r.verdict === "distinct" && r.canonical === r.id).length;
}
