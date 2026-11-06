// A hand read of THIN-GAP on `packed-grid`: for some routes of `corners` with the field `near`, the least distance to each named box, the points, and the gaps between the boxes.
// Start: `node scripts/probe-thin-gap-sample.ts [seed] [count]`.
import { segmentBoxDistance } from "../src/geom.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import { cornersRouter } from "../src/routers/index.ts";

const seed = Number(process.argv[2] ?? 0);
const count = Number(process.argv[3] ?? 4);
const { graph } = highwaysRegistry().generate("packed-grid", seed, {} as never);
const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
const xs = [...new Set(graph.nodes.map((n) => n.box.x))].sort((a, b) => a - b);
console.log(JSON.stringify({ seed, nodes: graph.nodes.length, firstBoxes: graph.nodes.slice(0, 3).map((n) => n.box), columns: xs.slice(0, 5) }));
const routes = cornersRouter({ name: "corners" }).route(graph).routes.filter((r) => r.near !== undefined);
for (const r of routes.slice(0, count)) {
  const e = graph.edges.find((x) => x.id === r.edge)!;
  const d = r.near!.map((id) => {
    let least = Infinity;
    for (let i = 1; i < r.points.length; i++) least = Math.min(least, segmentBoxDistance(r.points[i - 1]!, r.points[i]!, byId.get(id)!.box));
    return { id, box: byId.get(id)!.box, least };
  });
  console.log(JSON.stringify({ edge: r.edge, source: byId.get(e.source.node)!.box, target: byId.get(e.target.node)!.box, points: r.points, near: d }));
}
