// The time of a full crossing count against the sample (CROSSINGS-LIMIT). This run only reports: it is not a gate.
// One job takes a fresh process for each arm, each input and each round, with an A/A arm of the full count (MEASURE-ISOLATE).
// The runs are cold, with no warm-up, because a row of the benchmark counts once in its process.
//
// The line of the read (fixed before the first result): a full count costs when its median is 30 s or over.
// The inputs are the 18 rows of `docs/research/bench/bench.json` that read an estimate, and `straight` and `plugs` on `huge-clustered`.
// The huge rows have their own run with fewer rounds, and the record is complete for the 18 rows before that run starts.
//
// `node packages/core/scripts/crossings-limit.ts --rounds 5 --huge-rounds 2 --out out/join-cost` writes `out/join-cost.json` and `out/join-cost.md`.
// The option `--only <board>` keeps the rows of one board, and `--huge-rounds 0` leaves out the largest board.
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { crossingAngles, drawnSegments, type DrawnSegment } from "../src/bench/measures/routes.ts";
import { countCrossings } from "../src/bench/quality.ts";
import { FIXTURES, makeFixture } from "../src/fixtures.ts";
import { ROUTERS } from "../src/routers/index.ts";
import { SAMPLE_LIMIT } from "./crossings-sample-rows.ts";
import { measureIsolated, runChild, type PairedReport } from "./gates/paired.ts";

/** The schema of the record. */
export const SCHEMA = "crossings-limit/1";
/** A full count costs when its median is at this time or over it, in milliseconds. */
export const COST_LINE_MS = 30_000;

/** One input of the read: a router on a board. */
export interface LimitCell {
  readonly board: string;
  readonly router: string;
}

/** The 18 rows of the benchmark that read an estimate. */
export const BENCH_CELLS: readonly LimitCell[] = [
  { board: "grid-400", router: "corners-smooth" },
  ...["mid-uniform", "mid-clustered", "mid-hubs", "mid-fanout"].flatMap((board) => ["plugs", "corners-smooth"].map((router) => ({ board, router }))),
  ...ROUTERS.map((r) => ({ board: "large-clustered", router: r.name })),
];

/** The rows of the largest board of the fixtures. Only the routers with the cheapest routes run on it. */
export const HUGE_CELLS: readonly LimitCell[] = ["straight", "plugs"].map((router) => ({ board: "huge-clustered", router }));

/** This function gives the id of a cell, which is also the name of its file of segments. */
export const cellId = (cell: LimitCell): string => `${cell.board}.${cell.router}`;

/** This function writes segments as four numbers each. */
export function saveSegments(path: string, segments: readonly DrawnSegment[]): void {
  const values = new Float64Array(segments.length * 4);
  segments.forEach(([a, b], i) => values.set([a.x, a.y, b.x, b.y], i * 4));
  writeFileSync(path, Buffer.from(values.buffer));
}

/** This function reads the segments of `saveSegments`. */
export function loadSegments(path: string): DrawnSegment[] {
  const bytes = readFileSync(path);
  const values = new Float64Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 8);
  const segments: DrawnSegment[] = [];
  for (let i = 0; i < values.length; i += 4) segments.push([{ x: values[i]!, y: values[i + 1]! }, { x: values[i + 2]!, y: values[i + 3]! }]);
  return segments;
}

/** The arms of the read. The arm `full` is the base. */
const ARMS: Readonly<Record<string, (segments: readonly DrawnSegment[]) => unknown>> = {
  full: (segments) => countCrossings(segments, { limit: Infinity }),
  sample: (segments) => countCrossings(segments, { limit: SAMPLE_LIMIT }),
  "angles-full": (segments) => crossingAngles(segments, { limit: Infinity }),
};

/** One row of the record: the counts of a cell, with no time. */
export interface LimitRow extends LimitCell {
  readonly nodes: number;
  readonly edges: number;
  readonly segments: number;
  /** The time of one route in the parent process, in milliseconds. It is context, not a paired time. */
  readonly routeMs: number;
  /** The count of each crossing of the drawn segments. */
  readonly full: number;
  /** The estimate of the sample at the limit of 20 000 segments. */
  readonly estimate: number;
  /** This value is true when the full count of `crossingAngles` equals `full`. */
  readonly anglesEqual: boolean;
}

/** This function routes one cell, writes its segments and reads its counts. */
export function limitRow(cell: LimitCell, dir?: string): LimitRow {
  const graph = makeFixture(FIXTURES.find((f) => f.name === cell.board)!);
  const router = ROUTERS.find((r) => r.name === cell.router)!;
  const start = performance.now();
  const { routes } = router.route(graph);
  const routeMs = Math.round(performance.now() - start);
  const segments = drawnSegments(routes);
  if (dir !== undefined) saveSegments(join(dir, `${cellId(cell)}.bin`), segments);
  const [full] = countCrossings(segments, { limit: Infinity });
  const [estimate] = countCrossings(segments, { limit: SAMPLE_LIMIT });
  return {
    ...cell,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    segments: segments.length,
    routeMs,
    full,
    estimate,
    anglesEqual: crossingAngles(segments, { limit: Infinity }).crossings === full,
  };
}

/** This function writes the table of a part of the read. */
function table(title: string, rows: readonly LimitRow[], report: PairedReport | undefined): string[] {
  const lines = [`## ${title}`, "", "| Board | Router | Segments | Crossings | Route ms (one run) | Full ms | Sample ms | Angles ms | A/A ratio | Peak MB of full |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (const row of rows) {
    const input = report?.inputs.find((i) => i.id === cellId(row));
    const ms = (arm: string): string => (input?.median[arm] === undefined ? "none" : input.median[arm].toFixed(1));
    const aa = input?.ratio["full~aa"];
    const peak = input?.peakRss?.full;
    lines.push(`| ${row.board} | ${row.router} | ${row.segments} | ${row.full} | ${row.routeMs} | ${ms("full")} | ${ms("sample")} | ${ms("angles-full")} | ${aa === undefined ? "none" : aa.toFixed(3)} | ${peak === undefined ? "none" : Math.round(peak / 1e6)} |`);
  }
  return [...lines, ""];
}

/** This function starts the run of one part, or it gives the reason that the part stopped. */
async function timed(cells: readonly LimitCell[], dir: string, rounds: number): Promise<{ report?: PairedReport; error?: string }> {
  const script = fileURLToPath(import.meta.url);
  const arms = Object.keys(ARMS).map((id) => ({ id, command: [process.execPath, ...process.execArgv, script, "--time-child", id, "--dir", dir] }));
  try {
    const report = await measureIsolated({ arms, inputs: cells.map((c) => ({ id: cellId(c), group: c.board })), repeats: rounds, warmup: 0, mode: "fresh" });
    return { report };
  } catch (error) {
    return { error: String(error) };
  }
}

/** This function starts the parent of the read. */
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { rounds: { type: "string", default: "5" }, "huge-rounds": { type: "string", default: "2" }, out: { type: "string", default: "out/join-cost" }, only: { type: "string" } } });
  const out = values.out;
  mkdirSync(dirname(out), { recursive: true });
  const dir = mkdtempSync(join(tmpdir(), "crossings-limit-"));
  const cells = BENCH_CELLS.filter((c) => values.only === undefined || c.board === values.only);
  const rows = cells.map((cell) => {
    const row = limitRow(cell, dir);
    console.error(`${cellId(cell)}: ${row.segments} segments, ${row.full} crossings, route ${row.routeMs} ms`);
    return row;
  });
  const bench = await timed(cells, dir, Number(values.rounds));
  const write = (hugeRows: readonly LimitRow[], huge: { report?: PairedReport; error?: string } | undefined): void => {
    writeFileSync(`${out}.json`, JSON.stringify({ schema: SCHEMA, costLineMs: COST_LINE_MS, sampleLimit: SAMPLE_LIMIT, rows, hugeRows, bench, huge }, null, 1) + "\n");
    const lines = [...table("The 18 rows of the benchmark", rows, bench.report), ...table("The largest board", hugeRows, huge?.report)];
    if (bench.error !== undefined) lines.push(`The part of the 18 rows stopped: ${bench.error}`, "");
    if (huge?.error !== undefined) lines.push(`The part of the largest board stopped: ${huge.error}`, "");
    writeFileSync(`${out}.md`, lines.join("\n"));
  };
  write([], undefined);
  if (Number(values["huge-rounds"]) === 0) return;
  const hugeRows = HUGE_CELLS.map((cell) => {
    const row = limitRow(cell, dir);
    console.error(`${cellId(cell)}: ${row.segments} segments, ${row.full} crossings, route ${row.routeMs} ms`);
    return row;
  });
  write(hugeRows, undefined);
  write(hugeRows, await timed(HUGE_CELLS, dir, Number(values["huge-rounds"])));
}

const at = process.argv.indexOf("--time-child");
if (at >= 0) {
  // A child takes one arm on one input, and then it stops. The write to the file descriptor 1 ends before the exit.
  const arm = ARMS[process.argv[at + 1]!];
  if (arm === undefined) throw new Error(`There is no arm "${process.argv[at + 1]}".`);
  const dir = process.argv[process.argv.indexOf("--dir") + 1]!;
  runChild((input) => loadSegments(join(dir, `${input}.bin`)), arm, { write: (line) => writeSync(1, line + "\n") });
  process.exit(0);
} else if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  await main();
}
