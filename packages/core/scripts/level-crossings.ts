/**
 * This script counts the level links that go through a box of an item of their level.
 * The first table is `maze` as one flat level, with one item for each node. The real routers do not make this level.
 * The second table is the router `sections` on each family, with the arms `base`, `join` (`levelJoinWork: JOIN_WORK`) and `far` (`throughCost: 0`).
 * The counts and the bytes are deterministic, and the script reads no time.
 * The environment gives `FAMILIES`, `SEEDS`, `LARGE_SEEDS` and `SAMPLES`. The first argument is the out file. The script writes the file after each row.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type LevelCrossings, levelCrossings } from "../src/bench/measures/level-crossings.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import { levelLinks } from "../src/levels.ts";
import type { Level, LevelLink } from "../src/model.ts";
import { sectionsRouter } from "../src/routers/index.ts";
import { JOIN_WORK } from "../src/visibility.ts";

/** The largest dimensions of `maze`. */
const LARGE = { cols: 24, rows: 16, nodes: 60, edges: 120 };
/** The families with a row at the largest size. */
const LARGE_FAMILIES = new Set(["maze"]);
/** The members of `maze` for the flat table. */
const FLAT = [
  { seed: 60599, large: false },
  { seed: 39410, large: false },
  { seed: 10, large: false },
  { seed: 3086, large: true },
  { seed: 7122, large: true },
];
const OUT = process.argv[2] ?? "out/level-crossings.json";
const SEEDS = Number(process.env["SEEDS"] ?? 20);
const LARGE_SEEDS = Number(process.env["LARGE_SEEDS"] ?? 20);
const SAMPLES = Number(process.env["SAMPLES"] ?? 3);
const reg = highwaysRegistry();
const names: string[] = process.env["FAMILIES"]?.split(",") ?? reg.families().map((f: { name: string }) => f.name);

const base = { name: "base", maxNodes: 100_000 };
const arms = { base: sectionsRouter(base), join: sectionsRouter({ ...base, levelJoinWork: JOIN_WORK }), far: sectionsRouter({ ...base, throughCost: 0 }) };

/** The counts of one arm. The class of a link is in `endsOverlapLinks`, `clearWayLinks` or `noWayLinks`. */
interface Arm {
  crossings: number;
  crossedLinks: number;
  endsOverlapLinks: number;
  clearWayLinks: number;
  noWayLinks: number;
  /** The crossed links with no way between the boxes of the level, and with a way between the nodes of the board. */
  noWayBoardWayLinks: number;
  overlapEnd: number;
  single: number;
  flatLevelLinks: number;
  flatClearWayLinks: number;
}
const freshArm = (): Arm => ({ crossings: 0, crossedLinks: 0, endsOverlapLinks: 0, clearWayLinks: 0, noWayLinks: 0, noWayBoardWayLinks: 0, overlapEnd: 0, single: 0, flatLevelLinks: 0, flatClearWayLinks: 0 });

/** This function adds one measured level to the counts of an arm. */
function add(level: Level, m: LevelCrossings, arm: Arm): void {
  const flat = level.items.every((i) => i.nodes.length === 1);
  for (const c of m.crossed) {
    arm.crossings += c.items.length;
    arm.crossedLinks++;
    arm.overlapEnd += c.overlapEnd;
    arm.single += c.single;
    if (c.way === "ends-overlap") arm.endsOverlapLinks++;
    else if (c.way === "clear") arm.clearWayLinks++;
    else {
      arm.noWayLinks++;
      if (c.boardWay) arm.noWayBoardWayLinks++;
    }
    if (flat) arm.flatLevelLinks++;
    if (flat && c.way === "clear") arm.flatClearWayLinks++;
  }
}

/** The change of an arm against `base`, link by link. `worse` holds the links that go through more boxes, and `added` the crossings that they add. */
interface Change {
  changed: number;
  better: number;
  worse: number;
  added: number;
  removed: number;
}
const freshChange = (): Change => ({ changed: 0, better: 0, worse: 0, added: 0, removed: 0 });

/** This function compares the links of one arm with the links of `base`. */
function compare(level: Level, m: LevelCrossings, other: Level, n: LevelCrossings, c: Change): void {
  m.perLink.forEach((before, k) => {
    const after = n.perLink[k]!;
    if (JSON.stringify(level.links[k]) !== JSON.stringify(other.links[k])) c.changed++;
    if (after < before) {
      c.better++;
      c.removed += before - after;
    }
    if (after > before) {
      c.worse++;
      c.added += after - before;
    }
  });
}

/** This function counts the router `sections` on the first seeds of one family. */
function row(family: string, dims: Record<string, number> | undefined, seeds: number): object {
  const a = { base: freshArm(), join: freshArm(), far: freshArm() };
  const change = { join: freshChange(), far: freshChange() };
  let links = 0;
  let levels = 0;
  let cleanBoards = 0;
  let overlapPairs = 0;
  let overlapLevels = 0;
  const samples: object[] = [];
  for (let seed = 0; seed < seeds; seed++) {
    const { graph } = dims ? reg.generate(family, seed, dims as never) : reg.generate(family, seed);
    const b = (arms.base.route(graph).levels ?? []) as readonly Level[];
    const j = (arms.join.route(graph).levels ?? []) as readonly Level[];
    const f = (arms.far.route(graph).levels ?? []) as readonly Level[];
    let crossed = 0;
    b.forEach((level, i) => {
      const mb = levelCrossings(level, graph.nodes);
      const mj = levelCrossings(j[i]!, graph.nodes);
      const mf = levelCrossings(f[i]!, graph.nodes);
      links += level.links.length;
      levels++;
      overlapPairs += mb.overlaps;
      if (mb.overlaps > 0) overlapLevels++;
      crossed += mb.crossed.length;
      add(level, mb, a.base);
      add(j[i]!, mj, a.join);
      add(f[i]!, mf, a.far);
      compare(level, mb, j[i]!, mj, change.join);
      compare(level, mb, f[i]!, mf, change.far);
      for (const c of mb.crossed) {
        if (samples.length >= SAMPLES || c.way !== "clear") continue;
        samples.push({ seed, depth: level.depth, items: level.items.length, source: c.link.source, target: c.link.target, crossed: c.items.slice(0, 6), single: c.single, overlapEnd: c.overlapEnd, points: c.link.points.length });
      }
    });
    if (crossed === 0) cleanBoards++;
  }
  return { family, size: dims ? "largest" : "default", boards: seeds, cleanBoards, levels, overlapLevels, overlapPairs, links, change, base: a.base, join: a.join, far: a.far, samples };
}

/** This function counts one member of `maze` as one flat level, with the join off and on. */
function flat(seed: number, large: boolean): object {
  const { graph } = large ? reg.generate("maze", seed, LARGE as never) : reg.generate("maze", seed);
  const items = graph.nodes.map((n) => ({ id: n.id, box: n.box, nodes: [n.id] }));
  const seen = new Map<string, { source: string; target: string; count: number }>();
  for (const e of graph.edges) {
    const [source, target] = [e.source.node, e.target.node].sort() as [string, string];
    if (source === target) continue;
    const key = `${source}|${target}`;
    const pair = seen.get(key);
    if (pair) pair.count++;
    else seen.set(key, { source, target, count: 1 });
  }
  const pairs = [...seen.values()];
  const off = levelLinks(items, pairs);
  const on = levelLinks(items, pairs, { levelJoinWork: JOIN_WORK });
  const count = (links: readonly LevelLink[]): number => levelCrossings({ depth: 0, items, links }).crossed.reduce((n, c) => n + c.items.length, 0);
  return {
    seed,
    size: large ? "largest" : "default",
    links: { off: off.length, on: on.length },
    changed: off.filter((link, i) => JSON.stringify(link) !== JSON.stringify(on[i])).length,
    crossings: { off: count(off), on: count(on) },
  };
}

const record = { schema: "level-crossings/2", seeds: SEEDS, largeSeeds: LARGE_SEEDS, flat: [] as object[], rows: [] as object[] };
/** This function writes the record, so that a stopped run keeps the rows that it has. */
function save(): void {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);
}

if (LARGE_SEEDS > 0 && names.includes("maze")) record.flat = FLAT.map((m) => flat(m.seed, m.large));
save();
for (const name of names) {
  record.rows.push(row(name, undefined, SEEDS));
  save();
}
if (LARGE_SEEDS > 0)
  for (const name of names.filter((n) => LARGE_FAMILIES.has(n))) {
    record.rows.push(row(name, LARGE, LARGE_SEEDS));
    save();
  }
