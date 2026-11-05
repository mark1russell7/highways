// Probe of ROUTE-TIE, kept on a measure branch. Usage: node --import ./_tieband-hook.ts _tieband.ts <out.json>
// It reads the cost gaps of `#search` by decade on the plain boards, and the law of the floor on boards with a jitter on each node.
import { writeFileSync } from "node:fs";
import { deriveSeed, mulberry32, seedOf } from "@mark1russell7/rigor-generators";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import type { Graph } from "../src/model.ts";
import { MOVE, routerNamed } from "./route-tie-rows.ts";

const AMPS = [0, 1e-11, 1e-10, 3e-10, 1e-9, 3e-9, 1e-8] as const;
const FLOORS = [1, 0.5, 0.25] as const;
const ROUTERS = ["corners", "sections", "shared-all"] as const;
const SEEDS = 3;
const reg = highwaysRegistry();
const g = globalThis as any;

const jitter = (board: Graph, amp: number, name: string): Graph => {
  if (amp === 0) return board;
  const next = mulberry32(deriveSeed(seedOf(name), String(amp)));
  return { ...board, nodes: board.nodes.map((n) => ({ ...n, box: { ...n.box, x: n.box.x + amp * (2 * next() - 1), y: n.box.y + amp * (2 * next() - 1) } })) };
};
const moved = (a: Record<string, any>, b: Record<string, any>): string[] => {
  const out: string[] = [];
  for (const id of Object.keys(a)) {
    const p = a[id];
    const q = b[id];
    if (!q || p.length !== q.length || p.some((v: any, i: number) => Math.abs(v.x - q[i].x) > MOVE || Math.abs(v.y - q[i].y) > MOVE)) out.push(id);
  }
  return out;
};
const rows: any[] = [];
const bands: Record<string, any> = {};
for (const amp of AMPS) {
  for (const name of ROUTERS) {
    const router = routerNamed(name);
    const hist = { parent: {} as Record<string, number>, end: {} as Record<string, number>, parentZero: 0, endZero: 0 };
    let routes = 0;
    const moves = { "0.5": 0, "0.25": 0 };
    const where: string[] = [];
    for (const f of HIGHWAYS_FAMILIES) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const key = `${f.name}/${seed}`;
        const board = jitter(reg.generate(f.name, seed).graph, amp, key);
        const lines: Record<string, Record<string, any>> = {};
        for (const floor of FLOORS) {
          g.__FLOOR = floor;
          g.__BAND = floor === 1
            ? (kind: number, gap: number): void => {
                if (gap === 0) { if (kind === 0) hist.parentZero++; else hist.endZero++; return; }
                const abs = Math.abs(gap);
                if (abs >= 1e-3) return;
                const bin = String(Math.floor(Math.log10(abs)));
                const h = kind === 0 ? hist.parent : hist.end;
                h[bin] = (h[bin] ?? 0) + 1;
              }
            : undefined;
          const r: Record<string, any> = {};
          for (const route of router.route(board).routes) r[route.edge] = route.points;
          lines[String(floor)] = r;
        }
        routes += Object.keys(lines["1"]!).length;
        for (const floor of ["0.5", "0.25"] as const) {
          const m = moved(lines["1"]!, lines[floor]!);
          moves[floor] += m.length;
          if (m.length) where.push(`${key}@${floor}:${m.length}`);
        }
      }
    }
    rows.push({ amp, router: name, routes, moves, where });
    bands[`${name}@${amp}`] = hist;
    console.log(amp, name, routes, JSON.stringify(moves), where.slice(0, 6).join(" "));
  }
  writeFileSync(process.argv[2]!, JSON.stringify({ amps: AMPS, floors: FLOORS, rows, bands }, null, 1));
}
