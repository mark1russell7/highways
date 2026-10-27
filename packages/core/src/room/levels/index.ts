import type { ItemPair } from "../../levels.ts";
import type { LevelItem } from "../../model.ts";
import { levelCut, treeDepth, type Section } from "../../sections.ts";
import { boardGaps, openGaps, roomDemand, withBends, type Boxed, type Gap, type RoomLink, type RoomOptions } from "../index.ts";

/**
 * The boards of the zoom levels of `levelRoom`.
 *
 * - `shared`: each level uses the board of the nearest level. No box moves between two levels. A far level gets the area of the nearest level.
 * - `each`: each level has its own board. A far level opens only the gaps of its own links, and a nearer level adds to them.
 *   Thus the items of a far level are nearer together, but a box moves in its parent when the level changes.
 */
export type LevelBoard = "each" | "shared";

/** The options of `levelRoom`: the options of `roomDemand` for each level, and the levels that get room. */
export interface LevelRoomOptions extends RoomOptions {
  /** The depths of the tree that get room for their links. The default is each depth from 1 to the depth of the deepest section. */
  readonly depths?: readonly number[];
  /** With `true`, the last level, with each node alone, also gets room for the links between the nodes. The default is `false`. */
  readonly nodes?: boolean;
  /** The board of each level. The default is `shared`. */
  readonly board?: LevelBoard;
}

/** One zoom level of `levelRoom`: its items at their open places, its links and its demand. */
export interface RoomLevel<T extends Boxed> {
  readonly depth: number;
  /** The items of the level, with the bounding box of their nodes at the places of this level. */
  readonly items: LevelItem[];
  /** The links between the items of the level. A link counts the links of the nodes between its two items. */
  readonly pairs: ItemPair[];
  /** The demand of the level on the board that it gets from the level before it. A level without room has no gaps. */
  readonly gaps: Gap[];
  /** The nodes at the places of this level. */
  readonly nodes: T[];
}

/** The room of each zoom level, and the board of the nearest level. */
export interface LevelRoom<T extends Boxed> {
  /** The levels from depth 0 to the level with each node alone, in order. */
  readonly levels: RoomLevel<T>[];
  /** The gaps of the board of the nodes. `openGaps(nodes, gaps)` gives the nodes of the nearest level. */
  readonly gaps: Gap[];
  /** The nodes of the nearest level. */
  readonly items: T[];
}

const DEFAULT_SNAP = 0.5;

/**
 * This function gives the links between the items of a level. Each pair of items gets one link, in the order of the first link of the pair.
 * The count of a link is the sum of the counts of its node links. A link inside one item does not count.
 */
export function levelPairs(items: readonly LevelItem[], owner: readonly number[], indexOf: ReadonlyMap<string, number>, links: readonly RoomLink[]): ItemPair[] {
  const byPair = new Map<string, { source: string; target: string; count: number }>();
  for (const l of links) {
    const iu = indexOf.get(l.source);
    const iv = indexOf.get(l.target);
    if (iu === undefined || iv === undefined) continue;
    const a = owner[iu]!;
    const b = owner[iv]!;
    if (a === b) continue;
    const key = a < b ? `${a} ${b}` : `${b} ${a}`;
    const known = byPair.get(key);
    if (known) known.count += l.count ?? 1;
    else byPair.set(key, { source: items[a]!.id, target: items[b]!.id, count: l.count ?? 1 });
  }
  return [...byPair.values()];
}

/**
 * This function gives the room of each zoom level of a tree of sections. The indices of the nodes of the tree are the indices of `nodes`.
 * The far levels open first, and each nearer level keeps their growth.
 *
 * At each level, `roomDemand` measures the links of that level on the board of the level before it. Then the nodes move with `openGaps`.
 * The nodes move by one monotone shift on each axis, so each level keeps the order and the alignment of the boxes.
 * A nearer level only adds growth, so no gap of a far level gets narrower, and a box moves with its parent.
 */
export function levelRoom<T extends Boxed>(nodes: readonly T[], links: readonly RoomLink[], root: Section, options: LevelRoomOptions = {}): LevelRoom<T> {
  const snap = options.snap ?? DEFAULT_SNAP;
  const deepest = treeDepth(root);
  const depths = new Set(options.depths ?? Array.from({ length: deepest }, (_, i) => i + 1));
  if (options.nodes) depths.add(deepest + 1);
  const indexOf = new Map(nodes.map((n, i) => [n.id, i]));
  const levels: RoomLevel<T>[] = [];
  let current: T[] = [...nodes];
  // The edges of the bends join nodes, not the items of a level. So the bends get room on the board of the nodes, at the last level.
  const { bends, ...room } = options;
  for (let d = 0; d <= deepest + 1; d++) {
    let gaps: Gap[] = [];
    let cut = levelCut(current, root, d);
    const pairs = levelPairs(cut.items, cut.owner, indexOf, links);
    if (depths.has(d) && pairs.length > 0) {
      gaps = roomDemand(cut.items, pairs, room);
      // The shift of each gap applies to the nodes, so a node moves with its item, and the items of a far level stay apart.
      if (gaps.some((g) => g.need > g.width)) {
        current = openGaps(current, gaps, snap);
        cut = levelCut(current, root, d);
      }
    }
    if (bends && d === deepest + 1) {
      const bent = withBends(current, links, boardGaps(current, snap), bends, snap);
      if (bent.some((g) => g.need > g.width)) {
        current = openGaps(current, bent, snap);
        cut = levelCut(current, root, d);
      }
    }
    levels.push({ depth: d, items: cut.items, pairs, gaps, nodes: current });
  }
  const shared = (options.board ?? "shared") === "shared";
  const out = shared ? levels.map((l) => ({ ...l, items: levelCut(current, root, l.depth).items, nodes: current })) : levels;
  return { levels: out, gaps: nodeGaps(nodes, current, levels, snap), items: current };
}

/**
 * This function gives the gaps of the board of the nodes that move each node from `from` to `to`.
 * The growth of a gap is the shift of the nodes after it, less the shift of the nodes before it. Its lanes are the most lanes of a level gap there.
 */
function nodeGaps<T extends Boxed>(from: readonly T[], to: readonly T[], levels: readonly RoomLevel<T>[], snap: number): Gap[] {
  const indexOf = new Map(from.map((n, i) => [n.id, i]));
  const gaps = boardGaps(from, snap);
  const shift = (id: string, axis: "x" | "y"): number => {
    const i = indexOf.get(id)!;
    return to[i]!.box[axis] - from[i]!.box[axis];
  };
  // The lanes of each level gap go to the gap of the nodes at the left (or top) edge of its first item after it.
  const lanes = new Map<number, number>();
  const boundaryOf = new Map<string, number>();
  gaps.forEach((g, k) => {
    for (const id of g.after) boundaryOf.set(`${g.axis} ${id}`, k);
  });
  for (const level of levels) {
    const byId = new Map(level.items.map((i) => [i.id, i]));
    for (const g of level.gaps) {
      if (g.lanes === 0) continue;
      for (const id of g.after) {
        const item = byId.get(id);
        if (!item) continue;
        // The first node of the item on the axis of the gap starts the item.
        let first = item.nodes[0]!;
        for (const n of item.nodes) if (from[indexOf.get(n)!]!.box[g.axis] < from[indexOf.get(first)!]!.box[g.axis]) first = n;
        const k = boundaryOf.get(`${g.axis} ${first}`);
        if (k !== undefined) lanes.set(k, Math.max(lanes.get(k) ?? 0, g.lanes));
      }
    }
  }
  const last: Record<"x" | "y", number> = { x: 0, y: 0 };
  return gaps.map((g, k) => {
    let s = Infinity;
    for (const id of g.after) s = Math.min(s, shift(id, g.axis));
    const growth = Math.max(0, s - last[g.axis]);
    last[g.axis] = Math.max(last[g.axis], s);
    return { ...g, lanes: lanes.get(k) ?? 0, need: g.width + growth };
  });
}
