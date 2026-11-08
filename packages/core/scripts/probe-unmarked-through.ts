// The probe of UNMARKED-THROUGH: for each built-in router, the routes that go through a box that is not an end, and have no field `through`.
// Start: `node scripts/probe-unmarked-through.ts [seeds] [families]`. Each line of the output is one JSON row.
import { highwaysRegistry } from "../src/families/index.ts";
import { segmentHitsBox } from "../src/geom.ts";
import { listStrategies } from "../src/strategies/model.ts";
import { STRATEGIES } from "../src/strategies/builtins.ts";

const seeds = Number(process.argv[2] ?? 2);
const families = (process.argv[3] ?? "tiny-uniform,small-clustered,dense-groups,frame-rows,maze").split(",");
const reg = highwaysRegistry();
for (const router of listStrategies(STRATEGIES, "router")) {
  let [routes, crossing, unmarked, wrong, skipped] = [0, 0, 0, 0, 0];
  const examples: string[] = [];
  const start = performance.now();
  for (const family of families)
    for (let seed = 0; seed < seeds; seed++) {
      const { graph } = reg.generate(family, seed, {});
      if (router.maxNodes !== undefined && graph.nodes.length > router.maxNodes) {
        skipped++;
        continue;
      }
      const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
      const parents = (id: string): string[] => {
        const out: string[] = [];
        for (let p = byId.get(id)?.parent; p !== undefined; p = byId.get(p)?.parent) out.push(p);
        return out;
      };
      const edges = new Map(graph.edges.map((e) => [e.id, e] as const));
      let result;
      try {
        result = router.run(graph, router.defaults as never);
      } catch (e) {
        examples.push(`${family}/${seed}: throws ${(e as Error).message.slice(0, 80)}`);
        continue;
      }
      for (const r of result.routes) {
        routes++;
        const e = edges.get(r.edge);
        if (!e) continue;
        // The ends and the frames that hold an end do not count, as in the record of an inner route.
        const skip = new Set([e.source.node, e.target.node, ...parents(e.source.node), ...parents(e.target.node)]);
        const hit = new Set<string>();
        for (let i = 1; i < r.points.length; i++) for (const n of graph.nodes) if (!skip.has(n.id) && segmentHitsBox(r.points[i - 1]!, r.points[i]!, n.box)) hit.add(n.id);
        if (hit.size === 0) continue;
        crossing++;
        if (r.through === undefined) {
          unmarked++;
          if (examples.length < 3) examples.push(`${family}/${seed}/${r.edge}: ${[...hit].slice(0, 3).join(",")}`);
        } else if (![...hit].every((h) => r.through!.includes(h))) wrong++;
      }
    }
  console.log(JSON.stringify({ router: router.name, seeds, families, routes, crossing, unmarked, partial: wrong, skipped, ms: Math.round(performance.now() - start), examples }));
}
