// Throwaway. For each route of `corners`, all paths of the corner graph with the shortest raw length, and the best of them after `pull`.
// Also the boards where `shared` differs from `corners` on the seeds of the screen set.
import { SCREEN_SETS } from "../src/bench/screen/set.ts";
import { ROUTERS } from "../src/routers/index.ts";
import { center, dist, type Point } from "../src/geom.ts";
import { nodeIndex, outerGraph, type Route } from "../src/model.ts";
import { placePlug } from "../src/plugs.ts";
import { WayFinder } from "../src/ways.ts";

const TOL = 1e-9;
const CAP = 2000;
const [a, b] = [ROUTERS.find((r) => r.name === "corners")!, ROUTERS.find((r) => r.name === "shared")!];
const length = (p: readonly Point[]): number => p.reduce((s, v, i) => (i ? s + dist(p[i - 1]!, v) : s), 0);
const same = (p: readonly Point[], q: readonly Point[]): boolean => p.length === q.length && p.every((v, i) => Math.abs(v.x - q[i]!.x) + Math.abs(v.y - q[i]!.y) < 1e-9);

/** Dijkstra over the corners from the ends in `starts`, with a plain array scan on a small heap. */
function reach(n: number, adj: readonly (readonly number[])[], points: readonly Point[], start: Point, starts: readonly number[]): Float64Array {
  const g = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  const heap: [number, number][] = [];
  const push = (k: number, i: number): void => {
    heap.push([k, i]);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p]![0] <= heap[c]![0]) break;
      [heap[p], heap[c]] = [heap[c]!, heap[p]!];
      c = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const [l, r] = [2 * c + 1, 2 * c + 2];
        let m = c;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c]!, heap[m]!];
        c = m;
      }
    }
    return top;
  };
  for (const j of starts) {
    const d = dist(start, points[j]!);
    if (d < g[j]!) {
      g[j] = d;
      push(d, j);
    }
  }
  while (heap.length > 0) {
    const [k, i] = pop();
    if (done[i] || k > g[i]!) continue;
    done[i] = 1;
    for (const j of adj[i]!) {
      const d = k + dist(points[i]!, points[j]!);
      if (d < g[j]!) {
        g[j] = d;
        push(d, j);
      }
    }
  }
  return g;
}

const families = SCREEN_SETS["screen-v3"]!.families;
const rows: string[] = [];
const all = { routes: 0, tied: 0, better: 0, capped: 0, gain: 0, length: 0, paths: 0, pullMs: 0, routeMs: 0 };
for (const f of families) {
  const t = { boardsDiffer: 0, routesDiffer: 0, routes: 0, tied: 0, better: 0, capped: 0, gain: 0, length: 0, worst: 0, paths: 0, skipped: 0, ways: 0 };
  const perBoard: number[] = [];
  for (let k = 0; k < f.seeds; k++) {
    const board = f.make(k);
    const t0 = performance.now();
    const ra = a.route(board);
    all.routeMs += performance.now() - t0;
    const rb = b.route(board);
    t.ways += rb.runs?.length ?? 0;
    const A = new Map(ra.routes.map((r: Route) => [r.edge, r.points]));
    const B = new Map(rb.routes.map((r: Route) => [r.edge, r.points]));
    let differ = 0;
    for (const [e, p] of A) if (!same(p, B.get(e)!)) differ++;
    t.routesDiffer += differ;
    if (differ > 0) t.boardsDiffer++;

    const graph = outerGraph(board);
    const byId = nodeIndex(graph);
    const ways = new WayFinder(graph.nodes, {});
    const c = ways.corners;
    const n = c.points.length;
    const adj = Array.from({ length: n }, (_, i) => c.neighbours(i));
    let boardGain = 0;
    for (const e of graph.edges) {
      const s = byId.get(e.source.node);
      const u = byId.get(e.target.node);
      if (!s || !u) continue;
      const ps = placePlug(s, e.source, center(u.box));
      const pt = placePlug(u, e.target, center(s.box));
      const [from, to] = [ways.out(ps), ways.out(pt)];
      const chosen = c.path(from, to);
      t.routes++;
      if (!chosen) continue;
      const route = [ps.point, ...c.pull(chosen), pt.point];
      if (!same(route, A.get(e.id) ?? [])) {
        t.skipped++;
        continue;
      }
      t.length += length(route);
      if (chosen.length === 2) continue;
      const [fs, ts] = [c.nearestVisible(from, 16), c.nearestVisible(to, 16)];
      if (fs.length === 0 || ts.length === 0) {
        t.skipped++;
        continue;
      }
      const G = reach(n, adj, c.points, from, fs);
      const D = reach(n, adj, c.points, to, ts);
      let best = Infinity;
      for (const j of ts) best = Math.min(best, G[j]! + dist(c.points[j]!, to));
      const inner = chosen.slice(1, -1);
      const chosenLength = length(route);
      let bestAfter = chosenLength;
      let count = 0;
      let capped = false;
      const stack: number[] = [];
      const seen = new Set<number>();
      const tailOf = new Set(ts);
      const walk = (i: number): void => {
        if (capped) return;
        stack.push(i);
        seen.add(i);
        if (tailOf.has(i) && Math.abs(G[i]! + dist(c.points[i]!, to) - best) <= TOL) {
          count++;
          if (count > CAP) capped = true;
          else {
            const t1 = performance.now();
            const after = [ps.point, ...c.pull([from, ...stack.map((v) => c.points[v]!), to]), pt.point];
            all.pullMs += performance.now() - t1;
            bestAfter = Math.min(bestAfter, length(after));
          }
        }
        for (const j of adj[i]!) {
          if (seen.has(j)) continue;
          if (G[i]! + dist(c.points[i]!, c.points[j]!) + D[j]! <= best + TOL) walk(j);
        }
        stack.pop();
        seen.delete(i);
      };
      for (const i of fs) if (dist(from, c.points[i]!) + D[i]! <= best + TOL && Math.abs(G[i]! - dist(from, c.points[i]!)) <= TOL) walk(i);
      void inner;
      t.paths += count;
      if (capped) t.capped++;
      if (count > 1) t.tied++;
      const gain = chosenLength - bestAfter;
      if (gain > 1e-6) {
        t.better++;
        t.gain += gain;
        boardGain += gain;
        t.worst = Math.max(t.worst, gain);
      }
    }
    perBoard.push(boardGain);
  }
  const med = [...perBoard].sort((x, y) => x - y)[perBoard.length >> 1] ?? 0;
  rows.push(`${f.name}\tboards ${f.seeds}\tways ${t.ways}\tdiffer boards ${t.boardsDiffer} routes ${t.routesDiffer}\troutes ${t.routes} tied ${t.tied} better ${t.better} capped ${t.capped} skipped ${t.skipped}\tgain ${t.gain.toFixed(1)} of ${t.length.toFixed(0)} (${((100 * t.gain) / Math.max(1, t.length)).toFixed(3)} %) median board ${med.toFixed(1)} worst route ${t.worst.toFixed(2)}\tpaths ${t.paths}`);
  console.log(rows.at(-1));
  all.routes += t.routes;
  all.tied += t.tied;
  all.better += t.better;
  all.capped += t.capped;
  all.gain += t.gain;
  all.length += t.length;
  all.paths += t.paths;
}
console.log(`ALL routes ${all.routes} tied ${all.tied} better ${all.better} capped ${all.capped} gain ${all.gain.toFixed(1)} of ${all.length.toFixed(0)} (${((100 * all.gain) / all.length).toFixed(3)} %) paths ${all.paths} pull ms ${all.pullMs.toFixed(0)} corners route ms ${all.routeMs.toFixed(0)}`);
