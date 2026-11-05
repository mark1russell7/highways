// Probe of ROUTE-TIE, kept on a measure branch. Usage: node --import ./_flag-hook.ts _flag-scale.ts <out.json>
// The tie and the slack are absolute, and rounding grows with the size of the sums. This probe reads the bytes and the floor law on boards with larger coordinates.
// The kind `scale` multiplies each box, so the costs grow. The kind `offset` adds a value to each corner of a box, so the costs stay and the coordinates grow.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import type { Graph } from "../src/model.ts";
import { routerNamed } from "./route-tie-rows.ts";

const out = process.argv[2]!;
const ONE_KIND = process.argv[3];
const ONE_VALUE = process.argv[4];
const peakMb = (): number => Math.round(process.resourceUsage().maxRSS / 1024);
const FLOORS = [1, 0.5, 0.25] as const;
const SEEDS = 3;
const ROUTERS = (process.env["SCALE_ROUTERS"] ?? "corners,shared-all").split(",");
const ALL_CELLS: readonly { kind: "scale" | "offset"; value: number }[] = [
  { kind: "scale", value: 1 },
  { kind: "scale", value: 1e2 },
  { kind: "scale", value: 1e3 },
  { kind: "scale", value: 1e4 },
  { kind: "scale", value: 1e5 },
  { kind: "offset", value: 1e4 },
  { kind: "offset", value: 1e5 },
  { kind: "offset", value: 1e6 },
  { kind: "offset", value: 1e7 },
  { kind: "offset", value: 1e8 },
];
const CELLS = ONE_KIND === undefined ? ALL_CELLS : ALL_CELLS.filter((c) => c.kind === ONE_KIND && c.value === Number(ONE_VALUE));
if (CELLS.length === 0) throw new Error(`no cell ${ONE_KIND} ${ONE_VALUE}`);
const reg = highwaysRegistry();
const g = globalThis as any;
const sum = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 16);
const moved = (board: Graph, kind: "scale" | "offset", value: number): Graph => ({
  ...board,
  nodes: board.nodes.map((n) => ({
    ...n,
    box: kind === "scale" ? { x: n.box.x * value, y: n.box.y * value, w: n.box.w * value, h: n.box.h * value } : { ...n.box, x: n.box.x + value, y: n.box.y + value },
  })),
});
const rows: Record<string, string> = {};
const cells: unknown[] = [];
const boards = HIGHWAYS_FAMILIES.flatMap((f) => Array.from({ length: SEEDS }, (_, seed) => ({ key: `${f.name}/${seed}`, board: reg.generate(f.name, seed).graph })));
for (const { kind, value } of CELLS) {
  for (const name of ROUTERS) {
    const router = routerNamed(name);
    let law = 0;
    let lawRoutes = 0;
    let throws = 0;
    let largestCost = 0;
    let routes = 0;
    for (const { key, board } of boards) {
      console.log(`board ${kind} ${value} ${name} ${key} peak ${peakMb()} MB`);
      const b = moved(board, kind, value);
      const at: string[][] = [];
      for (const floor of FLOORS) {
        g.__FLOOR = floor;
        let lines: string[];
        try {
          const found = router.route(b).routes;
          lines = found.map((r) => JSON.stringify([r.edge, r.points]));
          if (floor === 1) {
            routes += found.length;
            for (const r of found) {
              let length = 0;
              for (let i = 1; i < r.points.length; i++) length += Math.hypot(r.points[i]!.x - r.points[i - 1]!.x, r.points[i]!.y - r.points[i - 1]!.y);
              if (length > largestCost) largestCost = length;
            }
          }
        } catch (e) {
          throws++;
          lines = [`throw ${String(e)}`];
        }
        at.push(lines);
        rows[`${kind} ${value} ${name} ${key} ${floor}`] = sum(lines.join("\n"));
      }
      g.__FLOOR = 1;
      if (at[1]!.join("\n") !== at[0]!.join("\n") || at[2]!.join("\n") !== at[0]!.join("\n")) law++;
      for (let i = 0; i < at[0]!.length; i++) if (at[1]![i] !== at[0]![i] || at[2]![i] !== at[0]![i]) lawRoutes++;
    }
    const cell = { kind, value, router: name, boards: boards.length, routes, lawBoards: law, lawRoutes, throws, largestCost, peakMb: peakMb() };
    cells.push(cell);
    console.log(JSON.stringify(cell));
    writeFileSync(out, JSON.stringify({ cells, rows }));
  }
}
writeFileSync(out, JSON.stringify({ cells, rows }));
