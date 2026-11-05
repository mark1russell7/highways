// Probe of ROUTE-TIE, kept on a measure branch. Usage: node --import ./_flag-hook.ts _flag.ts <out.json>
// It writes one hash for each board, arm of a board and floor. Two arms with the same rows give the same bytes. A row states the pops and the reads of the walk.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { deriveSeed, mulberry32, seedOf } from "@mark1russell7/rigor-generators";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import type { Point } from "../src/geom.ts";
import { edgePlugs } from "../src/highways/stretches.ts";
import { resolvePorts, splitFrames, type Graph, type Node } from "../src/model.ts";
import { WORK } from "../src/work.ts";
import { WayFinder } from "../src/ways.ts";
import { routerNamed } from "./route-tie-rows.ts";

const out = process.argv[2]!;
const ONLY = process.env["FLAG_PARTS"]?.split(",");
const FLOORS = [1, 0.5, 0.25] as const;
const SEEDS = 3;
const DRAWS = 4;
const ROUTERS = ["corners", "sections", "shared-all", "shared", "trunks", "sections-site"];
const reg = highwaysRegistry();
const g = globalThis as any;
const walk = { pops: 0, steps: 0, reads: 0, scans: 0, shut: 0, work: 0 };
g.__SHUT = () => void walk.shut++;
g.__POP = () => void walk.pops++;
g.__STEP = () => void walk.steps++;
g.__READS = (n: number) => {
  walk.reads += n;
  walk.scans++;
};
const rows: Record<string, string> = {};
const totals: Record<string, unknown> = {};
let throws = 0;
const sum = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 16);
/** This function runs one part and states its counters. */
function part(name: string, run: () => void): void {
  if (ONLY && !ONLY.includes(name.split(" ")[0]!)) return;
  Object.assign(walk, { pops: 0, steps: 0, reads: 0, scans: 0, shut: 0 });
  const before = WORK.corner;
  run();
  totals[name] = { ...walk, work: WORK.corner - before };
  console.log(name, JSON.stringify(totals[name]), "throws", throws);
  writeFileSync(out, JSON.stringify({ throws, totals, rows }));
}
const boards = (): { key: string; board: Graph }[] =>
  HIGHWAYS_FAMILIES.flatMap((f) => Array.from({ length: SEEDS }, (_, seed) => ({ key: `${f.name}/${seed}`, board: reg.generate(f.name, seed).graph })));
const jitter = (board: Graph, amp: number, name: string): Graph => {
  const next = mulberry32(deriveSeed(seedOf(name), String(amp)));
  return { ...board, nodes: board.nodes.map((n) => ({ ...n, box: { ...n.box, x: n.box.x + amp * (2 * next() - 1), y: n.box.y + amp * (2 * next() - 1) } })) };
};
const safe = (run: () => unknown): string => {
  try {
    return JSON.stringify(run() ?? null);
  } catch (e) {
    throws++;
    return `throw ${String(e)}`;
  }
};
const costOf = (name: string, make: (u: number, d: number) => number): ((i: number, j: number, d: number) => number) => {
  const seed = seedOf(name);
  const memo = new Map<number, number>();
  return (i, j, d) => {
    const key = i * 1048576 + j;
    let u = memo.get(key);
    if (u === undefined) {
      u = mulberry32(deriveSeed(seed, String(key)))();
      memo.set(key, u);
    }
    return make(u, d);
  };
};

for (const name of ROUTERS) {
  part(`plain ${name}`, () => {
    const router = routerNamed(name);
    for (const { key, board } of boards()) rows[`plain ${name} ${key}`] = sum(safe(() => router.route(board).routes.map((r) => [r.edge, r.points])));
  });
}
for (const amp of [1e-10, 1e-9, 3e-9]) {
  for (const name of ROUTERS) {
    part(`nodes ${amp} ${name}`, () => {
      const router = routerNamed(name);
      for (let draw = 0; draw < DRAWS; draw++) {
        for (const { key, board } of boards()) {
          const b = jitter(board, amp, `${key}#${draw}`);
          for (const floor of FLOORS) {
            g.__FLOOR = floor;
            rows[`nodes ${amp} ${name} ${key} ${draw} ${floor}`] = sum(safe(() => router.route(b).routes.map((r) => [r.edge, r.points])));
          }
        }
      }
      g.__FLOOR = 1;
    });
  }
}
for (const amp of [3e-10, 1e-9, 3e-9]) {
  part(`links ${amp}`, () => {
    for (let draw = 0; draw < DRAWS; draw++) {
      for (const { key, board } of boards()) {
        const { graph } = splitFrames(resolvePorts(board));
        const ways = new WayFinder(graph.nodes);
        const cost = costOf(`${key}#${draw}#${amp}`, (u, d) => d + amp * u);
        for (const floor of FLOORS) {
          const text: string[] = [];
          for (const { ps, pt } of edgePlugs(graph)) text.push(safe(() => ways.corners.path(ways.out(ps!), ways.out(pt!), cost, floor)));
          rows[`links ${amp} ${key} ${draw} ${floor}`] = sum(text.join("\n"));
        }
      }
    }
  });
}
for (const share of [0.1, 0.3, 0.6]) {
  part(`zero ${share}`, () => {
    for (const { key, board } of boards()) {
      const { graph } = splitFrames(resolvePorts(board));
      const ways = new WayFinder(graph.nodes);
      const cost = costOf(`${key}#${share}`, (u, d) => (u < share ? 0 : d));
      const text: string[] = [];
      for (const { ps, pt } of edgePlugs(graph)) text.push(safe(() => ways.corners.path(ways.out(ps!), ways.out(pt!), cost, 0)));
      rows[`zero ${share} ${key}`] = sum(text.join("\n"));
    }
  });
}
part("built", () => {
  const built: Node[] = [];
  for (let c = 0; c < 6; c++) for (let r = 0; r < 6; r++) built.push({ id: `n${c}-${r}`, box: { x: c * 50, y: r * 50, w: 40, h: 40 } } as Node);
  const ways = new WayFinder(built);
  const next = mulberry32(seedOf("zero-length"));
  for (let t = 0; t < 400; t++) {
    const side = (k: number): Point => (k < 0.5 ? { x: -20, y: 300 * next() } : { x: 320, y: 300 * next() });
    const a = side(next());
    const b = side(next());
    for (const floor of FLOORS) rows[`built ${t} ${floor}`] = sum(safe(() => ways.corners.path(a, b, undefined, floor)));
  }
});
// Two starts that reach one corner within the tie, with the lower value at the higher index. So the rule of the walk and the parent of the search name different starts.
part("starts", () => {
  const built: Node[] = [];
  for (let c = 0; c < 6; c++) for (let r = 0; r < 6; r++) built.push({ id: `n${c}-${r}`, box: { x: c * 50, y: r * 50, w: 40, h: 40 } } as Node);
  const ways = new WayFinder(built);
  const next = mulberry32(seedOf("tied-starts"));
  const corners = ways.corners.points;
  let differ = 0;
  for (let t = 0; t < 4000; t++) {
    const c = corners[Math.floor(next() * corners.length)]!;
    const near = (): Point => ({ x: c.x + 5 * (next() - 0.5), y: c.y + 5 * (next() - 0.5) });
    const a = near();
    const b = near();
    const K = 1000;
    const from = [
      { point: a, cost: K - Math.hypot(a.x - c.x, a.y - c.y) + 1e-10 },
      { point: b, cost: K - Math.hypot(b.x - c.x, b.y - c.y) },
    ];
    const to = [{ point: { x: 320 * next(), y: 320 * next() }, cost: 0 }];
    let found: unknown;
    const text = safe(() => (found = ways.corners.pathAmong(from, to)));
    rows[`starts ${t}`] = sum(text);
    if ((found as { from?: number } | undefined)?.from === 0) differ++;
  }
  console.log("starts: the lower index wins on", differ, "of 4000");
});
writeFileSync(out, JSON.stringify({ throws, totals, rows }));
