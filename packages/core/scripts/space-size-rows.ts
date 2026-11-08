// The form of the record SPACE-SIZE: the count of the base configs of `routeSpace`, with the digest of the space that it counted.
// The count takes minutes, so the workflow `Records` writes it. The test `space-size.test.ts` fails when the space changes.
import { createHash } from "node:crypto";
import type { StrategySpace } from "@mark1russell7/layout-contract";

/** The form of the record. */
export const SPACE_SIZE_SCHEMA = "space-size/1";

/** The count of the levels of each numeric param. */
export const SPACE_SIZE_LEVELS = 3;

/** The command that writes the record again. */
export const SPACE_SIZE_REGENERATE = "the workflow Records with the record space-size, then commit its artifact as docs/research/space-size/record.json";

/** The count of the options and params of one stage. */
export interface StageCount {
  readonly name: string;
  readonly optional: boolean;
  readonly options: number;
  readonly params: number;
}

/** The record. The counts are text, because a count can be more than the largest safe integer. */
export interface SpaceSizeRecord {
  readonly schema: string;
  readonly space: string;
  /** The SHA-256 of the JSON text of the space. */
  readonly digest: string;
  readonly levels: number;
  readonly stages: readonly StageCount[];
  readonly constraints: number;
  /** The count of the configs without a meta option, from `spaceSize`. */
  readonly base: string;
  /** The count of the configs with a meta option, or `null` when it is more than the limit of `spaceSize`. */
  readonly meta: string | null;
  readonly seconds: number;
  readonly cpu: string;
  readonly date: string;
  readonly run: string | null;
  readonly commit: string | null;
}

/** This function gives the SHA-256 of the JSON text of a space. A change of a stage, an option, a param or a constraint changes it. */
export function spaceDigest(space: StrategySpace): string {
  return createHash("sha256").update(JSON.stringify(space)).digest("hex");
}

/** This function gives the count of the options and params of each stage of a space. */
export function stageCounts(space: StrategySpace): StageCount[] {
  return space.stages.map((s) => ({ name: s.name, optional: s.optional === true, options: s.options.length, params: s.options.reduce((sum, o) => sum + o.params.length, 0) }));
}
