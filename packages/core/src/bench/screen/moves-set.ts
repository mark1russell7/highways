import type { Graph } from "../../model.ts";
import type { LayoutCell } from "./forms.ts";
import type { ScreenFamily, ScreenSet } from "./set.ts";

/** A small made-up board on which the own move of each strategy of `strategies` must fire (REBUILD-SILENT). */
export interface MoveBoard {
  /** The name of the board. It tells the reason why the move fires. */
  readonly name: string;
  /** The reason why the move fires on this board, in a few words. */
  readonly shows: string;
  /** The strategies that do their own move on this board, by the names of the records. */
  readonly strategies: readonly string[];
  readonly graph: Graph;
}

const node = (id: string, x: number, y: number, w = 40, h = 20): Graph["nodes"][number] => ({ id, box: { x, y, w, h } });
const edge = (id: string, source: string, target: string): Graph["edges"][number] => ({ id, source: { node: source }, target: { node: target } });

/** This function gives the edges from each node `l<i>` to each node `r<j>`, without the pairs that `skip` accepts. */
function bipartite(count: number, skip: (i: number, j: number) => boolean = () => false): Graph["edges"] {
  const ids = Array.from({ length: count }, (_, i) => i);
  return ids.flatMap((i) => ids.filter((j) => !skip(i, j)).map((j) => edge(`e${i}-${j}`, `l${i}`, `r${j}`)));
}

/** This function gives `count` nodes `l<i>` at the x value 0 and `count` nodes `r<i>` at the x value 600, with the gap `gap` in y. */
function columns(count: number, gap: number): Graph["nodes"] {
  const ids = Array.from({ length: count }, (_, i) => i);
  return ids.flatMap((i) => [node(`l${i}`, 0, gap * i), node(`r${i}`, 600, gap * i)]);
}

/**
 * The boards of REBUILD-SILENT. Each strategy that ACTIVATION found silent on the decision inputs of `screen-v1` has one board.
 * The boards show the class of each strategy: a gap of the corpus, or a wrong trigger. The table in `docs/research/CATALOG.md` tells the class.
 */
export const MOVE_BOARDS: readonly MoveBoard[] = Object.freeze([
  {
    name: "equal-neighbours",
    shows: "Three nodes with the same three neighbours.",
    strategies: ["hw:power"],
    graph: { nodes: columns(3, 40), edges: bipartite(3) },
  },
  {
    name: "near-neighbours",
    shows: "One missing edge in a complete bipartite part, so two nodes are near but not equal.",
    strategies: ["w3e:power-near"],
    graph: { nodes: columns(5, 40), edges: bipartite(5, (i, j) => i === 0 && j === 0) },
  },
  {
    name: "leaf-pair",
    shows: "Two leaves of one hub: a power edge that saves 1 edge.",
    strategies: ["w3e:power-saved1"],
    graph: { nodes: [node("hub", 0, 20), node("a", 600, 0), node("b", 600, 40)], edges: [edge("e0", "hub", "a"), edge("e1", "hub", "b")] },
  },
  {
    name: "spread-modules",
    shows: "A module far from its trunk: the outer edges are too long on the trunk.",
    strategies: ["w3e:power+stretch"],
    graph: { nodes: columns(3, 150), edges: bipartite(3) },
  },
  {
    name: "hidden-plug",
    shows: "The plug that faces the split point is behind a box, so the route goes around that box.",
    strategies: ["hw:corridors+stretch", "w2a:corridors+stretch-1.1", "w2a:corridors+stretch-1.5", "w3f:consensus+stretch", "w3f:link-communities+stretch", "w3f:scale-space+stretch"],
    graph: {
      nodes: [node("tall", 40, 130, 90, 370), node("low", 70, 570, 170, 80), node("far", 250, 480, 80, 340), node("near", 140, 500, 100, 60)],
      edges: [edge("e0", "tall", "far"), edge("e1", "near", "tall")],
    },
  },
  {
    name: "small-saving",
    shows: "A route in the stretch budget, with a detour larger than its saving on a short stretch.",
    strategies: ["hw:corridors+breakeven", "w2a:corridors+breakeven-a0", "w2a:corridors+stretch+breakeven"],
    graph: {
      nodes: [node("tall", 40, 130, 90, 410), node("low", 70, 570, 120, 80), node("far", 250, 430, 80, 340), node("near", 140, 500, 100, 60)],
      edges: [edge("e0", "tall", "far"), edge("e1", "near", "tall")],
    },
  },
  {
    name: "half-fits",
    shows: "Eight lanes in a gap 16 wide: all the lanes need 32, and the half that moves fits.",
    strategies: ["w3b:lanes-corridors"],
    graph: {
      nodes: [
        node("wall-a", 200, -208, 100, 200),
        node("wall-b", 200, 8, 100, 200),
        ...Array.from({ length: 8 }, (_, i) => [node(`s${i}`, 0, 40 * i - 140, 20, 20), node(`t${i}`, 480, 40 * i - 140, 20, 20)]).flat(),
      ],
      edges: Array.from({ length: 8 }, (_, i) => edge(`e${i}`, `s${i}`, `t${i}`)),
    },
  },
  {
    name: "short-link",
    shows: "Parallel edges between two near boxes: a detour of 7 is above the budget of a route of 31.",
    strategies: ["w2c:flow-field+stretch"],
    graph: {
      nodes: [node("bar", 350, 470, 300, 40), node("cap", 430, 420, 40, 30)],
      edges: [edge("e0", "cap", "bar"), edge("e1", "bar", "cap"), edge("e2", "cap", "bar")],
    },
  },
]);

/** The cell of each board of `moves-v1` in the taxonomy of the corpus. */
const CELL: LayoutCell = { containerSize: "freeAspect", containerShape: "rect", obstacles: "none", mode: "offline", groups: "none", count: "10", edgeDensity: "sparse", edgeShape: "random", ports: "free" };

/** This function gives the family of one board: one member, with the board as a parameter of the generator. */
function boardFamily(board: MoveBoard): ScreenFamily {
  return { name: board.name, shows: board.shows, seeds: 1, cell: CELL, make: () => board.graph, generator: (k) => ({ name: "move-board", version: 1, params: { board: board.name }, seed: k }) };
}

/**
 * The screen set `moves-v1` (REBUILD-SILENT): one family of one member for each board of `MOVE_BOARDS`.
 * The activation report reads it for the silent strategies. It is not a set for a verdict, because each board holds the case of its strategies.
 * This set does not change. The tests compare it with the files in `corpus/moves-v1`.
 */
export const MOVES_V1: ScreenSet = { id: "moves-v1", families: MOVE_BOARDS.map(boardFamily) };
