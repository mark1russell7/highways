import { describe, expect, it } from "vitest";
import type { Graph } from "../../model.ts";
import { box, commonTests, flows } from "../fixtures.test-util.ts";
import { LINK_COMMUNITY_DEFAULTS, linkCommunities, linkCommunityGroups, linkCommunityPlan } from "./index.ts";

// Two triangles (0, 1, 2) and (3, 4, 5) with the bridge (2, 3).
const twoTriangles = [
  [0, 1],
  [1, 2],
  [2, 0],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 3],
].map(([u, v]) => ({ u: u!, v: v! }));

// One hub on the left with three edges to three near nodes on the right, and one edge to a far node.
const fan: Graph = {
  nodes: [{ id: "h", box: box(0, 100) }, ...[0, 1, 2].map((i) => ({ id: `r${i}`, box: box(600, 70 + 30 * i) })), { id: "far", box: box(300, 2000) }],
  edges: [
    ...[0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `r${i}` }, target: { node: "h" } })),
    { id: "f", source: { node: "h" }, target: { node: "far" } },
  ],
};

describe("the highway strategy link-communities (HWY-030)", () => {
  it("cuts the tree of two triangles at the best partition density: one community for each triangle, and the bridge alone", () => {
    const label = [...linkCommunities(6, twoTriangles, 0)];
    expect(new Set(label.slice(0, 3)).size).toBe(1);
    expect(new Set(label.slice(4)).size).toBe(1);
    expect(label[0]).not.toBe(label[4]);
    expect(label[3]).not.toBe(label[0]);
    expect(label[3]).not.toBe(label[4]);
  });

  it("joins all the edges with a low fixed threshold", () => {
    expect(new Set(linkCommunities(6, twoTriangles, 0.1)).size).toBe(1);
  });

  it("orients the edges of a community out of its hub, and removes an edge with a far end", () => {
    const groups = linkCommunityGroups({ graph: fan }, LINK_COMMUNITY_DEFAULTS);
    expect(groups.get("e1")!.key).toBe(groups.get("e0")!.key);
    expect(groups.get("e2")!.key).toBe(groups.get("e0")!.key);
    expect(groups.get("e0")!.flip).toBe(true);
    expect(groups.has("f")).toBe(false);
  });

  it("gives no community to edges with no common node", () => {
    expect(linkCommunityGroups({ graph: flows }, LINK_COMMUNITY_DEFAULTS).size).toBe(0);
  });

  commonTests("link-communities", LINK_COMMUNITY_DEFAULTS, linkCommunityPlan, [flows, fan]);
});
