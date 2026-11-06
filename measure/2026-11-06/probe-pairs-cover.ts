// BENCH-PAIRS-HEAP probe: the coverage of the 95% interval of a sampled pair count, against the full count, over many seeds.
// Argument 1: the worktree root as a file URL. Argument 2: a comma list of routers. Argument 3: nodes. Argument 4: seeds.
const root = process.argv[2]!;
const routers = (process.argv[3] ?? "trunks,plugs").split(",");
const nodes = Number(process.argv[4] ?? 300);
const seeds = Number(process.argv[5] ?? 200);
const { makeFixture } = await import(`${root}/packages/core/src/fixtures.ts`);
const { ROUTERS } = await import(`${root}/packages/core/src/routers/index.ts`);
const { routePairCrossings } = await import(`${root}/packages/core/src/bench/quality.ts`);

for (const kind of ["clustered", "grid"]) {
  const graph = makeFixture({ name: `cover-${kind}`, kind, nodes, edgesPerNode: 2, seed: 3 });
  for (const name of routers) {
    const router = (ROUTERS as { name: string; route: (g: unknown) => { routes: { points: unknown[] }[] } }[]).find((r) => r.name === name);
    if (!router) continue;
    const routes = router.route(graph).routes;
    const points = routes.reduce((s, r) => s + r.points.length, 0);
    const full = routePairCrossings(routes);
    for (const share of [0.5, 0.25, 0.1]) {
      let inside = 0;
      let width = 0;
      let sum = 0;
      const t = performance.now();
      for (let seed = 0; seed < seeds; seed++) {
        const e = routePairCrossings(routes, { maxPoints: points * share, seed });
        if (e.low <= full.pairs && full.pairs <= e.high) inside++;
        width += (e.high - e.low) / Math.max(1, full.pairs);
        sum += e.pairs;
      }
      const ms = (performance.now() - t) / seeds;
      console.log(JSON.stringify({ kind, router: name, routes: routes.length, points, full: full.pairs, fullEstimated: full.estimated, share, coverage: inside / seeds, meanWidth: +(width / seeds).toFixed(3), bias: +((sum / seeds - full.pairs) / Math.max(1, full.pairs)).toFixed(4), msEach: Math.round(ms) }));
    }
  }
}
