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
 * ER3c changed only the points of the level links of each digest except `small-clustered` with the options `site`.
 * Those links go through the groups now, not around the outer edge.
 */
const DIGESTS: Readonly<Record<string, string>> = {
  "case-dense-groups/site": "c7dad0bc5c890c06d4d2c318d94209b5afaafc3a66f1278dd298b68a3659c654",
  "case-dense-groups/sections": "a638f60af7058efa5987786dab7801ffeeab99025de4798a41320e6305e607e9",
  "case-hub-chain/site": "92941d1b3c12943b6594e57b4dca3702a16feb6bdf3a61176ba4d0e2e957fbd1",
  "case-hub-chain/sections": "3e2d3a656488a21d0aadc0edd5a932e2fcdfdd29be9d891794b005306f0ca696",
  "case-many-groups/site": "da54d7c45c647ac070c24692f1d82e372dae17efcc044ee378f0a5278197f418",
  "case-many-groups/sections": "ea75b3af84bf1bf7aff23040a79660b423c5ac47d7cf3ee5c6940dba4576cb02",
  "small-clustered/site": "6be966b0b4b9aa74fab2e4d75a0183fba159d29410e5ab5d6ad6ee9cfb111b51",
  "small-clustered/sections": "e9a0ee8fb9ba1785b0fb1aa5f60d3cc3af989f9b096be81e35c44e7febf654ba",
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
