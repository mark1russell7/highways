// Throwaway. Why the largest maze boards have no ways, and the time of the room read on a router that has ways there.
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { highwaysRegistry } from "../src/families/index.ts";
import * as neu from "../src/lane-room.ts";
import * as old from "../src/lane-room-old.ts";
import type { Router } from "../src/model.ts";
import { ROUTERS, sectionsRouter } from "../src/routers/index.ts";
import { Obstacles } from "../src/visibility.ts";

const g = globalThis as unknown as { __ways: Record<string, number> };
const reg = highwaysRegistry();
const median = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
const LARGEST = { cols: 24, rows: 16, nodes: 60, edges: 120 };
const named = (name: string): Router => ROUTERS.find((r) => r.name === name)!;
const routers: readonly Router[] = [
  sectionsRouter({ name: "sections" }),
  sectionsRouter({ name: "sections-tree", stretch: Infinity, maxNodes: 100_000 }),
  named("shared"),
  named("shared-all"),
];
const boards = [
  ...[59, 1068, 2077].map((seed) => ({ id: `largest-${seed}`, graph: reg.generate("maze", seed, LARGEST as never).graph })),
  ...[0, 1, 2].map((seed) => ({ id: `default-${seed}`, graph: reg.generate("maze", seed).graph })),
];
const lines: string[] = [`CPU ${cpus()[0]?.model}. Time: median ms of 7 rounds, in turn.`];
for (const b of boards) {
  lines.push(`${b.id}: nodes ${b.graph.nodes.length}, edges ${b.graph.edges.length}`);
  for (const router of routers) {
    g.__ways = { sameLeaf: 0, noChain: 0, stretch: 0, outAndBack: 0, hubs: 0, pieces0: 0, pieces1: 0, pieces2: 0 };
    const t0 = performance.now();
    const result = router.route(b.graph);
    const route = performance.now() - t0;
    const counts = { ...g.__ways };
    const ways = result.runs ?? [];
    const obstacles = new Obstacles(b.graph.nodes, 180);
    const times: Record<string, number[]> = { old: [], neu: [], again: [] };
    const arms: Record<string, () => unknown> = { old: () => old.withLaneRoom(ways, obstacles), neu: () => neu.withLaneRoom(ways, obstacles), again: () => neu.withLaneRoom(ways, obstacles) };
    const names = Object.keys(arms);
    for (let round = 0; round < 7; round++) {
      for (let i = 0; i < names.length; i++) {
        const name = names[(i + round) % names.length]!;
        const t = performance.now();
        arms[name]!();
        times[name]!.push(performance.now() - t);
      }
    }
    const m = (name: string): string => median(times[name]!).toFixed(2);
    lines.push(`  ${router.name}: ways ${ways.length}, route ${route.toFixed(0)} ms, read old ${m("old")} new ${m("neu")} again ${m("again")}; ${JSON.stringify(counts)}`);
  }
}
mkdirSync("out", { recursive: true });
writeFileSync("out/join-cost.md", `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
