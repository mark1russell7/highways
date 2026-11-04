/**
 * This script compares the field `through` of each route with the independent check of `src/bench/measures/through-check.ts` (THROUGH-CHECK).
 * It runs each family of `highwaysRegistry()` at its defaults, for each router of `SCORED`, `OUTSIDE` and `SITE`.
 * The board `INNER_BOARD` is one more family, because no family has inner routes at its defaults.
 * A row of `lanes` holds the routes of `laneRoutes`, with each shared segment open, at the lane settings of the site, so it shows what `keepThrough` copies.
 * The routers of `OUTSIDE` do not mark `through`, so the record keeps them in `unmarkedRows`, apart from `rows`. Each run holds them: the variable `ROUTERS` does not remove them.
 * The router of `SITE` has the settings of the site. Its rows are report rows, and so are the rows of `INNER_BOARD` and of `lanes`.
 *
 * The counts are deterministic, and the script reads no time. The first argument is the out file. The variable `SEEDS` sets the seeds, and its default is 3.
 * The variable `ROUTERS` is a list of names of routers that mark `through`, with commas, and the variable `FAMILIES` is a list of family names. Each default is all.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { checkRoutes, deciding, falseThrough, flagged, HAIRLINE, THROUGH_CLASSES, type RouteCheck, type ThroughClass, type ThroughContact } from "../src/bench/measures/through-check.ts";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import type { Graph, Result, Route } from "../src/model.ts";
import { ROUTERS, sectionsRouter } from "../src/routers/index.ts";
import { laneRoutes, runKey, segmentsOf } from "../src/segments.ts";

const OUT = process.argv[2] ?? "out/through-check.json";
const SEEDS = Number(process.env["SEEDS"] ?? 3);
const SCORED = ["corners", "trunks", "shared", "sections"];
const OUTSIDE = ["straight", "plugs"];
const SITE = sectionsRouter({ name: "sections-site", margin: 20, stretch: 3, cap: 6, outSteps: false });
/** The lane settings of the site. */
const LANES = { width: 5, maxWidth: 30 };
const INNER_BOARD = { name: "frame-rows+inner", family: "frame-rows", dims: { inner: 4 } };
const SAMPLE = 3;
const UNMARKED_NOTE = "The routers straight and plugs do not mark through. Their flagged counts are outside each claim on through, and rows does not hold them.";
const only = (name: string): readonly string[] | undefined => process.env[name]?.split(",");
const wanted = [...(only("ROUTERS") ?? [...SCORED, SITE.name]), ...OUTSIDE];
const families = only("FAMILIES") ?? [...HIGHWAYS_FAMILIES.map((f) => f.name), INNER_BOARD.name];
const reg = highwaysRegistry();

/** One class of a row of the record. The depths are those of the contact that decides each route, and the sample ids have the form `seed:edge`. */
interface ClassRow {
  routes: number;
  sample: string[];
  leastDepth: number;
  mostDepth: number;
}

/** The counts of one view of one router on one family. */
interface Row {
  readonly router: string;
  readonly family: string;
  readonly view: "routes" | "lanes";
  routes: number;
  marked: number;
  flagged: number;
  falseThrough: number;
  partFalse: number;
  unnamed: number;
  hairline: number;
  hairlineClear: number;
  skipsFrame: number;
  inner: number;
  innerMarked: number;
  innerFlagged: number;
  classes: Partial<Record<ThroughClass, ClassRow>>;
  innerClasses: Partial<Record<ThroughClass, ClassRow>>;
  unnamedClasses: Partial<Record<ThroughClass, ClassRow>>;
}

/** This function adds one contact to a table of classes. */
function addClass(table: Partial<Record<ThroughClass, ClassRow>>, id: string, top: ThroughContact): void {
  const row = (table[top.class] ??= { routes: 0, sample: [], leastDepth: top.depth, mostDepth: top.depth });
  row.routes++;
  row.leastDepth = Math.min(row.leastDepth, top.depth);
  row.mostDepth = Math.max(row.mostDepth, top.depth);
  if (row.sample.length < SAMPLE) row.sample.push(id);
}

/** This function adds the checks of one board to a row. */
function addChecks(row: Row, seed: number, checks: readonly RouteCheck[]): void {
  for (const c of checks) {
    const id = `${seed}:${c.edge}`;
    if (c.hairline) row.hairline++;
    if (c.hairline && c.contacts.length === 0 && !c.marked) row.hairlineClear++;
    if (c.skipsFrame) row.skipsFrame++;
    if (c.inner) {
      row.inner++;
      if (c.marked) row.innerMarked++;
      if (flagged(c)) {
        row.innerFlagged++;
        addClass(row.innerClasses, id, deciding(c)!);
      }
      continue;
    }
    row.routes++;
    if (c.marked) row.marked++;
    if (falseThrough(c)) row.falseThrough++;
    if (c.falseNames.length > 0) row.partFalse++;
    if (c.unnamed.length > 0) {
      row.unnamed++;
      addClass(row.unnamedClasses, id, c.contacts.find((x) => c.unnamed.includes(x.box))!);
    }
    if (flagged(c)) {
      row.flagged++;
      addClass(row.classes, id, deciding(c)!);
    }
  }
}

/** This function gives the routes of a result with each shared segment open. The copy of `through` is the one that a result in place of segments gets. */
function laneView(result: Result): readonly Route[] {
  const graph = segmentsOf(result);
  const open = new Set(graph.segments.filter((s) => s.count > 1).map((s) => runKey(s.edges)));
  return laneRoutes(result, open, LANES.width, LANES.maxWidth);
}

const blank = (router: string, family: string, view: Row["view"]): Row => ({
  router,
  family,
  view,
  routes: 0,
  marked: 0,
  flagged: 0,
  falseThrough: 0,
  partFalse: 0,
  unnamed: 0,
  hairline: 0,
  hairlineClear: 0,
  skipsFrame: 0,
  inner: 0,
  innerMarked: 0,
  innerFlagged: 0,
  classes: {},
  innerClasses: {},
  unnamedClasses: {},
});

const rows: Row[] = [];
const unmarkedRows: Row[] = [];
for (const family of families) {
  const graphs: Graph[] = [];
  for (let seed = 0; seed < SEEDS; seed++) graphs.push(family === INNER_BOARD.name ? reg.generate(INNER_BOARD.family, seed, INNER_BOARD.dims).graph : reg.generate(family, seed).graph);
  for (const name of wanted) {
    const router = name === SITE.name ? SITE : ROUTERS.find((r) => r.name === name)!;
    const row = blank(name, family, "routes");
    const lanes = blank(name, family, "lanes");
    // A lane route has no field `frame`, so the board of inner routes has no row of lanes.
    const hasLanes = !OUTSIDE.includes(name) && family !== INNER_BOARD.name;
    graphs.forEach((graph, seed) => {
      const result = router.route(graph);
      addChecks(row, seed, checkRoutes(graph, result.routes));
      if (hasLanes) addChecks(lanes, seed, checkRoutes(graph, laneView(result)));
    });
    (OUTSIDE.includes(name) ? unmarkedRows : rows).push(row);
    if (hasLanes) rows.push(lanes);
    console.log(JSON.stringify({ router: name, family, routes: row.routes, marked: row.marked, flagged: row.flagged, falseThrough: row.falseThrough, lanesFlagged: lanes.flagged, lanesFalse: lanes.falseThrough }));
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ schema: "through-check/1", seeds: SEEDS, size: "default", classes: THROUGH_CLASSES, hairline: HAIRLINE, scored: SCORED, unmarked: OUTSIDE, unmarkedNote: UNMARKED_NOTE, site: SITE.name, innerBoard: INNER_BOARD, lanes: LANES, rows, unmarkedRows }, null, 2)}\n`);
