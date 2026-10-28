// The 3 fixture families of the screen sets: `tiny-uniform`, `small-clustered` and `dense-groups` (CORPUS-GEN).
import type { CorpusDimension, DimensionValues, GenerateContext } from "@mark1russell7/layout-contract";
import { fixtureRngSeed, makeFixture, type FixtureKind, type FixtureSpec } from "../fixtures.ts";
import { enumDimension, numberDimension, numberOf, type HighwaysBoard, type HighwaysFamily } from "./model.ts";

/** The values of the dimension `layout`: each `FixtureKind`. */
export const FIXTURE_LAYOUTS: readonly FixtureKind[] = Object.freeze(["uniform", "clustered", "grid", "hubs", "collections"]);

/** The share of the edges near the source when a spec has no `locality`: the default of `makeFixture`. */
export const FIXTURE_LOCALITY = 0.65;

/** The defaults of the dimensions of one fixture family: the spec of its board in the benchmark. */
interface FixtureDefaults {
  readonly layout: FixtureKind;
  readonly nodes: number;
  readonly edgesPerNode: number;
  readonly fixedPorts: number;
}

/**
 * This function gives the 5 dimensions of a fixture family. The name `kind` is reserved, so the dimension of the `FixtureKind` is `layout`.
 * No dimension has a `when`, because each kind reads `locality` and `fixedPorts`.
 */
function fixtureDimensions(d: FixtureDefaults): readonly CorpusDimension[] {
  return Object.freeze([
    enumDimension("layout", FIXTURE_LAYOUTS, d.layout, "The way that the board puts its nodes and picks its edges: the `kind` of the `FixtureSpec`."),
    numberDimension({ name: "nodes", kind: "int", min: 2, max: 400, default: d.nodes, scale: "log", meaning: "The number of nodes of the board." }),
    numberDimension({ name: "edgesPerNode", kind: "real", min: 0, max: 6, default: d.edgesPerNode, meaning: "The number of edges, divided by the number of nodes." }),
    numberDimension({ name: "locality", kind: "real", min: 0, max: 1, default: FIXTURE_LOCALITY, meaning: "The share of the edges that join a node near the source." }),
    numberDimension({ name: "fixedPorts", kind: "real", min: 0, max: 1, default: d.fixedPorts, meaning: "The share of the nodes with one fixed plug for their outgoing edges." }),
  ]);
}

/** This function gives the spec of a fixture board from the full dimension values. A field at the default of `makeFixture` stays out of the spec. */
export function fixtureSpecOf(name: string, seed: number, dims: DimensionValues): FixtureSpec {
  const layout = dims["layout"];
  if (typeof layout !== "string" || !FIXTURE_LAYOUTS.includes(layout as FixtureKind)) throw new RangeError(`The dimension "layout" is ${String(layout)}, not a fixture kind.`);
  const locality = numberOf(dims, "locality");
  const fixedPorts = numberOf(dims, "fixedPorts");
  return {
    name,
    kind: layout as FixtureKind,
    nodes: numberOf(dims, "nodes"),
    edgesPerNode: numberOf(dims, "edgesPerNode"),
    seed,
    ...(locality === FIXTURE_LOCALITY ? {} : { locality }),
    ...(fixedPorts === 0 ? {} : { fixedPorts }),
  };
}

/**
 * This function gives the parameters of the generator record of a fixture board: the spec without its name and its seed.
 * Thus the record of each screen board stays the record of today, for example `{ kind, nodes, edgesPerNode, fixedPorts }` of `small-clustered`.
 */
export function fixtureParams(spec: FixtureSpec): Readonly<Record<string, unknown>> {
  const { name: _name, seed: _seed, ...params } = spec;
  return params;
}

/** This function gives one fixture family with the defaults of its board in the benchmark. */
function fixtureFamily(name: string, meaning: string, defaults: FixtureDefaults): HighwaysFamily {
  return Object.freeze({
    name,
    version: 1,
    owner: "highways",
    meaning,
    dimensions: fixtureDimensions(defaults),
    seeding: "mulberry32 of (seed × 2654435761 + nodes) >>> 0. One stream gives the boxes, the plugs and then the edges, in a fixed order.",
    // The kinds `clustered` and `collections` use `Math.log` and `Math.cos`, and the kind `hubs` uses `**`. Each fixture family has these kinds in `layout`.
    crossEngine: "libm-dependent",
    rngSeed: (seed: number, dims: DimensionValues) => fixtureRngSeed(seed, numberOf(dims, "nodes")),
    generate(seed: number, dims: DimensionValues, context: GenerateContext): HighwaysBoard {
      const spec = fixtureSpecOf(name, seed, dims);
      return { graph: makeFixture(spec, context.random), generator: { name: "fixture", version: 1, params: fixtureParams(spec), seed } };
    },
  });
}

/** The family `tiny-uniform`: 10 nodes at random places. It is the fixture `tiny-uniform` of `FIXTURES` at its defaults. */
export const TINY_UNIFORM: HighwaysFamily = fixtureFamily("tiny-uniform", "A tiny board of nodes at random places: the cost of a strategy at its start.", {
  layout: "uniform",
  nodes: 10,
  edgesPerNode: 1.5,
  fixedPorts: 0,
});

/** The family `small-clustered`: 100 nodes in clusters, with a fixed plug on 20% of the nodes. It is the fixture `small-clustered` at its defaults. */
export const SMALL_CLUSTERED: HighwaysFamily = fixtureFamily("small-clustered", "Nodes in clusters, and fixed plugs on a share of the nodes.", {
  layout: "clustered",
  nodes: 100,
  edgesPerNode: 2,
  fixedPorts: 0.2,
});

/** The family `dense-groups`: 150 nodes in tight clusters. It is `denseGroupsBoard` at its defaults. */
export const DENSE_GROUPS: HighwaysFamily = fixtureFamily("dense-groups", "Dense clusters whose groups overlap at the far view.", {
  layout: "clustered",
  nodes: 150,
  edgesPerNode: 2,
  fixedPorts: 0,
});
