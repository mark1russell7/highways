// BENCH-PAIRS-HEAP probe 2: the time and the heap of the new route measures on the routers that run at 100 000 nodes.
// Run with node --expose-gc --max-old-space-size=<n>. Arguments: the worktree root as a file URL, a comma list of node counts.
const root = process.argv[2]!;
const sizes = (process.argv[3] ?? "5000,10000").split(",").map(Number);
const { makeFixture } = await import(`${root}/packages/core/src/fixtures.ts`);
const { ROUTERS } = await import(`${root}/packages/core/src/routers/index.ts`);
const { routePairCrossings } = await import(`${root}/packages/core/src/bench/quality.ts`);
const { ambiguity } = await import(`${root}/packages/core/src/bench/measures/bundles.ts`);
const gc = (globalThis as { gc?: () => void }).gc!;
const mb = (b: number): number => Math.round(b / 1e5) / 10;
function measure(label: string, run: () => unknown): Record<string, number> {
  gc();
  const base = process.memoryUsage().heapUsed;
  const t = performance.now();
  run();
  const ms = Math.round(performance.now() - t);
  const after = process.memoryUsage().heapUsed;
  return { [`${label}Ms`]: ms, [`${label}HeapMb`]: mb(after - base) };
}
for (const nodes of sizes) {
  const graph = makeFixture({ name: `probe-${nodes}`, kind: "clustered", nodes, edgesPerNode: 2, seed: 8 });
  for (const name of ["straight", "plugs"]) {
    const router = (ROUTERS as { name: string; route: (g: unknown) => { routes: { points: unknown[] }[] } }[]).find((r) => r.name === name)!;
    const result = router.route(graph);
    const points = result.routes.reduce((s, r) => s + r.points.length, 0);
    console.log(JSON.stringify({ nodes, router: name, routes: result.routes.length, points, ...measure("amb", () => ambiguity(graph, result.routes)), ...measure("pairs", () => routePairCrossings(result.routes)) }));
  }
}
