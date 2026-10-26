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
 */
const DIGESTS: Readonly<Record<string, string>> = {
  "case-dense-groups/site": "8944b7456b995cf00678c3e11e23a028324e1aeb51a422f87370abcac221b309",
  "case-dense-groups/sections": "846a736f423e86653f385f1ab4bcf2ab07af2cc2d752ea4d1a203bfdfa706343",
  "case-hub-chain/site": "deb11cf3634910091de5fb0df89f3b5655bc3d04634ae383f9a1ce9197dbcceb",
  "case-hub-chain/sections": "a59d89aed79d831b94422188cf72860fa90806f3d5f68a613ba2accda1824cf0",
  "case-many-groups/site": "4f2a017a055c32bdbe25eb4017c0aefa2325f44f75deebfda543f15d4413bd99",
  "case-many-groups/sections": "09af86e040e4afe5c45d699c1f080b2fa860b849a7d526af5be2ac5bbedc2b52",
  "small-clustered/site": "e5433afdb9c09b40e6a353f81c7da15f74e04d851ee1dfc1dbdad27c425d0f20",
  "small-clustered/sections": "d280bf3dfc399028eff366405019a052ec4fbf5c3cc5f6d8606692001b1d2e11",
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
