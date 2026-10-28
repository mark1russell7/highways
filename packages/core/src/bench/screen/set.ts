import { hubChainBoard, manyGroupsBoard, packedGridBoard } from "../../cases.ts";
import { FIXTURES, makeFixture, type FixtureSpec } from "../../fixtures.ts";
import type { Graph } from "../../model.ts";
import { familySeed } from "../suite.ts";
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

/** A screen set: a fixed list of small boards with an id. A new board or a changed board gets a new id. */
export interface ScreenSet {
  /** The id of the set, for example `screen-v1`. The records name it in `set` and `corpus`. */
  readonly id: string;
  readonly families: readonly ScreenFamily[];
}

const fixture = (name: string): FixtureSpec => FIXTURES.find((f) => f.name === name)!;
const DENSE: FixtureSpec = { name: "dense-groups", kind: "clustered", nodes: 150, edgesPerNode: 2, seed: 3 };
const PACKED = { cols: 12, rows: 8, long: 48 } as const;

/** This function gives a family of `makeFixture`. The member `k` has the seed `familySeed(spec, k)`, as in `runSuite`. */
function fixtureFamily(spec: FixtureSpec, shows: string, seeds: number, cell: LayoutCell): ScreenFamily {
  const { name, seed: _seed, ...params } = spec;
  return {
    name,
    shows,
    seeds,
    cell,
    make: (k) => makeFixture({ ...spec, seed: familySeed(spec, k) }),
    generator: (k) => ({ name: "fixture", version: 1, params, seed: familySeed(spec, k) }),
  };
}

/** The cell dimensions that each family of `screen-v1` shares. */
const BASE = { containerSize: "freeAspect", containerShape: "rect", obstacles: "none", mode: "offline", groups: "none" } as const;

/**
 * The screen set `screen-v1`: 14 boards of made-up data from 10 to 150 nodes. Each family shows a known hard case.
 * The seed 0 of each family is the fixture or the case board of the benchmark. The seed `k` of a fixture family is `familySeed(spec, k)`, as in `runSuite`.
 * The generators wrap the fixtures and the case boards without a change to their output.
 * This set does not change. The tests compare it with the files in `corpus/screen-v1`.
 */
export const SCREEN_V1: ScreenSet = {
  id: "screen-v1",
  families: [
    fixtureFamily(fixture("tiny-uniform"), "A tiny board: the cost of a strategy at its start.", 3, { ...BASE, count: "10", edgeDensity: "medium", edgeShape: "random", ports: "free" }),
    fixtureFamily(fixture("small-clustered"), "Clusters, and fixed plugs on 20% of the nodes.", 3, { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "clustered", ports: "fixed" }),
    fixtureFamily(DENSE, "Dense groups whose boxes overlap at the far view.", 3, { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "clustered", ports: "free" }),
    {
      name: "hub-chain",
      shows: "A chain of hubs: routes climb away from their targets.",
      seeds: 1,
      cell: { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "hubChain", ports: "free" },
      make: () => hubChainBoard(),
      generator: () => ({ name: "case.hub-chain", version: 1, params: {}, seed: 3 }),
    },
    {
      name: "many-groups",
      shows: "Many groups: level links go around the board.",
      seeds: 1,
      cell: { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "clustered", ports: "free" },
      make: () => manyGroupsBoard(),
      generator: () => ({ name: "case.many-groups", version: 1, params: {}, seed: 7 }),
    },
    {
      name: "packed-grid",
      shows: "A packed grid: boxes touch, with no channel for the routes.",
      seeds: 3,
      cell: { ...BASE, count: "100", edgeDensity: "medium", edgeShape: "longRange", ports: "free" },
      make: (k) => packedGridBoard({ ...PACKED, seed: 11 + 1009 * k }),
      generator: (k) => ({ name: "case.packed-grid", version: 1, params: PACKED, seed: 11 + 1009 * k }),
    },
  ],
};

/** The screen sets by id: `screen-v1`, the small boards with a known optimum `exact-v1` (MEAS2), and the larger boards with bounds `exact-v1-bounds` (EXACT-BOUNDS). */
export const SCREEN_SETS: Readonly<Record<string, ScreenSet>> = { [SCREEN_V1.id]: SCREEN_V1, [EXACT_V1.id]: EXACT_V1, [EXACT_V1_BOUNDS.id]: EXACT_V1_BOUNDS };

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
}

/** This function gives the manifest of a list of inputs. The inputs of one generator, version and parameters share one spec. */
export function corpusManifest(corpus: string, inputs: readonly LayoutInput[]): LayoutCorpus {
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
  };
}
