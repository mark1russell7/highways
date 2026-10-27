import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CASES } from "../cases.ts";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import type { Graph } from "../model.ts";
import { laneRoutes, runKey, segmentsOf } from "../segments.ts";
import { sectionsRouter, type SectionsOptions } from "./sections.ts";

/**
 * The digests of the results of version 0.1.2. A host app pins `^0.1.2`, so a change that only makes the router faster
 * keeps each digest. A digest covers the routes, the shared runs, the levels with their links, the run keys and the lane routes.
 * ER3a changed the level links of three digests: `case-dense-groups` with both options, and `small-clustered` with the options `site`.
 * Those links went through other groups before. The routes, the runs, the run keys and the lane routes did not change.
 * ER3b changed the routes of the boards whose edges took the hubs out and back.
 */
const DIGESTS: Readonly<Record<string, string>> = {
  "case-dense-groups/site": "68ca69c53fc5a65cc829439c1be5704db97e682d694f02a1e663cfac23218a13",
  "case-dense-groups/sections": "e48e1fbe9bbe8fe28793c4da80b924ddc243c0dc986f0f7c52eb5e6038703fc2",
  "case-hub-chain/site": "9b57f4d77521ab1a89e7eb5051d1961f83cbeaf60c0e4c0b916a62e76c7b5ca7",
  "case-hub-chain/sections": "7c0c3388a8ed0510aba4d8bea9d4b46848c2533b592a10e792db6ef802ee2e8b",
  "case-many-groups/site": "6586e7682f3bf4691121fc937da7ac82df5459fb2e964a2a39fd96b87ef1a9d7",
  "case-many-groups/sections": "35108adacf5948cbc90d25fb127eb0fe1a170ce70de2e1983d9f51629c75166e",
  "small-clustered/site": "6be966b0b4b9aa74fab2e4d75a0183fba159d29410e5ab5d6ad6ee9cfb111b51",
  "small-clustered/sections": "abd394589bd0bf68a4f5b64fa34ed5a2ce48b1a7995b5f1c10d451779fd8299f",
};

/** The options of the router of the example boards of the site, and the defaults. */
const OPTIONS: readonly SectionsOptions[] = [
  { name: "site", margin: 20, stretch: 3, cap: 6 },
  { name: "sections" },
];

const GRAPHS: readonly [string, () => Graph][] = [
  ...CASES.map((c): [string, () => Graph] => [c.name, c.make]),
  ["small-clustered", () => makeFixture(FIXTURES.find((f) => f.name === "small-clustered")!)],
];

/** This function gives the digest of the result of a router on a graph, with the data that a host app reads from it. */
function digest(graph: Graph, options: SectionsOptions): string {
  const result = sectionsRouter(options).route(graph);
  const segments = segmentsOf(result);
  const keys = segments.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges));
  const lanes = laneRoutes(segments, new Set(keys), 2.4, 16);
  return createHash("sha256").update(JSON.stringify({ result, keys, lanes })).digest("hex");
}

describe("the output of the sections router", () => {
  for (const [name, make] of GRAPHS)
    for (const options of OPTIONS)
      it(`stays the same on ${name} with the options ${options.name}`, () => {
        expect(digest(make(), options)).toBe(DIGESTS[`${name}/${options.name}`]);
      });
});
