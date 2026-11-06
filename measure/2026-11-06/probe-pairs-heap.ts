// BENCH-PAIRS-HEAP probe: the heap of routePairCrossings beside measureQuality, on clustered boards of growing size.
// Run with node --expose-gc. Argument 1: the worktree root as a file URL. Argument 2: a comma list of node counts.
const root = process.argv[2]!;
const sizes = (process.argv[3] ?? "1000,2000,4000").split(",").map(Number);
const routers = (process.argv[4] ?? "trunks,shared,shared-all,corners").split(",");
const { makeFixture } = await import(`${root}/packages/core/src/fixtures.ts`);
const { ROUTERS: MAIN, oneTrunkRouter, perimeterRouter } = await import(`${root}/packages/core/src/routers/index.ts`);
const ROUTERS = [...MAIN, { ...oneTrunkRouter, name: "one-trunk", route: (g: unknown) => oneTrunkRouter.route(g) }, { name: "perimeter", route: (g: unknown) => perimeterRouter.route(g) }];
const { measureQuality, routePairCrossings } = await import(`${root}/packages/core/src/bench/quality.ts`);

const gc = (globalThis as { gc?: () => void }).gc!;
const mb = (b: number): number => Math.round(b / 1e5) / 10;
for (const nodes of sizes) {
  const graph = makeFixture({ name: `probe-${nodes}`, kind: "clustered", nodes, edgesPerNode: 2, seed: 8 });
  for (const name of routers) {
    const router = (ROUTERS as { name: string; route: (g: unknown) => { routes: { points: unknown[] }[] } }[]).find((r) => r.name === name);
    if (!router) continue;
    const result = router.route(graph);
    const points = result.routes.reduce((s, r) => s + r.points.length, 0);
    gc();
    let base = process.memoryUsage().heapUsed;
    let t = performance.now();
    measureQuality(graph, result);
    const qMs = performance.now() - t;
    const qPeak = mb(process.memoryUsage().heapUsed - base);
    gc();
    base = process.memoryUsage().heapUsed;
    let peak = base;
    const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().heapUsed)), 5);
    t = performance.now();
    const pairs = routePairCrossings(result.routes);
    const pMs = performance.now() - t;
    clearInterval(timer);
    const after = process.memoryUsage().heapUsed;
    console.log(JSON.stringify({ nodes, router: name, routes: result.routes.length, points, qualityMs: Math.round(qMs), qualityHeapMb: qPeak, pairsMs: Math.round(pMs), pairsHeapAfterMb: mb(after - base), pairs: pairs.pairs, estimated: pairs.estimated }));
  }
}
