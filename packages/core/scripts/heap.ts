// The heap gate of the routers (HEAP-GATE): `node scripts/heap.ts [--budgets <file>] [--fixture <file>] [--out <file>]`.
// It routes the dense board of ROUTE-SCALE (`data/scale/route-scale-fixture.json.gz`) with each router of the budget file, each router in its own process.
// The routers are the 15 routers that the joint bench of layout-contract races. Its memory probe (L77) found that `streets` filled 4 to 5.7 GB there.
//
// Each process has the heap cap `--max-old-space-size` of its router, so a router that needs more heap stops with an error of memory.
// The cap is the measured peak RSS times `margin`, and at least `floorMb`.
// The peak RSS does not include the heap that V8 reserved but did not use. Thus a router can need a cap above its peak RSS: `shared`, `shared-all` and `gaps` stopped at 512 MB with a peak RSS of 220 to 345 MB. The floor is for these routers.
// After the route, the process writes its peak RSS, its heap and its route hash.
// The gate fails when a process stops with an error, or when a peak RSS is more than its budget: the measured peak RSS times `margin`, and at least `floorMb`.
// A router with no measure in the budget file runs with the cap `measureCapMb` and does not fail the gate. Thus its first run gives the measure.
//
// One process: `node --max-old-space-size=<MB> scripts/heap.ts --router <name> [--fixture <file>] [--out <file>]` routes once and appends one row to `--out`.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { getHeapStatistics } from "node:v8";
import { gunzipSync } from "node:zlib";
import { asRouter, getStrategy, highwayRouterStrategy, routePortfolio, routerStrategies, STRATEGIES, type Graph, type Result, type Strategy } from "../src/index.ts";
import { routeHash } from "./xplat.ts";

/** The budget file: the measures of a CI run, and the rules of the caps. */
interface Budgets {
  /** The CI run of the measures. */
  readonly run: string;
  readonly margin: number;
  readonly floorMb: number;
  readonly measureCapMb: number;
  /** The measures of each router: its peak RSS and its committed heap after the route, in MB. The heap is for information only. A router with `null` has no measure yet. */
  readonly routers: Readonly<Record<string, { readonly rssMb: number; readonly heapMb: number } | null>>;
}

/** One row of a process. */
interface Row {
  readonly router: string;
  readonly ms: number;
  readonly rssMb: number;
  readonly heapMb: number;
  readonly usedMb: number;
  /** The route hash of `scripts/xplat.ts`. Two equal hashes before and after a change show that the change keeps the output. */
  readonly hash: string;
}

const mb = (bytes: number): number => Math.round(bytes / 2 ** 20);
const opt = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/** This function routes the graph once with a router of the joint bench, with its default options. */
function route(name: string, graph: Graph): Result {
  if (name === "portfolio") return routePortfolio(graph).result;
  const registered = (routerStrategies as unknown as Readonly<Record<string, Strategy<"router", object> | undefined>>)[name];
  const strategy = registered ?? highwayRouterStrategy(getStrategy(STRATEGIES, "highway", name) as Strategy<"highway", object>);
  return asRouter(strategy).route(graph);
}

/** This function routes the fixture with one router in this process, and appends its row to `out`. */
function one(name: string, fixture: string, out: string): void {
  const bytes = readFileSync(fixture);
  const doc = JSON.parse((fixture.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8")) as { graph: Graph };
  const t0 = performance.now();
  const result = route(name, doc.graph);
  const ms = Math.round(performance.now() - t0);
  // V8 can give back the heap of a peak before the route ends, so `total_heap_size` after the route can be much less than the peak. The gate reads the peak RSS.
  const heap = getHeapStatistics();
  const row: Row = { router: name, ms, rssMb: mb(process.resourceUsage().maxRSS * 1024), heapMb: mb(heap.total_heap_size), usedMb: mb(heap.used_heap_size), hash: routeHash(result) };
  appendFileSync(out, JSON.stringify(row) + "\n");
}

/** This function runs each router of the budget file in its own process, and gives the rows of the summary and the count of the breaks. */
function gate(budgets: Budgets, fixture: string, out: string): number {
  const lines = [`### Heap gate (HEAP-GATE)`, "", `The measures come from run ${budgets.run}. The margin is ${budgets.margin}.`, "", "| Router | Cap (MB) | Peak RSS (MB) | Budget RSS (MB) | Heap (MB) | ms | Route hash | Result |", "|---|---:|---:|---:|---:|---:|---|---|"];
  let breaks = 0;
  for (const [name, measure] of Object.entries(budgets.routers)) {
    const cap = measure === null ? budgets.measureCapMb : Math.max(budgets.floorMb, Math.ceil(measure.rssMb * budgets.margin));
    const tmp = join(tmpdir(), `heap-${process.pid}-${name}.jsonl`);
    rmSync(tmp, { force: true });
    let error = "";
    try {
      execFileSync(process.execPath, [`--max-old-space-size=${cap}`, here("./heap.ts"), "--router", name, "--fixture", fixture, "--out", tmp], { stdio: ["ignore", "inherit", "inherit"] });
    } catch (e) {
      error = `stopped (${(e as { status?: number }).status ?? "signal"})`;
    }
    const row = existsSync(tmp) ? (JSON.parse(readFileSync(tmp, "utf8").trim()) as Row) : undefined;
    rmSync(tmp, { force: true });
    if (row !== undefined) appendFileSync(out, JSON.stringify({ ...row, cap }) + "\n");
    const budgetRss = measure === null ? undefined : Math.max(budgets.floorMb, Math.ceil(measure.rssMb * budgets.margin));
    let result = "pass";
    if (measure === null) result = error === "" ? "measured" : `measure ${error}`;
    else if (error !== "" || row === undefined) result = `fail: ${error || "no row"}`;
    else if (row.rssMb > budgetRss!) result = `fail: the peak RSS is above the budget`;
    if (result.startsWith("fail")) breaks++;
    lines.push(`| \`${name}\` | ${cap} | ${row?.rssMb ?? ""} | ${budgetRss ?? ""} | ${row?.heapMb ?? ""} | ${row?.ms ?? ""} | \`${row?.hash.slice(0, 16) ?? ""}\` | ${result} |`);
    console.log(`heap: ${name}: cap ${cap} MB, ${row === undefined ? "no row" : `peak RSS ${row.rssMb} MB, heap ${row.heapMb} MB, ${row.ms} ms`}, ${result}.`);
  }
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary !== undefined) appendFileSync(summary, lines.join("\n") + "\n");
  return breaks;
}

const fixture = resolve(opt("--fixture") ?? here("./data/scale/route-scale-fixture.json.gz"));
const out = resolve(opt("--out") ?? "heap.jsonl");
const router = opt("--router");
if (router !== undefined) {
  one(router, fixture, out);
} else {
  const budgets = JSON.parse(readFileSync(resolve(opt("--budgets") ?? here("./data/heap/budgets.json")), "utf8")) as Budgets;
  const breaks = gate(budgets, fixture, out);
  if (breaks > 0) {
    console.error(`heap: ${breaks} router(s) broke the heap gate.`);
    process.exit(1);
  }
}
