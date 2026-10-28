import { makeFixture, type FixtureKind } from "../../fixtures.ts";
import type { Graph } from "../../model.ts";
import type { LayoutCell, LayoutGenerator } from "./forms.ts";
import type { ScreenFamily, ScreenSet } from "./set.ts";

/** The board classes of the small boards with a known optimum (MEAS2). */
export type ExactClass = "uniform" | "clustered" | "hubs" | "fanout";

/** The board classes of `EXACT_V1`, in the order of the set. */
export const EXACT_CLASSES: readonly ExactClass[] = ["uniform", "clustered", "hubs", "fanout"];

/** The edges of each node of a small board with a known optimum. */
export const EXACT_EDGES_PER_NODE = 1.5;

/** The fixture kind of each class. The class `fanout` is the kind `collections`: each cluster is one collection, with fan-outs. */
const KINDS: Readonly<Record<ExactClass, FixtureKind>> = { uniform: "uniform", clustered: "clustered", hubs: "hubs", fanout: "collections" };

/** The cell of each class in the taxonomy of the corpus. */
const CELLS: Readonly<Record<ExactClass, LayoutCell>> = {
  uniform: { edgeShape: "random" },
  clustered: { edgeShape: "clustered" },
  hubs: { edgeShape: "hubChain" },
  fanout: { edgeShape: "bundled" },
};

/** This function gives the seed of the fixture of the member `k` of a class: `100 × (the index of the class + 1) + k`. */
export function exactSeed(cls: ExactClass, k: number): number {
  return 100 * (EXACT_CLASSES.indexOf(cls) + 1) + k;
}

/** This function gives the generator of a small board: the generator `fixture` with the kind of the class, `nodes` and the seed of `exactSeed`. */
export function exactGenerator(cls: ExactClass, nodes: number, k: number): LayoutGenerator {
  return { name: "fixture", version: 1, params: { kind: KINDS[cls], nodes, edgesPerNode: EXACT_EDGES_PER_NODE }, seed: exactSeed(cls, k) };
}

/** This function makes the small board of a class with `nodes` nodes and the member `k`. The same values always give the same graph. */
export function exactBoard(cls: ExactClass, nodes: number, k: number): Graph {
  return makeFixture({ name: cls, kind: KINDS[cls], nodes, edgesPerNode: EXACT_EDGES_PER_NODE, seed: exactSeed(cls, k) });
}

/**
 * This function gives a family of small boards of one class. The member `k` has `sizes[k mod sizes.length]` nodes.
 * The count of the cell is `10`, because each board has fewer than 100 nodes.
 */
export function exactFamily(cls: ExactClass, sizes: readonly number[], seeds: number): ScreenFamily {
  const nodes = (k: number): number => sizes[k % sizes.length]!;
  return {
    name: cls,
    shows: `Small boards of the class ${cls} with ${sizes.join(", ")} nodes and a known optimum.`,
    seeds,
    cell: { containerSize: "freeAspect", containerShape: "rect", obstacles: "none", mode: "offline", groups: "none", count: "10", edgeDensity: "medium", ports: "free", ...CELLS[cls] },
    make: (k) => exactBoard(cls, nodes(k), k),
    generator: (k) => exactGenerator(cls, nodes(k), k),
  };
}

/**
 * The node counts of the boards of `EXACT_V1`. The member `k` of each class has `EXACT_V1_SIZES[k mod length]` nodes.
 * The size ladder of MEAS2 (CI run 40613531631) proved each optimum at 10 nodes within 300 s, for each class, both rules and the cap 1.5.
 * At 14 nodes, 4 of 24 solves stopped at the time limit.
 */
export const EXACT_V1_SIZES: readonly number[] = [10];

/** The number of seeds of each class of `EXACT_V1`. It is `cellMin` of the promotion rule. */
export const EXACT_V1_SEEDS = 10;

/**
 * The screen set `exact-v1` (MEAS2): small boards of made-up data with a known optimum of the exact model.
 * It has 4 classes of 10 seeds. The file `optima-exact-v1.json` of `bench/exact` keeps the optimum of each input, each rule and each cap.
 * This set does not change. The tests compare it with the files in `corpus/exact-v1`.
 */
export const EXACT_V1: ScreenSet = {
  id: "exact-v1",
  families: EXACT_CLASSES.map((cls) => exactFamily(cls, EXACT_V1_SIZES, EXACT_V1_SEEDS)),
};
