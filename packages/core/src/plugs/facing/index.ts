import { center } from "../../geom.ts";
import { nodeIndex } from "../../model.ts";
import { placePlug } from "../../plugs.ts";
import type { PlugPair, PlugInput } from "../../strategies/model.ts";

/**
 * This function gives the plugs of the plug strategy `facing`: each free plug faces the other end of its edge (`placePlug`).
 * A fixed plug stays at its point, and a plug with a side stays on that side. It is the default of the router `corners`.
 * The output has one entry for each edge with two known nodes, in the order of the edges.
 */
export function facingEnds(input: PlugInput): PlugPair[] {
  const { graph } = input;
  const byId = nodeIndex(graph);
  const out: PlugPair[] = [];
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) continue;
    out.push({ edge: e.id, source: placePlug(s, e.source, center(t.box)), target: placePlug(t, e.target, center(s.box)) });
  }
  return out;
}
