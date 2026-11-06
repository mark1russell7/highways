import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CASES } from "../cases.ts";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import type { Graph, Router } from "../model.ts";
import { laneRoutes, runKey, segmentsOf } from "../segments.ts";
import { ROUTERS } from "./index.ts";
import { trunksRouter } from "./trunks.ts";
import { withoutRoom } from "./without-room.ts";

// The digests of the routers `trunks`, `trunks-all`, `shared` and `shared-all` before the step `highway` (HWY-STEP).
// The highway strategies `keys` and `shared-ways` read these routers. The routers must give the same bytes.
// ROUTE-TIE changed ten digests: the walk back of the corner search breaks a tie by geometry, not by the order of the search.
// LANE-ORDER changed the lane order of the cyclic runs of five digests: `shared` and `shared-all` on `case-dense-groups` and `small-clustered`,
// and `shared-all` on `case-many-groups`. The points of the routes did not change.
const BEFORE: Readonly<Record<string, string>> = {
  "case-dense-groups/trunks": "aa510ff5ebd61c528767b034839babd46a026a72ff903ab82f2ddc2af6ea88a4",
  "case-dense-groups/trunks-all": "c604691cc6d84c7760f137013e44b62491230e65bb8bf4c1b01494d461798cc4",
  "case-dense-groups/shared": "8550d446324df32d897f7c7a74850b7231cc99ecf9807950ad0c15004152a753",
  "case-dense-groups/shared-all": "111f970bb8198d16cd30856239b4f34383ab6197addb2719e390f80fe062ed80",
  "case-hub-chain/trunks": "ada6919ea4b0f46145e1f065f50310fe32375a0e6fee93824caf424a696945b2",
  "case-hub-chain/trunks-all": "3e8391ef30d4a80bb0baa646a7fa8c23c7e34a975a5db526d70bf7d8e0903407",
  "case-hub-chain/shared": "5312213c8568420d40d7a8ff355738a68a49a7ed1e09b18be00e3d84eb185177",
  "case-hub-chain/shared-all": "1825db92532794f5ef37d1926c0956e9b736d18a021c9e51c2d6a24e49d3d0f1",
  "case-many-groups/trunks": "79b42c01045d8db20d8eec53e81a5ceee01332676c789d147592e522f283e513",
  "case-many-groups/trunks-all": "5f4e8bbc497655fbad92663c1724a242db9b4bd1ef2fe9cfc4278dad6f79bb97",
  "case-many-groups/shared": "7339eb2cc15c82d2f971cd34363e9be59bb05832bad6996d3de025ef86169e89",
  "case-many-groups/shared-all": "6dbe4c713df5d87f66ccaa05da09925e40545a74b3faf30b7ba6e9e36770ed63",
  "small-clustered/trunks": "4b2dbffeb4a701c5310307de518943512ff4f3e23c7522ef4badce044a329411",
  "small-clustered/trunks-all": "72f57d5ee1367d5cfde4b1069937771a34eea190ca23b62045e4b63a7e96a8ac",
  "small-clustered/shared": "1210cdcc13e4d7627928032db6c9d1620d598f4d67ad3b403f3a8f620fb0f1de",
  "small-clustered/shared-all": "bb8537a672cffe07d4622d639a13e45f7b5b1d4e2c1f75f4a7831e0275ed18e9",
};

const routers: readonly Router[] = [
  ROUTERS.find((r) => r.name === "trunks")!,
  trunksRouter({ name: "trunks-all", rule: () => "all" }),
  ROUTERS.find((r) => r.name === "shared")!,
  ROUTERS.find((r) => r.name === "shared-all")!,
];

const graphs: readonly (readonly [string, () => Graph])[] = [
  ...CASES.map((c) => [c.name, c.make] as const),
  ["small-clustered", () => makeFixture(FIXTURES.find((f) => f.name === "small-clustered")!)],
];

/** This function gives the digest of the routes, the run keys and the lane routes of a router on a graph. */
function digest(router: Router, graph: Graph): string {
  // The field `room` tells the free room of a way and moves no route. With no room, the lanes keep their old form, so each digest also pins that form.
  const result = withoutRoom(router.route(graph));
  const segments = segmentsOf(result);
  const keys = segments.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges));
  const lanes = laneRoutes(segments, new Set(keys), 2.4, 16);
  return createHash("sha256").update(JSON.stringify({ result, keys, lanes })).digest("hex");
}

describe("the routers that the highway strategies read (HWY-STEP)", () => {
  it("give the same bytes as before the step highway", () => {
    const now: Record<string, string> = {};
    for (const [name, make] of graphs) for (const router of routers) now[`${name}/${router.name}`] = digest(router, make());
    expect(now).toEqual(BEFORE);
  });
});
