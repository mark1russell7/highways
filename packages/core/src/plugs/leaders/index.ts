/**
 * The plug strategy `leaders` (EDA-041): boundary leaders of the labeling of maps, used as the stubs of the plugs.
 * Each wall places its plugs in an order that gives leaders with no crossing, and the least length of the leaders.
 */
import type { PlugInput, PlugPair } from "../../strategies/model.ts";
import { spreadWith, SPREAD_DEFAULTS } from "../spread/index.ts";

/**
 * The type of leader of a plug. With `s`, the order of a wall is the order of the angles of the far ends, as in `spread`.
 * With `po`, the stub leaves along the normal and turns once, so the order is the order of the far ends along the wall.
 * With `opo`, the plugs of a wall go at even places, in the order of the angles.
 */
export type LeaderType = "s" | "po" | "opo";

/** The values of `LeaderType`. */
export const LEADER_TYPES: readonly LeaderType[] = Object.freeze(["s", "po", "opo"]);

/** The options of the plug strategy `leaders`. */
export interface LeaderOptions {
  /** The type of leader. The default is `po`. */
  readonly leader: LeaderType;
  /** The least gap between two plugs of one wall, from 2 to 8. The default is 8. */
  readonly slotSpacing: number;
  /** The distance from a plug to a corner of its box, or a quarter of the wall when the wall is short. The default is 6. */
  readonly inset: number;
  /** The number of passes that sort each wall again by the new places of the far ends, from 0 to 4. The default is 2. */
  readonly rounds: number;
}

/** The defaults of the plug strategy `leaders`. */
export const LEADER_DEFAULTS: Readonly<LeaderOptions> = Object.freeze({ leader: "po", slotSpacing: 8, inset: SPREAD_DEFAULTS.inset, rounds: SPREAD_DEFAULTS.rounds });

/**
 * This function gives the plugs of the plug strategy `leaders` (EDA-041, after Bekos 2007). A fixed plug stays at its point, and a plug with a side stays on that side.
 * Each free plug goes on the side that faces the other end. The plugs of each wall keep at least `slotSpacing` between two of them.
 * The type of leader sets their order and their places. The output has one entry for each edge with two known nodes, in the order of the edges.
 */
export function leaderEnds(input: PlugInput, options: Partial<LeaderOptions> = {}): PlugPair[] {
  const o = { ...LEADER_DEFAULTS, ...options };
  const spread = { plugGap: o.slotSpacing, inset: o.inset, rounds: o.rounds };
  return spreadWith(input, spread, o.leader === "s" ? undefined : o.leader);
}
