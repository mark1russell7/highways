/**
 * This probe gives the routes of the routers of `sections.ts` on the boards of the record `route-pairs/2` (SITE-HUB-THROUGH).
 * For each route, it gives a digest of the points and the flag `through` of `measureRouteFaults`.
 * Run it on two commits, and compare the two files with the argument `--compare`.
 * The first argument is the out file. With `--compare old new`, the probe gives the routes that move and the counts of `through`.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { measureRouteFaults } from "../src/bench/links.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { ROUTERS } from "../src/routers/index.ts";
import { routerOf, SEEDS } from "./route-pairs-rows.ts";

/** The routers that the change of the hub way can move. */
const NAMES = ["sections", "sections-tree", "sections-site"] as const;

interface Row {
  readonly router: string;
  readonly family: string;
  readonly seed: number;
  readonly edge: string;
  readonly digest: string;
  readonly through: boolean;
}

const router = (name: string) => (name === "sections-tree" ? ROUTERS.find((r) => r.name === name)! : routerOf(name));

function read(): Row[] {
  const registry = highwaysRegistry();
  const rows: Row[] = [];
  for (const family of HIGHWAYS_FAMILIES) {
    for (let seed = 0; seed < SEEDS; seed++) {
      const graph = registry.generate(family.name, seed).graph;
      for (const name of NAMES) {
        const result = router(name).route(graph);
        for (const route of result.routes) {
          const through = measureRouteFaults(graph, { ...result, routes: [route] }).through > 0;
          const digest = createHash("sha256").update(JSON.stringify(route.points)).digest("hex").slice(0, 16);
          rows.push({ router: name, family: family.name, seed, edge: route.edge, digest, through });
        }
      }
    }
  }
  return rows;
}

const args = process.argv.slice(2);
if (args[0] === "--compare") {
  const load = (f: string): Row[] => JSON.parse(readFileSync(f, "utf8")) as Row[];
  const a = load(args[1]!);
  const b = load(args[2]!);
  const key = (r: Row): string => `${r.router}|${r.family}|${r.seed}|${r.edge}`;
  const old = new Map(a.map((r) => [key(r), r]));
  const out: Record<string, { routes: number; moved: number; throughBefore: number; throughAfter: number; moves: string[] }> = {};
  for (const r of b) {
    const o = old.get(key(r))!;
    const t = (out[r.router] ??= { routes: 0, moved: 0, throughBefore: 0, throughAfter: 0, moves: [] });
    t.routes++;
    if (o.through) t.throughBefore++;
    if (r.through) t.throughAfter++;
    if (o.digest !== r.digest) {
      t.moved++;
      t.moves.push(`${r.family}/${r.seed} ${r.edge}: through ${o.through} -> ${r.through}`);
    }
  }
  console.log(JSON.stringify(out, null, 2));
} else {
  writeFileSync(args[0]!, JSON.stringify(read()));
  console.log(`${args[0]}: written.`);
}
