// Untracked third read of GRAPH-SHIFT: on each of the 64 moves, the plugs of the edge in each run, and the rule of the side.
import { readFileSync, writeFileSync } from "node:fs";
import { highwaysRegistry } from "../src/families/index.ts";
import { center, dist } from "../src/geom.ts";
import { edgePlugs } from "../src/highways/stretches.ts";
import { resolvePorts, splitFrames, type Graph, type Node } from "../src/model.ts";

const [input, out] = [process.argv[2]!, process.argv[3]!];
const MOVE = 1e-6;
const VECTORS: readonly (readonly [number, number])[] = [[1e-12, 0], [0, 1e-12], [1e-12, 1e-12], [-1e-12, 3e-13], [7e-13, -9e-13]];
const reg = highwaysRegistry();
const moveBoard = (b: Graph, dx: number, dy: number): Graph => ({ ...b, nodes: b.nodes.map((n) => ({ ...n, box: { ...n.box, x: n.box.x + dx, y: n.box.y + dy } })) });
const read = (b: Graph) => {
  const { graph } = splitFrames(resolvePorts(b));
  return { plugs: new Map(edgePlugs(graph).map((e) => [e.edge.id, e])), nodes: new Map(graph.nodes.map((n) => [n.id, n])) };
};
/** The gap of the rule of the side: the rule compares the two absolute distances from the center of the node to its target. */
const sideGap = (s: Node, t: Node): number => {
  const c = center(s.box);
  const q = center(t.box);
  return Math.abs(Math.abs(q.x - c.x) - Math.abs(q.y - c.y));
};
const data = JSON.parse(readFileSync(input, "utf8")) as { rows: Record<string, unknown>[] };
const rows: unknown[] = [];
const counts: Record<string, number> = {};
for (const row of data.rows) {
  const board = reg.generate(row["family"] as string, row["seed"] as number).graph;
  const [dx, dy] = VECTORS[row["vector"] as number]!;
  const a = read(board);
  const b = read(moveBoard(board, dx, dy));
  const edge = row["edge"] as string;
  const pa = a.plugs.get(edge)!;
  const pb = b.plugs.get(edge)!;
  const s = a.nodes.get(pa.edge.source.node)!;
  const t = a.nodes.get(pa.edge.target.node)!;
  const moved = [dist(pa.ps.point, pb.ps.point), dist(pa.pt.point, pb.pt.point)];
  const sides = [pa.ps.normal.x !== pb.ps.normal.x || pa.ps.normal.y !== pb.ps.normal.y, pa.pt.normal.x !== pb.pt.normal.x || pa.pt.normal.y !== pb.pt.normal.y];
  const gap = sideGap(s, t);
  const plug = moved.some((m) => m > MOVE) ? (sides.some(Boolean) ? "plug:side" : "plug:same-side") : "plug:same";
  const name = `${String(row["group"])} ${String(row["cls"])} / ${plug}`;
  counts[name] = (counts[name] ?? 0) + 1;
  rows.push({ family: row["family"], seed: row["seed"], vector: row["vector"], edge, group: row["group"], cls: row["cls"], plug, moved, sides, gap, port: [pa.edge.source.port ?? null, pa.edge.target.port ?? null] });
}
writeFileSync(out, JSON.stringify({ counts, rows }, null, 1));
for (const [name, n] of Object.entries(counts).sort()) console.log(`${n}\t${name}`);
