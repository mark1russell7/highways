// Throwaway. A hexagonal pack of circles, given to the routers as their bounding boxes, which overlap between rows.
import { ROUTERS } from "../src/routers/index.ts";
import { rng } from "../src/fixtures.ts";
import type { Graph } from "../src/model.ts";

const board = (pitch: number, r: number, rows: number, cols: number, edges: number): Graph => {
  const nodes = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const cx = i * pitch + (j % 2 ? pitch / 2 : 0);
      const cy = j * pitch * (Math.sqrt(3) / 2);
      nodes.push({ id: `n${j}-${i}`, box: { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r } });
    }
  const random = rng(7);
  const list = [];
  for (let e = 0; e < edges; e++) {
    const [a, b] = [Math.floor(random() * nodes.length), Math.floor(random() * nodes.length)];
    if (a !== b) list.push({ id: `e${e}`, source: { node: nodes[a]!.id }, target: { node: nodes[b]!.id } });
  }
  return { nodes, edges: list } as unknown as Graph;
};

for (const [name, pitch, r] of [["touching circles", 40, 20], ["gap 4 between circles", 44, 20]] as const) {
  const g = board(pitch, r, 12, 12, 200);
  const overlap = pitch * (Math.sqrt(3) / 2) < 2 * r ? 2 * r - pitch * (Math.sqrt(3) / 2) : 0;
  for (const router of ROUTERS.filter((x) => ["corners", "shared", "sections"].includes(x.name))) {
    try {
      const out = router.route(g);
      const through = out.routes.filter((x) => (x.through?.length ?? 0) > 0).length;
      console.log(`${name}, box overlap ${overlap.toFixed(2)}: ${router.name}: routes ${out.routes.length} of ${g.edges.length}, through ${through}`);
    } catch (e) {
      console.log(`${name}: ${router.name}: throws ${String(e).slice(0, 120)}`);
    }
  }
}
