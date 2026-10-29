import { checkDeclared, corpusHashOf, SPLIT_SCHEMA, splitFileName, type ClaimBreak, type CorpusSplit, type DeclaredClaim, type FamilyBy, type FamilyCell } from "@mark1russell7/layout-contract";
import { highwaysRegistry, type HighwaysBoard } from "../../families/index.ts";
import type { Graph } from "../../model.ts";
import { EXACT_V1, EXACT_V1_BOUNDS } from "./exact-set.ts";
import { graphInput, type LayoutCell, type LayoutGenerator, type LayoutInput } from "./forms.ts";

/** A family of boards of a screen set. The member `k` of the family has the seed `k`. */
export interface ScreenFamily {
  readonly name: string;
  /** The known hard case that the family shows, in a few words. */
  readonly shows: string;
  /** The number of members. */
  readonly seeds: number;
  /** This function makes the member `k`. The same `k` always gives the same graph. */
  readonly make: (k: number) => Graph;
  /** This function gives the generator of the member `k`: its name, version, parameters and seed. */
  readonly generator: (k: number) => LayoutGenerator;
  /** The cell of each member in the taxonomy of the corpus. */
  readonly cell: LayoutCell;
}

/**
 * The key of the family of a screen input (SCREEN-WEIGHT). The map form gives the kind of the cell as the key, with no other dimension.
 * The cells of a screen set have no `kind`, and `dense-groups` and `many-groups` have the same cell. Thus `familyCell` adds the family of the input as the kind.
 */
export const SCREEN_FAMILY_BY: FamilyBy = Object.freeze({ "*": Object.freeze([]) as readonly string[] });

/** This function gives the cell of an input for the key `familyBy`: the cell of the input, with its family as `kind`. */
export const familyCell = (input: { readonly family: string; readonly cell?: LayoutCell }): FamilyCell => ({ ...input.cell, kind: input.family });

/** The claims of a manifest. `declared` gives the count of the inputs of each family (`docs/CORPUS-CHECKS.md` of `layout-contract`). */
export interface CorpusClaims {
  readonly declared: DeclaredClaim;
}

/** A screen set: a fixed list of small boards with an id. A new board or a changed board gets a new id. */
export interface ScreenSet {
  /** The id of the set, for example `screen-v1`. The records name it in `set` and `corpus`. */
  readonly id: string;
  readonly families: readonly ScreenFamily[];
  /** The claims of the manifest of the set. A set without claims has no field `claims` in its manifest. */
  readonly claims?: CorpusClaims;
  /** The member seeds of each family that the split `default` holds out. A set without them has no split file. */
  readonly heldOut?: readonly number[];
}

/** The registry of the screen sets (CORPUS-GEN). The screens and the site make each board with the same families. */
const REGISTRY = highwaysRegistry();

/**
 * This function gives a screen family of a corpus family at its defaults. The member `k` has the input seed `base + 1009 * k`, the rule of `familySeed`.
 * The family keeps the board of its last member, so `make(k)` and `generator(k)` of one member generate one time.
 */
function registryFamily(name: string, base: number, shows: string, seeds: number, cell: LayoutCell): ScreenFamily {
  let last: { readonly k: number; readonly board: HighwaysBoard } | undefined;
  const board = (k: number): HighwaysBoard => {
    if (last?.k !== k) last = { k, board: REGISTRY.generate(name, caseSeed(base, k)) };
    return last.board;
  };
  return { name, shows, seeds, cell, make: (k) => board(k).graph, generator: (k) => board(k).generator };
}

/** The cell dimensions that each family of `screen-v1` shares. */
const BASE = { containerSize: "freeAspect", containerShape: "rect", obstacles: "none", mode: "offline", groups: "none" } as const;

/** This function gives the seed of the member `k` of a case board with the base seed `base`: `base + 1009 * k`, the rule of `familySeed`. */
export function caseSeed(base: number, k: number): number {
  return base + 1009 * k;
}

/**
 * This function gives the 6 families of the screen. Each fixture family and `packed-grid` has `seeds` members.
 * The case boards `hub-chain` and `many-groups` have `caseSeeds` members. The member `k` of a family has the seed of its rule for `k`.
 * Each family is a family of `HIGHWAYS_FAMILIES` at its defaults. The base seeds are the seeds of the fixtures and the case boards of the benchmark.
 */
function screenFamilies(seeds: number, caseSeeds: number): ScreenFamily[] {
  return [
    registryFamily("tiny-uniform", 1, "A tiny board: the cost of a strategy at its start.", seeds, { ...BASE, count: "10", edgeDensity: "medium", edgeShape: "random", ports: "free" }),
    registryFamily("small-clustered", 2, "Clusters, and fixed plugs on 20% of the nodes.", seeds, { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "clustered", ports: "fixed" }),
    registryFamily("dense-groups", 3, "Dense groups whose boxes overlap at the far view.", seeds, { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "clustered", ports: "free" }),
    registryFamily("hub-chain", 3, "A chain of hubs: routes climb away from their targets.", caseSeeds, { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "hubChain", ports: "free" }),
    registryFamily("many-groups", 7, "Many groups: level links go around the board.", caseSeeds, { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "clustered", ports: "free" }),
    registryFamily("packed-grid", 11, "A packed grid: boxes touch, with no channel for the routes.", seeds, { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "longRange", ports: "free" }),
  ];
}

const V1_FAMILIES = screenFamilies(3, 1);

/**
 * The screen set `screen-v1`: 14 boards of made-up data from 10 to 150 nodes. Each family shows a known hard case.
 * The seed 0 of each family is the fixture or the case board of the benchmark. The seed `k` of a fixture family is `familySeed(spec, k)`, as in `runSuite`.
 * The generators wrap the fixtures and the case boards without a change to their output.
 *
 * The manifest declares the inputs of each family, with `minCount` 3. The case boards `hub-chain` and `many-groups` have 1 input, so they are in `thin`.
 * The boards of this set do not change. The tests compare it with the files in `corpus/screen-v1`.
 */
export const SCREEN_V1: ScreenSet = {
  id: "screen-v1",
  families: V1_FAMILIES,
  claims: {
    declared: {
      minCount: 3,
      thin: V1_FAMILIES.filter((f) => f.seeds < 3).map((f) => f.name),
      counts: Object.fromEntries(V1_FAMILIES.map((f) => [f.name, f.seeds])),
      familyBy: SCREEN_FAMILY_BY,
    },
  },
};

/** The member seeds of each family of `screen-v2` that the split `default` holds out. */
export const SCREEN_V2_HELD_OUT: readonly number[] = [7, 8, 9];

const V2_FAMILIES = screenFamilies(10, 10);

/**
 * The screen set `screen-v2` (CORPUS-SEEDS): the 6 families of `screen-v1`, each with the 10 members 0 to 9, thus 60 boards.
 * Each family keeps the seed rule of `screen-v1`. Thus the members 0 to 2 are the boards of `screen-v1`, and the member 0 of `hub-chain` and `many-groups` is their board.
 *
 * The manifest declares 10 inputs for each family, and each family key has 10 inputs or more. The split `default` holds out the members 7 to 9 of each family.
 * This set does not change. The tests compare it with the files in `corpus/screen-v2`.
 */
export const SCREEN_V2: ScreenSet = {
  id: "screen-v2",
  families: V2_FAMILIES,
  claims: { declared: { minCount: 10, thin: [], counts: Object.fromEntries(V2_FAMILIES.map((f) => [f.name, f.seeds])), familyBy: SCREEN_FAMILY_BY, familyMin: 10 } },
  heldOut: SCREEN_V2_HELD_OUT,
};

/** This function gives the 9 families of CORPUS-FAMILIES, each with `seeds` members. Their base seeds are the primes from 13 to 43. */
function coverageFamilies(seeds: number): ScreenFamily[] {
  return [
    registryFamily("frame-rows", 13, "Cards with full-width rows and fixed plugs on their walls.", seeds, { ...BASE, count: "100", edgeDensity: "sparse", edgeShape: "random", groups: "nested", ports: "fixed" }),
    registryFamily("pipeline", 17, "A long chain of stages in rows that turn.", seeds, { ...BASE, count: "100", edgeDensity: "sparse", edgeShape: "tree", ports: "free" }),
    registryFamily("fan-out", 19, "A wide fan-out from one hub to the rings around it.", seeds, { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "bundled", ports: "free" }),
    registryFamily("two-hubs", 23, "Two hubs with many shared targets.", seeds, { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "bundled", ports: "free" }),
    registryFamily("uneven-sizes", 29, "A few large boxes among many small boxes.", seeds, { ...BASE, sizes: "bimodal", count: "100", edgeDensity: "medium", edgeShape: "random", ports: "free" }),
    registryFamily("thin-bars", 31, "Long thin bars in lanes, as a timeline.", seeds, { ...BASE, sizes: "extremeAspect", count: "100", edgeDensity: "medium", edgeShape: "random", ports: "free" }),
    registryFamily("sparse-long", 37, "Few nodes far apart, with long edges.", seeds, { ...BASE, count: "10", edgeDensity: "sparse", edgeShape: "longRange", ports: "free" }),
    registryFamily("local-mesh", 41, "Many short edges between nodes next to each other.", seeds, { ...BASE, count: "100", edgeDensity: "dense", edgeShape: "clustered", ports: "free" }),
    registryFamily("bipartite", 43, "A complete bipartite part: crossings that no plan removes.", seeds, { ...BASE, count: "10", edgeDensity: "dense", edgeShape: "random", ports: "free" }),
  ];
}

/** The member seeds of each family of `screen-v3` that the split `default` holds out. */
export const SCREEN_V3_HELD_OUT: readonly number[] = [7, 8, 9];

const V3_FAMILIES = [...screenFamilies(10, 10), ...coverageFamilies(10)];

/**
 * The screen set `screen-v3` (CORPUS-FAMILIES): the 15 families of `HIGHWAYS_FAMILIES`, each with the 10 members 0 to 9, thus 150 boards.
 * The first 6 families are the families of `screen-v2` with their seeds. Thus their boards are the boards of `screen-v2`, under the ids of `screen-v3`.
 * The 9 new families cover frames with rows, a long chain, a wide fan-out and two hubs.
 * They also cover uneven sizes, thin bars, long edges, short edges and a complete bipartite part.
 *
 * The manifest declares 10 inputs for each family. The split `default` holds out the members 7 to 9 of each family.
 * This set does not change. A new family goes into a new set. The tests compare it with the files in `corpus/screen-v3`.
 */
export const SCREEN_V3: ScreenSet = {
  id: "screen-v3",
  families: V3_FAMILIES,
  claims: { declared: { minCount: 10, thin: [], counts: Object.fromEntries(V3_FAMILIES.map((f) => [f.name, f.seeds])), familyBy: SCREEN_FAMILY_BY, familyMin: 10 } },
  heldOut: SCREEN_V3_HELD_OUT,
};

/**
 * This function gives the power of the sign test over `families` families at the level `level`.
 * The power is the least count of families on one side that passes.
 * A family set without ties and with that count or more on one side passes the two-sided exact sign test, with the p below `level`.
 * The function gives `undefined` when no count passes, for example for 5 families or fewer at the level 0.05.
 */
export function signTestPower(families: number, level = 0.05): number | undefined {
  for (let k = Math.ceil(families / 2); k <= families; k++) {
    // The two-sided p of k wins and families - k losses: two times the tail of the smaller count.
    let tail = 0;
    let c = 1;
    for (let i = 0; i <= families - k; i++) {
      tail += c;
      c = (c * (families - i)) / (i + 1);
    }
    if (Math.min(1, (2 * tail) / 2 ** families) < level) return k;
  }
  return undefined;
}

/**
 * The screen sets by id. `screen-v1`, its larger version `screen-v2` (CORPUS-SEEDS) and `screen-v3` with 15 families (CORPUS-FAMILIES) have the boards of the screen.
 * `exact-v1` has small boards with a known optimum (MEAS2). `exact-v1-bounds` has larger boards with bounds (EXACT-BOUNDS).
 */
export const SCREEN_SETS: Readonly<Record<string, ScreenSet>> = {
  [SCREEN_V1.id]: SCREEN_V1,
  [SCREEN_V2.id]: SCREEN_V2,
  [SCREEN_V3.id]: SCREEN_V3,
  [EXACT_V1.id]: EXACT_V1,
  [EXACT_V1_BOUNDS.id]: EXACT_V1_BOUNDS,
};

/** This function gives the id of the member `seed` of a family of a set: `<set>/<family>/s<seed>`. */
export function inputId(set: string, family: string, seed: number): string {
  return `${set}/${family}/s${seed}`;
}

/** This function gives the input files of a screen set, in the order of its families and seeds. Each file has its hash. */
export function screenInputs(set: ScreenSet = SCREEN_V1): LayoutInput[] {
  return set.families.flatMap((f) =>
    Array.from({ length: f.seeds }, (_, k) => graphInput(f.make(k), { id: inputId(set.id, f.name, k), set: set.id, family: f.name, seed: k, generator: f.generator(k), cell: f.cell })),
  );
}

/** A spec of a manifest: one generator with its version and parameters, and the seeds that the corpus uses. */
export interface CorpusSpec {
  readonly generator: string;
  readonly version: number;
  readonly params: Readonly<Record<string, unknown>>;
  readonly seeds: readonly number[];
}

/** The manifest `corpus.json` of a corpus, of the form `layout-corpus/1`. */
export interface LayoutCorpus {
  readonly schema: "layout-corpus/1";
  readonly corpus: string;
  readonly specs: readonly CorpusSpec[];
  readonly inputs: readonly { readonly id: string; readonly hash: string; readonly cell: LayoutCell }[];
  readonly claims?: CorpusClaims;
}

/**
 * This function gives the manifest of a list of inputs. The inputs of one generator, version and parameters share one spec.
 * With `claims`, the manifest has the field `claims`.
 */
export function corpusManifest(corpus: string, inputs: readonly LayoutInput[], claims?: CorpusClaims): LayoutCorpus {
  const specs = new Map<string, { generator: string; version: number; params: Readonly<Record<string, unknown>>; seeds: number[] }>();
  for (const input of inputs) {
    const g = input.generator;
    if (!g) continue;
    const key = JSON.stringify([g.name, g.version, g.params]);
    const spec = specs.get(key) ?? { generator: g.name, version: g.version, params: g.params, seeds: [] };
    if (!spec.seeds.includes(g.seed)) spec.seeds.push(g.seed);
    specs.set(key, spec);
  }
  return {
    schema: "layout-corpus/1",
    corpus,
    specs: [...specs.values()],
    inputs: inputs.map((i) => ({ id: i.id, hash: i.hash, cell: i.cell ?? {} })),
    ...(claims ? { claims } : {}),
  };
}

/** This function gives the manifest of a screen set, with the claims of the set. */
export function setManifest(set: ScreenSet, inputs: readonly LayoutInput[] = screenInputs(set)): LayoutCorpus {
  return corpusManifest(set.id, inputs, set.claims);
}

/** The hook of the claim `declared` of a screen set: each input declares its family. */
export const declaresFamily = (input: { readonly family: string }): readonly string[] => [input.family];

/**
 * This function checks the claim `declared` of a manifest against its inputs, with the shared check of the contract. A manifest without the claim gives no break.
 * With `familyBy`, the check reads the cell of each input with `familyCell`.
 */
export function checkFamilies(manifest: LayoutCorpus, inputs: readonly LayoutInput[]): ClaimBreak[] {
  const claim = manifest.claims?.declared;
  return claim ? checkDeclared(inputs, declaresFamily, claim, undefined, familyCell) : [];
}

/** This function gives the hash of the corpus of a manifest with the shared function `corpusHashOf` of the contract. It reads the input ids and the input hashes. */
export function manifestHash(manifest: LayoutCorpus): string {
  return corpusHashOf(manifest.corpus, manifest.inputs);
}

/**
 * This function gives the split file `corpus-split/1` of a screen set with `heldOut`. A set without `heldOut` gives `undefined`.
 * The seeds of a split file are the seeds of the specs of the manifest. Thus each fold lists the generator seeds of its members.
 * - The split `default` has one fold. It holds out the members `heldOut` of each family and trains on the other members.
 * - The split `by-member` has one fold for each member `k`. The fold holds out the member `k` of each family.
 */
export function screenSplit(set: ScreenSet, manifest: LayoutCorpus = setManifest(set)): CorpusSplit | undefined {
  const heldOut = set.heldOut;
  if (!heldOut) return undefined;
  const members = Math.max(...set.families.map((f) => f.seeds));
  const seedsOf = (keep: (k: number) => boolean): number[] => {
    const out = new Set<number>();
    for (const f of set.families) for (let k = 0; k < f.seeds; k++) if (keep(k)) out.add(f.generator(k).seed);
    return [...out].sort((a, b) => a - b);
  };
  const fold = (out: (k: number) => boolean) => ({ train: seedsOf((k) => !out(k)), heldOut: seedsOf(out) });
  return {
    schema: SPLIT_SCHEMA,
    corpus: set.id,
    corpusHash: manifestHash(manifest),
    splits: {
      default: { folds: [fold((k) => heldOut.includes(k))] },
      "by-member": { folds: Array.from({ length: members }, (_, m) => fold((k) => k === m)) },
    },
  };
}

/** This function gives the path of the split file of a corpus, relative to the folder of the corpora: `splits/<corpus id>.<corpus hash>.json`. */
export function splitPath(split: CorpusSplit): string {
  return `splits/${splitFileName(split.corpus, split.corpusHash)}`;
}
