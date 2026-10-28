import {
  checkProperties,
  FIXTURES,
  makeFixture,
  measureQuality,
  pullApart,
  segmentsOf,
  type Graph,
} from "@mark1russell7/highways";
import { demoRoute } from "./demo-data.ts";
import { genGraph, writeGen, type GenSpec } from "./generated.ts";
import type { RouteReply, RouteRequest } from "./protocol.ts";

// The routing runs here, so the page stays responsive while a router works on 1 000 nodes.
const graphs = new Map<string, Graph>();

const graphOf = (name: string): Graph => {
  let g = graphs.get(name);
  if (!g) {
    const spec = FIXTURES.find((f) => f.name === name);
    if (!spec) throw new Error(`There is no fixture "${name}".`);
    g = makeFixture(spec);
    graphs.set(name, g);
  }
  return g;
};

/** This function gives a generated board. The worker keeps the last 8 boards. */
const genOf = (spec: GenSpec): Graph => {
  const key = `gen:${writeGen(spec).toString()}`;
  let g = graphs.get(key);
  if (!g) {
    g = genGraph(spec);
    graphs.set(key, g);
    for (const k of graphs.keys()) if (k.startsWith("gen:") && graphs.size > FIXTURES.length + 8) graphs.delete(k);
  }
  return g;
};

const now = (): number => performance.now();

self.addEventListener("message", (event: MessageEvent<RouteRequest>) => {
  const { id, fixture, pick, gen } = event.data;
  let reply: RouteReply;
  try {
    const t0 = now();
    const input = gen ? genOf(gen) : graphOf(fixture);
    const { graph, result } = demoRoute(input, pick);
    const ms = now() - t0;
    const shared = (result.runs?.length ?? 0) + (result.bundles?.length ?? 0) > 0;
    const segments = shared ? segmentsOf(result) : undefined;
    const apart = segments ? pullApart(segments, { spacing: 2.4, maxWidth: 16 }) : undefined;
    reply = {
      id,
      ok: true,
      result,
      ms,
      quality: measureQuality(graph, result),
      violations: checkProperties(graph, result, 1000).length,
      ...(gen ? { graph: input } : {}),
      ...(pick.room ? { nodes: graph.nodes } : {}),
      ...(segments ? { segments } : {}),
      ...(apart ? { apart } : {}),
    };
  } catch (err) {
    reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(reply);
});
