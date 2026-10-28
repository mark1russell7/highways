// The 3 case families of the screen sets: `hub-chain`, `many-groups` and `packed-grid` (CORPUS-GEN).
import type { CorpusDimension, DimensionValues, GenerateContext } from "@mark1russell7/layout-contract";
import { hubChainBoard, manyGroupsBoard, packedGridBoard } from "../cases.ts";
import type { Graph } from "../model.ts";
import { changedDimensions, numberDimension, numberOf, type HighwaysBoard, type HighwaysFamily } from "./model.ts";

/** This function gives a whole-number dimension with a linear scale. */
const count = (name: string, min: number, max: number, value: number, meaning: string): CorpusDimension =>
  numberDimension({ name, kind: "int", min, max, default: value, meaning });

/** This function gives the numbers of the full dimension values, by name. */
function numbers(dimensions: readonly CorpusDimension[], dims: DimensionValues): Record<string, number> {
  return Object.fromEntries(dimensions.map((d) => [d.name, numberOf(dims, d.name)]));
}

/** The fields of a case family of `caseFamily`. */
interface CaseFields {
  readonly name: string;
  readonly meaning: string;
  readonly dimensions: readonly CorpusDimension[];
  /** The name of the generator record, for example `case.hub-chain`. */
  readonly generator: string;
  /** This function gives the parameters of the generator record from the full values. The default gives the values that differ from their defaults. */
  readonly params?: (dims: DimensionValues) => Readonly<Record<string, unknown>>;
  /** This function makes the board. It gets the values by name, the input seed and the source of random numbers of the registry. */
  readonly make: (values: Readonly<Record<string, number>>, seed: number, random: () => number) => Graph;
}

/** This function gives a case family. Its stream is mulberry32 of the input seed, and it uses only the stream, `Math.floor` and `Math.ceil`. */
function caseFamily(fields: CaseFields): HighwaysFamily {
  const { name, meaning, dimensions } = fields;
  const params = fields.params ?? ((dims: DimensionValues) => changedDimensions(dimensions, dims));
  return Object.freeze({
    name,
    version: 1,
    owner: "highways",
    meaning,
    dimensions,
    seeding: "mulberry32 of the input seed. The fixed part of the board takes no number. Then one stream gives the random links.",
    crossEngine: "exact",
    generate(seed: number, dims: DimensionValues, context: GenerateContext): HighwaysBoard {
      return { graph: fields.make(numbers(dimensions, dims), seed, context.random), generator: { name: fields.generator, version: 1, params: params(dims), seed } };
    },
  });
}

/** The dimensions of `hub-chain`. */
const HUB_CHAIN_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("rows", 1, 8, 3, "The number of rows of cards."),
  count("cols", 4, 64, 32, "The number of cards in each row."),
  count("long", 0, 200, 40, "The number of tries for a long link between two rows."),
  count("gap", 0, 96, 48, "The free space between two cards, in units."),
]);

/** The family `hub-chain`: rows of cards in a chain, and long links between rows. At its defaults, it is `hubChainBoard`. */
export const HUB_CHAIN: HighwaysFamily = caseFamily({
  name: "hub-chain",
  meaning: "Rows of cards in a chain, and long links that climb a chain of hubs away from their targets.",
  dimensions: HUB_CHAIN_DIMENSIONS,
  generator: "case.hub-chain",
  make: (v, seed, random) => hubChainBoard({ seed, rows: v["rows"]!, cols: v["cols"]!, long: v["long"]!, gap: v["gap"]! }, random),
});

/** The dimensions of `many-groups`. */
const MANY_GROUPS_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("groupCols", 1, 16, 8, "The number of columns of groups."),
  count("groupRows", 1, 8, 4, "The number of rows of groups."),
  count("perGroup", 1, 16, 4, "The number of cards in each group."),
  count("crossLinksPerGroup", 0, 8, 3, "The number of random links between groups, for each group."),
  count("groupGap", 0, 120, 60, "The free space between two groups, in units."),
]);

/** The family `many-groups`: groups of cards in a grid, with links between groups. At its defaults, it is `manyGroupsBoard`. */
export const MANY_GROUPS: HighwaysFamily = caseFamily({
  name: "many-groups",
  meaning: "A grid of groups of cards, with random links between groups that go around the board.",
  dimensions: MANY_GROUPS_DIMENSIONS,
  generator: "case.many-groups",
  make: (v, seed, random) =>
    manyGroupsBoard(
      { seed, groupCols: v["groupCols"]!, groupRows: v["groupRows"]!, perGroup: v["perGroup"]!, crossLinksPerGroup: v["crossLinksPerGroup"]!, groupGap: v["groupGap"]! },
      random,
    ),
});

/** The dimensions of `packed-grid`. */
const PACKED_GRID_DIMENSIONS: readonly CorpusDimension[] = Object.freeze([
  count("cols", 2, 32, 12, "The number of columns of boxes."),
  count("rows", 2, 32, 8, "The number of rows of boxes."),
  count("long", 0, 256, 48, "The number of long links between boxes far apart."),
  count("reach", 1, 4, 2, "The largest step, in rows and in columns, of the link of a box to a box near it."),
]);

/**
 * The family `packed-grid`: a grid of boxes that touch. At its defaults, it is `packedGridBoard` with 12 columns, 8 rows and 48 long links.
 * Its generator record always has `cols`, `rows` and `long`, as the screen sets of today. It has `reach` only away from its default.
 */
export const PACKED_GRID: HighwaysFamily = caseFamily({
  name: "packed-grid",
  meaning: "A packed grid of boxes that touch, with no channel for the routes.",
  dimensions: PACKED_GRID_DIMENSIONS,
  generator: "case.packed-grid",
  params: (dims) => {
    const reach = numberOf(dims, "reach");
    return { cols: numberOf(dims, "cols"), rows: numberOf(dims, "rows"), long: numberOf(dims, "long"), ...(reach === 2 ? {} : { reach }) };
  },
  make: (v, seed, random) => packedGridBoard({ seed, cols: v["cols"]!, rows: v["rows"]!, long: v["long"]!, reach: v["reach"]! }, random),
});
