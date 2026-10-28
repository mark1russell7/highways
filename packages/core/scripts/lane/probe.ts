// MEASURE-ONLY (LANE-ORDER): a local probe of the swaps of the order `bundle` on the case boards.
import { CASES } from "../../src/cases.ts";
import { observeLanes, setLaneSort, type LaneSort } from "../../src/lane-order.ts";
import { sharedRouter } from "../../src/routers/shared.ts";
import { segmentsOf, type SegmentGraph } from "../../src/segments.ts";

function swaps(graph: SegmentGraph): number {
  const at = new Map<string, { index: number; reverse: boolean }>();
  for (const path of graph.paths) path.segments.forEach((ref, index) => at.set(`${path.edge}|${ref.segment}`, { index, reverse: ref.reverse }));
  const sides = new Map<string, { a: number; b: number; side: number }[]>();
  for (const s of graph.segments) {
    if (s.count < 2) continue;
    for (let i = 0; i < s.edges.length; i++)
      for (let j = i + 1; j < s.edges.length; j++) {
        const [a, b, side] = s.edges[i]! < s.edges[j]! ? [s.edges[i]!, s.edges[j]!, 1] : [s.edges[j]!, s.edges[i]!, -1];
        const A = at.get(`${a}|${s.id}`)!;
        const list = sides.get(`${a}|${b}`) ?? [];
        list.push({ a: A.index, b: at.get(`${b}|${s.id}`)!.index, side: A.reverse ? -side : side });
        sides.set(`${a}|${b}`, list);
      }
  }
  let count = 0;
  for (const list of sides.values()) {
    list.sort((x, y) => x.a - y.a);
    for (let k = 1; k < list.length; k++) if (list[k]!.a === list[k - 1]!.a + 1 && Math.abs(list[k]!.b - list[k - 1]!.b) === 1 && list[k]!.side !== list[k - 1]!.side) count++;
  }
  return count;
}

for (const mode of ["engine", "merge", "kahn", "kahn-fewest", "rank"] as LaneSort[]) {
  setLaneSort(mode);
  const row: string[] = [];
  for (const c of CASES) {
    const lanes = { runs: 0, cyclic: 0, breaks: 0 };
    observeLanes((n, b) => {
      if (n < 2) return;
      lanes.runs++;
      if (b > 0) lanes.cyclic++;
      lanes.breaks += b;
    });
    const g = c.make();
    const s = swaps(segmentsOf(sharedRouter({ name: "shared-all" }).route(g)));
    const d = swaps(segmentsOf(sharedRouter({ name: "shared" }).route(g)));
    row.push(`${c.name}: all ${s} def ${d} cyc ${lanes.cyclic}/${lanes.runs} br ${lanes.breaks}`);
  }
  console.log(mode, "|", row.join(" | "));
}
