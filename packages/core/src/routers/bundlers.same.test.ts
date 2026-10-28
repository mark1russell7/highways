import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CASES } from "../cases.ts";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import type { Graph, Router } from "../model.ts";
import { laneRoutes, runKey, segmentsOf } from "../segments.ts";
import { ROUTERS } from "./index.ts";
import { trunksRouter } from "./trunks.ts";

// The digests of the routers `trunks`, `trunks-all`, `shared` and `shared-all` before the step `highway` (HWY-STEP).
// The highway strategies `keys` and `shared-ways` read these routers. The routers must give the same bytes.
// LANE-ORDER changed the lane order of the cyclic runs of five digests: `shared` and `shared-all` on `case-dense-groups` and `small-clustered`,
// and `shared-all` on `case-many-groups`. The points of the routes did not change.
const BEFORE: Readonly<Record<string, string>> = {
  "case-dense-groups/trunks": "9cb18c4e941e1f4fa34ac9ddc6281b596262c5a94b122dc75d17fb139d1d3cd9",
  "case-dense-groups/trunks-all": "7caa5d1cab9a9086f9b14cf6003ad521e7ca0f0a6b16eea5bfce8126fd9dd998",
  "case-dense-groups/shared": "0559ab81504e97f6045a67cb350385b002162f6116291b3ef613086d7b4f1d13",
  "case-dense-groups/shared-all": "a21acb6da4b90ea69ade3191e37e1f4e2dcfedeef9dcd9a461de92abde04ecb0",
  "case-hub-chain/trunks": "872bfc0ee81c1216723afc372908dc76bdac7dd544e0a40f56743c4c233d14c9",
  "case-hub-chain/trunks-all": "8adfa12006d9a7ca87f5aa850927129a2f3985c2a0dc86491c4904036cb42c76",
  "case-hub-chain/shared": "40c8647849b6782adb7bba7e7b14a57c5689590e02727a9c2d82672151be4239",
  "case-hub-chain/shared-all": "fbd13f3bf72af4b76c5c6c682b192724d429ed4f8260efe50b250bb91ae17d80",
  "case-many-groups/trunks": "c8b476e28be45c8572abf91b88109c59c7e0a4675331088e318ccce81c663f4d",
  "case-many-groups/trunks-all": "92c86e2588f5935cef8d8c0f2fc23324c55b48f637e3be4f7e239df86a7170f8",
  "case-many-groups/shared": "21e3fc273f18928075d4dd53f314346fb39e9d1ec2bc59dad9d19c415f3b41f1",
  "case-many-groups/shared-all": "8c3fcc3e6e82b0d2e1a264bbfd2464f8370a6995edddb31f3c051fab7be0849d",
  "small-clustered/trunks": "4b2dbffeb4a701c5310307de518943512ff4f3e23c7522ef4badce044a329411",
  "small-clustered/trunks-all": "72f57d5ee1367d5cfde4b1069937771a34eea190ca23b62045e4b63a7e96a8ac",
  "small-clustered/shared": "9f3751b84bd9d3067d6e3d72a61eca951832435b01f4e4384c0638c8a11e8005",
  "small-clustered/shared-all": "72602aa96ccd2549b043d591837fbd27997633f3024c5b758340c4e4c1e286a3",
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
  const result = router.route(graph);
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
