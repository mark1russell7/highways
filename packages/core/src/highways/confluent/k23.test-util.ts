import type { Graph } from "../../model.ts";
import { box } from "../fixtures.test-util.ts";

/** A complete biclique K(2, 3): two nodes on the left, three on the right, and an edge from each left node to each right node. */
export const k23: Graph = {
  nodes: [...[0, 1].map((i) => ({ id: `a${i}`, box: box(0, 200 * i) })), ...[0, 1, 2].map((i) => ({ id: `b${i}`, box: box(700, 150 * i) }))],
  edges: [0, 1].flatMap((i) => [0, 1, 2].map((j) => ({ id: `e${i}${j}`, source: { node: `a${i}` }, target: { node: `b${j}` } }))),
};
