import {
  checkProperties,
  FIXTURES,
  makeFixture,
  measureQuality,
  pullApart,
  ROUTERS,
  segmentsOf,
  type Graph,
} from "@mark1russell7/highways";
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

const now = (): number => performance.now();

self.addEventListener("message", (event: MessageEvent<RouteRequest>) => {
  const { id, fixture, router: name } = event.data;
  let reply: RouteReply;
  try {
    const router = ROUTERS.find((r) => r.name === name);
    if (!router) throw new Error(`There is no router "${name}".`);
    const graph = graphOf(fixture);
    const t0 = now();
    const result = router.route(graph);
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
      ...(segments ? { segments } : {}),
      ...(apart ? { apart } : {}),
    };
  } catch (err) {
    reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(reply);
});
