/**
 * This probe reads the routes that go through a box on the boards of the record `route-pairs/2` (THROUGH-FLOOR).
 * The counter is `through` of `measureRouteFaults`, the measure `route.through` (R9). It counts routes, one for each route with a hit.
 * The probe gives one row for each counted route of each router: the board, the edge, the boxes that the route crosses and a class.
 *
 * The summary gives the classes for each router, and the routes that only `sections-site` counts.
 * For each such route, it reads each crossing segment again, the direct way, and variants of the options of the router.
 * The first argument is the out folder. The probe writes `rows.json` and `summary.json` there.
 * The probe reads no time. It changes no router.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { segmentThroughShape } from "@mark1russell7/layout-contract";
import { center, dist, inflate, segmentHitsBox, type Box, type Point } from "../src/geom.ts";
import { placePlug } from "../src/plugs.ts";
import { sectionsRouter, type SectionsOptions } from "../src/routers/sections.ts";
import { WayFinder } from "../src/ways.ts";
import { boxesOverlap, measureRouteFaults } from "../src/bench/links.ts";
import { edgesWithNoWay } from "../src/bench/measures/routes.ts";
import { checkProperties, TOLERANCE } from "../src/bench/properties.ts";
import { checkRoutes, deciding } from "../src/bench/measures/through-check.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { outerGraph, type Graph, type Node } from "../src/model.ts";
import { NAMES, routerOf, SEEDS } from "./route-pairs-rows.ts";

const OUT = process.argv[2] ?? "out/through-floor";

/** One box that a counted route crosses, by the test of `measureLinks`. */
interface Hit {
  readonly box: string;
  /** The index of the first segment that crosses the box, from 1. */
  readonly segment: number;
  readonly frameOfEnd: boolean;
  readonly childOfEnd: boolean;
  readonly overlapsEnd: boolean;
}

/** One counted route of one router. */
interface Row {
  readonly family: string;
  readonly seed: number;
  readonly router: string;
  readonly edge: string;
  readonly source: string;
  readonly target: string;
  readonly points: readonly Point[];
  readonly straight: boolean;
  readonly noWay: boolean;
  readonly marked: readonly string[] | null;
  readonly frame: string | null;
  readonly hits: readonly Hit[];
  readonly checkClass: string | null;
  readonly class: string;
}

/** This function gives the ids of the frames that hold the node, at any depth. */
function framesOf(id: string, byId: ReadonlyMap<string, Node>): string[] {
  const out: string[] = [];
  for (let p = byId.get(id)?.parent; p !== undefined && !out.includes(p); p = byId.get(p)?.parent) out.push(p);
  return out;
}

/** This function gives the boxes that the polyline crosses, with the test of `measureLinks`. It reads each box, with no grid. */
function hitsOf(graph: Graph, byId: ReadonlyMap<string, Node>, source: string, target: string, points: readonly Point[]): Hit[] {
  const ends = [source, target];
  const endFrames = new Set([...framesOf(source, byId), ...framesOf(target, byId)]);
  const endBoxes: Box[] = ends.map((id) => byId.get(id)!.box);
  const out: Hit[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    for (const n of graph.nodes) {
      if (ends.includes(n.id) || out.some((h) => h.box === n.id)) continue;
      if (!segmentHitsBox(a, b, inflate(n.box, -TOLERANCE), TOLERANCE)) continue;
      if (n.shape !== undefined && !segmentThroughShape(a, b, { id: n.id, ...n.box, shape: n.shape }, TOLERANCE)) continue;
      out.push({
        box: n.id,
        segment: i,
        frameOfEnd: endFrames.has(n.id),
        childOfEnd: framesOf(n.id, byId).some((f) => ends.includes(f)),
        overlapsEnd: endBoxes.some((e) => boxesOverlap(e, n.box)),
      });
    }
  }
  return out;
}

/** This function gives the class of a counted route. The first rule that holds decides. */
function classOf(row: Omit<Row, "class">): string {
  if (row.source === row.target) return "self-loop";
  if (row.hits.length === 0) return "no-hit-found";
  if (row.hits.every((h) => h.frameOfEnd)) return "frame-of-end";
  if (row.hits.every((h) => h.overlapsEnd || h.frameOfEnd)) return "end-overlap";
  if (row.straight && row.noWay) return "no-way-straight";
  if (row.straight) return "straight-with-way";
  return row.noWay ? "bent-no-way" : "bent-with-way";
}

const registry = highwaysRegistry();
const rows: Row[] = [];
const totals = new Map<string, { routes: number; counter: number; passRule: number; marked: number; checkContacts: number; mismatch: number }>();
for (const name of NAMES) totals.set(name, { routes: 0, counter: 0, passRule: 0, marked: 0, checkContacts: 0, mismatch: 0 });
for (const family of HIGHWAYS_FAMILIES) {
  for (let seed = 0; seed < SEEDS; seed++) {
    const graph = registry.generate(family.name, seed).graph;
    const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
    const edges = new Map(graph.edges.map((e) => [e.id, e] as const));
    const noWay = edgesWithNoWay(graph);
    for (const name of NAMES) {
      const result = routerOf(name).route(graph);
      const t = totals.get(name)!;
      const faults = measureRouteFaults(graph, result);
      t.routes += result.routes.length;
      t.counter += faults.through;
      t.passRule += checkProperties(graph, result, Infinity).filter((v) => v.rule === "no-pass-through").length;
      t.marked += result.routes.filter((r) => r.through !== undefined).length;
      const checks = new Map(checkRoutes(graph, result.routes).map((c) => [c.edge, c] as const));
      t.checkContacts += [...checks.values()].filter((c) => c.contacts.length > 0).length;
      let found = 0;
      for (const route of result.routes) {
        const edge = edges.get(route.edge);
        if (!edge) continue;
        // The probe asks the counter itself for each route, so the rows count what the record counts.
        const one = measureRouteFaults(graph, { ...result, routes: [route] }).through;
        if (one === 0) continue;
        found++;
        const hits = hitsOf(graph, byId, edge.source.node, edge.target.node, route.points);
        const check = checks.get(route.edge);
        const head = {
          family: family.name,
          seed,
          router: name,
          edge: route.edge,
          source: edge.source.node,
          target: edge.target.node,
          points: route.points.map((p) => ({ x: p.x, y: p.y })),
          straight: route.points.length === 2,
          noWay: noWay.has(route.edge),
          marked: route.through ?? null,
          frame: route.frame ?? null,
          hits,
          checkClass: check ? (deciding(check)?.class ?? null) : null,
        };
        rows.push({ ...head, class: classOf(head) });
      }
      if (found !== faults.through) t.mismatch += Math.abs(found - faults.through);
    }
  }
  console.log(family.name);
}

const key = (r: Row): string => `${r.family}/${r.seed}/${r.edge}`;
const count = <T>(list: readonly T[], of: (x: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const x of list) out[of(x)] = (out[of(x)] ?? 0) + 1;
  return out;
};
const byRouter = new Map(NAMES.map((name) => [name, rows.filter((r) => r.router === name)] as const));
const others = NAMES.filter((n) => n !== "sections-site");
const inAll = (k: string): boolean => others.every((n) => byRouter.get(n)!.some((r) => key(r) === k));
const site = byRouter.get("sections-site")!;
/** The variants of `sections-site` that tell which option makes a route of `siteOnly`. */
const VARIANTS: readonly SectionsOptions[] = [
  { name: "site", margin: 20, stretch: 3, cap: 6 },
  { name: "site-stretch-2", margin: 20, stretch: 2, cap: 6 },
  { name: "site-margin-5", margin: 5, stretch: 3, cap: 6 },
  { name: "site-cap-default", margin: 20, stretch: 3 },
  { name: "margin-20-only", margin: 20 },
  { name: "stretch-3-only", stretch: 3 },
];

/** This function reads one route of `siteOnly` again: each segment that crosses a box, the direct way, and the variants of the router. */
function diagnose(row: Row) {
  const input = registry.generate(row.family, row.seed).graph;
  const graph = outerGraph(input);
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const edge = graph.edges.find((e) => e.id === row.edge)!;
  const s = byId.get(edge.source.node)!;
  const t = byId.get(edge.target.node)!;
  const ways = new WayFinder(graph.nodes, { margin: 20 });
  const ps = placePlug(s, edge.source, center(t.box));
  const pt = placePlug(t, edge.target, center(s.box));
  const last = row.points.length - 1;
  const segments = [...new Set(row.hits.map((h) => h.segment))].map((i) => {
    const a = row.points[i - 1]!;
    const b = row.points[i]!;
    const stub = i === 1 || i === last;
    const plug = i === 1 ? ps : pt;
    return {
      segment: i,
      from: a,
      to: b,
      length: dist(a, b),
      boxes: row.hits.filter((h) => h.segment === i).map((h) => h.box),
      stub,
      outStep: stub ? ways.outStep(plug) : null,
      // A segment between two stops that the way finder cannot join is the fallback `[from, to]` of `piece`.
      wayBetweenEnds: stub ? null : ways.way(a, b) === undefined ? "none" : "found",
    };
  });
  const direct = ways.between(ps, pt, new Set([s, t]));
  return {
    key: key(row),
    source: row.source,
    target: row.target,
    segments,
    direct: { points: direct.length, hits: hitsOf(input, new Map(input.nodes.map((n) => [n.id, n] as const)), row.source, row.target, direct).map((h) => h.box) },
    variants: VARIANTS.map((v) => {
      const route = sectionsRouter(v).route(input).routes.find((r) => r.edge === row.edge)!;
      return { variant: v.name, through: measureRouteFaults(input, { routes: [route] }).through, points: route.points.length };
    }),
    others: others.map((n) => {
      const r = byRouter.get(n)!;
      const route = routerOf(n).route(input).routes.find((x) => x.edge === row.edge)!;
      return { router: n, points: route.points.length, counted: r.some((x) => key(x) === key(row)) };
    }),
  };
}

const summary = {
  schema: "through-floor/1",
  counter: "measureRouteFaults(graph, result).through: routes with a segment that crosses a box that is not an end, shrunk by TOLERANCE",
  boards: HIGHWAYS_FAMILIES.length * SEEDS,
  totals: Object.fromEntries(totals),
  classes: Object.fromEntries(NAMES.map((n) => [n, count(byRouter.get(n)!, (r) => r.class)])),
  families: Object.fromEntries(NAMES.map((n) => [n, count(byRouter.get(n)!, (r) => r.family)])),
  checkClasses: Object.fromEntries(NAMES.map((n) => [n, count(byRouter.get(n)!, (r) => r.checkClass ?? "none")])),
  siteOnly: site.filter((r) => !inAll(key(r))).map(key),
  othersOnly: others.map((n) => ({ router: n, keys: byRouter.get(n)!.filter((r) => !site.some((s) => key(s) === key(r))).map(key) })),
  siteOnlyDiagnosis: site.filter((r) => !inAll(key(r))).map(diagnose),
  sameSetAmongOthers:others.every((n) => byRouter.get(n)!.length === byRouter.get("corners")!.length && byRouter.get(n)!.every((r) => inAll(key(r)))),
  maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
};
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/rows.json`, `${JSON.stringify(rows, null, 1)}\n`);
writeFileSync(`${OUT}/summary.json`, `${JSON.stringify(summary, null, 1)}\n`);
console.log(JSON.stringify({ ...summary, siteOnly: summary.siteOnly, othersOnly: summary.othersOnly }, null, 1));
