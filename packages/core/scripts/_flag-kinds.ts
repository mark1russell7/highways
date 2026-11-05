// Probe of ROUTE-TIE, kept on a measure branch. Usage: node --import ./_flag-hook.ts _flag-kinds.ts <out.json>
// It reads the classes of `shiftKinds` by board and by vector, for one text of the search, on the vectors of the record and on the hand vectors.
import { writeFileSync } from "node:fs";
import { armRows, shiftOf, VECTORS, type ArmRow } from "./route-tie-rows.ts";

const out = process.argv[2]!;
const HAND = [[1e-12, 0], [0, 1e-12], [1e-12, 1e-12], [-1e-12, 3e-13], [7e-13, -9e-13]] as const;
const MOVE = 1e-6;
const key = (r: ArmRow): string => `${r.family}/${r.seed}`;
const same = (a: readonly { x: number; y: number }[] | null | undefined, b: readonly { x: number; y: number }[] | null | undefined): boolean => {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i]!.x) <= MOVE && Math.abs(p.y - b[i]!.y) <= MOVE);
};
const base = armRows({ routers: ["corners"] });
const rows: unknown[] = [];
const read = (name: string, dx: number, dy: number): void => {
  const moved = armRows({ routers: ["corners"], shift: { dx, dy } });
  const other = new Map(moved.map((r) => [key(r), r]));
  for (const row of base) {
    const m = other.get(key(row))!;
    const a = row.corner!;
    const b = m.corner!;
    const edges = Object.keys(row.lines).filter((e) => !same(row.lines[e], m.lines[e]));
    if (!edges.length) continue;
    const countsDiffer = a.points !== b.points || a.links !== b.links;
    const rawMoved = edges.filter((e) => !same(a.raw[e], b.raw[e])).length;
    rows.push({ vector: name, board: key(row), edges: edges.length, list: edges, countsDiffer, rawMoved, points: [a.points, b.points], links: [a.links, b.links] });
  }
};
for (const name of VECTORS) {
  const s = shiftOf(name);
  read(name, s.dx, s.dy);
}
HAND.forEach(([dx, dy], i) => read(`hand-${i}`, dx, dy));
writeFileSync(out, JSON.stringify(rows));
