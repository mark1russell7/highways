// The dump of the near inputs of the geometric predicates (PREDICATE-CASES), for the exact predicates of the algebra role.
// The command line: `pnpm predicate:dump --set <set> --out <file.jsonl[.gz]> [--steps <a,b>] [--families <a,b>] [--max-lines <n>] [--no-opt-in] [--deadline-minutes <m>] [--summary <file.md>]`.
// A file name with `.gz` gets the lines with gzip. After `--deadline-minutes`, the script starts no more boards, and it exits with the code 1.
// The file of `--summary` gets a Markdown table of the sums of the total lines. The workflow adds it to the summary of the job.
// The workflow `Predicate dump` (.github/workflows/predicate-dump.yml) starts it in CI, one job for each board set. Start only `exact-v1` on a local machine.
//
// The script sets a recorder as the predicate sink (`src/predicate-sink.ts`). Then it runs the screen of each step on each board of the set.
// Thus the recorder sees each test of the predicates with a hook, also the tests of candidate segments in the routers.
// The file has one JSON line for each near test, then one total line for each board. A far test adds only to the counts.
// - A crossing test is near when |orient| <= 1e-9 * scale^2 for one of its 4 triples. The scale is the largest |coordinate| of the 4 points.
//   Its line: `{"case","fn","via","a":[x,y],"b","c","d","floatAnswer","n"}`. A pair with a common end also gets `"sharedEnd": true`.
// - A box test is near when the segment comes within 1e-6 of the outline of the box, or when its clipped length is within 1e-6 of `eps`.
//   Its line: `{"case","fn","via","a","b","box":{x,y,w,h},"eps","floatAnswer","n"}`. The function `geom.segmentHitsRect` gives `"rect":[x0,y0,x1,y1]` in place of `box`.
// - A test of the nearest centre is near when the two nearest centres have distances within 1e-9 * scale of each other.
//   Its line: `{"case","fn","via","p","c1","c2","i1","i2","floatAnswer","n"}`.
// - The total line: `{"case","totalSegmentPairs","totalBoxTests","totalNearestTests","nearSegmentPairs","nearSharedEnd",`
//   `"nearBoxTests","nearNearestTests","lines","tests","near"}`. A board with a step that threw also gets `errors`.
//   The field `tests` gives the count of each `fn`, and `near` gives the near count of each `fn`.
// The script writes each near input one time for each board. The field `n` counts the repeats of the line on the board.
// The field `via` is the file and the line of the caller of the predicate, at the first test of the line.
// A board with more than `--max-lines` lines (default 200 000) gets no more new lines. Its counts continue, and its total line gets `"truncated": true`.
import { closeSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { CASES } from "../src/cases.ts";
import { FIXTURES, makeFixture } from "../src/fixtures.ts";
import type { Point } from "../src/geom.ts";
import type { Graph } from "../src/model.ts";
import { setPredicateSink, type PredicateSink } from "../src/predicate-sink.ts";
import { adamStrategy, annealingStrategy, attractionStrategy, canalStrategy, nudgeStrategy, repelStrategy, rerouteStrategy, springsStrategy, tightStrategy } from "../src/routers/index.ts";
import type { Strategy } from "../src/strategies/model.ts";
import { graphInput, screen, SCREEN_SETS, SCREEN_STEPS, screenInputs, type LayoutInput, type ScreenSet, type ScreenStep } from "../src/bench/screen/index.ts";

const SCRIPT = fileURLToPath(import.meta.url);
/** The dense board of ROUTE-SCALE: 1 000 boxes and 4 000 edges (`data/scale/README.md`). */
const DENSE_BOARD = resolve(SCRIPT, "../data/scale/route-scale-fixture.json.gz");

/** The relative tolerance of a near orientation: |orient| <= `ORIENT_NEAR` * scale^2. */
export const ORIENT_NEAR = 1e-9;
/** The distance of a near box test: the segment is within this distance of the outline of the box. */
export const BOX_NEAR = 1e-6;
/** The relative tolerance of a near tie of the nearest centre: the gap of the two distances is at most `TIE_NEAR` * scale. */
export const TIE_NEAR = 1e-9;
/** The default limit of the near lines of one board. */
export const MAX_LINES = 200_000;
/**
 * The opt-in routers of `src/routers`. The step `router` of the dump runs them with the built-in routers, because some of them have their own copy of a predicate.
 * The router `portfolio` is not in the list, because it runs the built-in routers again.
 */
export const OPT_IN_ROUTERS: readonly Strategy<"router">[] = [
  adamStrategy,
  annealingStrategy,
  attractionStrategy,
  canalStrategy,
  nudgeStrategy,
  repelStrategy,
  rerouteStrategy,
  springsStrategy,
  tightStrategy,
] as readonly Strategy<"router">[];

const orient = (a: Point, b: Point, c: Point): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** This function tells if a crossing test of the segments `ab` and `cd` is near: one of its 4 orientations is near 0. */
export function crossIsNear(a: Point, b: Point, c: Point, d: Point): boolean {
  const s = Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y), Math.abs(c.x), Math.abs(c.y), Math.abs(d.x), Math.abs(d.y));
  const tol = ORIENT_NEAR * s * s;
  return Math.abs(orient(c, d, a)) <= tol || Math.abs(orient(c, d, b)) <= tol || Math.abs(orient(a, b, c)) <= tol || Math.abs(orient(a, b, d)) <= tol;
}

/**
 * This function gives the depth of the deepest point of the segment `ab` in the box from (`x0`, `y0`) to (`x1`, `y1`).
 * The depth of a point is the least of its 4 distances to the lines of the sides, with a minus sign outside the box.
 * Thus a negative depth is minus the distance of the segment to the box, in the max norm.
 */
export function segmentDepth(a: Point, b: Point, x0: number, y0: number, x1: number, y1: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // The 4 depths are linear in t: p[i] + q[i] t.
  const p = [a.x - x0, x1 - a.x, a.y - y0, y1 - a.y];
  const q = [dx, -dx, dy, -dy];
  const depth = (t: number): number => Math.min(p[0]! + q[0]! * t, p[1]! + q[1]! * t, p[2]! + q[2]! * t, p[3]! + q[3]! * t);
  // The least of linear functions is concave, so its largest value is at an end or where two of the lines meet.
  let best = Math.max(depth(0), depth(1));
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++) {
      if (q[i] === q[j]) continue;
      const t = (p[j]! - p[i]!) / (q[i]! - q[j]!);
      if (t > 0 && t < 1) best = Math.max(best, depth(t));
    }
  return best;
}

/** This function gives the length of the part of the segment `ab` in the box, with the clip of `segmentHitsRect`. A segment outside the box gives 0. */
export function clipLength(a: Point, b: Point, x0: number, y0: number, x1: number, y1: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q, lo, hi] of [
    [a.x, dx, x0, x1],
    [a.y, dy, y0, y1],
  ] as const) {
    if (q === 0) {
      if (p <= lo || p >= hi) return 0;
      continue;
    }
    const ta = (lo - p) / q;
    const tb = (hi - p) / q;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return 0;
  }
  return (t1 - t0) * Math.sqrt(dx * dx + dy * dy);
}

/**
 * This function tells if a box test is near. A test is near when the segment comes within `BOX_NEAR` of the outline of the box.
 * A test is also near when the clipped length of the segment is within `BOX_NEAR` of `eps`.
 */
export function boxIsNear(a: Point, b: Point, x0: number, y0: number, x1: number, y1: number, eps: number): boolean {
  const depth = segmentDepth(a, b, x0, y0, x1, y1);
  if (Math.abs(depth) <= BOX_NEAR) return true;
  return depth > BOX_NEAR && Math.abs(clipLength(a, b, x0, y0, x1, y1) - eps) <= BOX_NEAR;
}

/** This function gives the indices of the two nearest centres of `p`, with their distances, or `undefined` for fewer than 2 centres. */
export function twoNearest(p: Point, centres: readonly Point[]): { i1: number; i2: number; d1: number; d2: number } | undefined {
  if (centres.length < 2) return undefined;
  let i1 = -1;
  let i2 = -1;
  let d1 = Infinity;
  let d2 = Infinity;
  centres.forEach((c, i) => {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < d1) [i2, d2, i1, d1] = [i1, d1, i, d];
    else if (d < d2) [i2, d2] = [i, d];
  });
  return { i1, i2, d1, d2 };
}

const xy = (p: Point): [number, number] => [p.x, p.y];

const same = (p: Point, q: Point): boolean => p.x === q.x && p.y === q.y;

/** This function tells if an end of the segment `ab` is an end of the segment `cd`. Then an orientation is exactly 0 in floats too. */
export function sharesEnd(a: Point, b: Point, c: Point, d: Point): boolean {
  return same(a, c) || same(a, d) || same(b, c) || same(b, d);
}

/** This function gives the caller of a predicate as `<file>:<line>`, from the stack. It skips the frames of the recorder and of the predicate. */
function callerOf(): string | undefined {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 12;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;
  const frames = stack
    .split("\n")
    .slice(1)
    .flatMap((line) => {
      const m = /\(?([^()\s]+?):(\d+):\d+\)?\s*$/.exec(line.trim());
      return m ? [{ file: m[1]!.replace(/\\/g, "/"), line: m[2]! }] : [];
    })
    .filter((f) => !f.file.endsWith("/predicate-dump.ts") && !f.file.endsWith("/predicate-sink.ts"));
  // The first frame is the predicate. The second frame is its caller.
  const f = frames[1];
  if (!f) return undefined;
  const at = f.file.lastIndexOf("/packages/core/");
  return `${at >= 0 ? f.file.slice(at + "/packages/core/".length) : f.file.slice(f.file.lastIndexOf("/") + 1)}:${f.line}`;
}

/** The counts of one board. */
interface BoardCounts {
  pairs: number;
  boxes: number;
  nearest: number;
  nearPairs: number;
  nearShared: number;
  nearBoxes: number;
  nearNearest: number;
  readonly tests: Map<string, number>;
  readonly near: Map<string, number>;
}

const add = (m: Map<string, number>, k: string): void => {
  m.set(k, (m.get(k) ?? 0) + 1);
};

/**
 * The recorder of the predicate tests of the boards. `begin` starts a board, and `end` gives the lines of the board.
 * It implements `PredicateSink`, so `setPredicateSink` can set it.
 */
export class PredicateRecorder implements PredicateSink {
  private board = "";
  private counts: BoardCounts = PredicateRecorder.empty();
  private lines = new Map<string, Record<string, unknown> & { n: number }>();
  private truncated = false;

  private readonly maxLines: number;

  /** This constructor sets the limit of the near lines of one board. */
  constructor(maxLines: number = MAX_LINES) {
    this.maxLines = maxLines;
  }

  private static empty(): BoardCounts {
    return { pairs: 0, boxes: 0, nearest: 0, nearPairs: 0, nearShared: 0, nearBoxes: 0, nearNearest: 0, tests: new Map(), near: new Map() };
  }

  /** This function starts the board `name`. It clears the counts and the lines of the board before it. */
  begin(name: string): void {
    this.board = name;
    this.counts = PredicateRecorder.empty();
    this.lines = new Map();
    this.truncated = false;
  }

  private keep(key: string, make: () => Record<string, unknown>): void {
    const line = this.lines.get(key);
    if (line) {
      line.n++;
      return;
    }
    if (this.lines.size >= this.maxLines) {
      this.truncated = true;
      return;
    }
    const via = callerOf();
    this.lines.set(key, { case: this.board, ...make(), ...(via !== undefined ? { via } : {}), n: 1 });
  }

  /** This function records one crossing test. */
  cross(fn: string, a: Point, b: Point, c: Point, d: Point, answer: boolean): void {
    this.counts.pairs++;
    add(this.counts.tests, fn);
    if (!crossIsNear(a, b, c, d)) return;
    this.counts.nearPairs++;
    add(this.counts.near, fn);
    const shared = sharesEnd(a, b, c, d);
    if (shared) this.counts.nearShared++;
    this.keep(`${fn}|${a.x},${a.y},${b.x},${b.y},${c.x},${c.y},${d.x},${d.y}|${answer}`, () => ({ fn, a: xy(a), b: xy(b), c: xy(c), d: xy(d), floatAnswer: answer, ...(shared ? { sharedEnd: true } : {}) }));
  }

  /** This function records one box test. */
  box(fn: string, a: Point, b: Point, x0: number, y0: number, x1: number, y1: number, eps: number, answer: boolean, box?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }): void {
    this.counts.boxes++;
    add(this.counts.tests, fn);
    if (!boxIsNear(a, b, x0, y0, x1, y1, eps)) return;
    this.counts.nearBoxes++;
    add(this.counts.near, fn);
    const shape = box ? `${box.x},${box.y},${box.w},${box.h}` : `${x0},${y0},${x1},${y1}`;
    this.keep(`${fn}|${a.x},${a.y},${b.x},${b.y}|${shape}|${eps}|${answer}`, () => ({
      fn,
      a: xy(a),
      b: xy(b),
      ...(box ? { box: { x: box.x, y: box.y, w: box.w, h: box.h } } : { rect: [x0, y0, x1, y1] }),
      eps,
      floatAnswer: answer,
    }));
  }

  /** This function records one test of the nearest centre. */
  nearest(fn: string, p: Point, centres: readonly Point[], answer: number): void {
    this.counts.nearest++;
    add(this.counts.tests, fn);
    const two = twoNearest(p, centres);
    if (!two) return;
    const c1 = centres[two.i1]!;
    const c2 = centres[two.i2]!;
    const s = Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(c1.x), Math.abs(c1.y), Math.abs(c2.x), Math.abs(c2.y));
    if (Math.abs(two.d2 - two.d1) > TIE_NEAR * s) return;
    this.counts.nearNearest++;
    add(this.counts.near, fn);
    this.keep(`${fn}|${p.x},${p.y},${c1.x},${c1.y},${c2.x},${c2.y}|${two.i1},${two.i2}|${answer}`, () => ({ fn, p: xy(p), c1: xy(c1), c2: xy(c2), i1: two.i1, i2: two.i2, floatAnswer: answer }));
  }

  /** This function gives the near lines of the board, then its total line, as JSON objects. */
  end(): Record<string, unknown>[] {
    const c = this.counts;
    const total = {
      case: this.board,
      totalSegmentPairs: c.pairs,
      totalBoxTests: c.boxes,
      totalNearestTests: c.nearest,
      nearSegmentPairs: c.nearPairs,
      nearSharedEnd: c.nearShared,
      nearBoxTests: c.nearBoxes,
      nearNearestTests: c.nearNearest,
      lines: this.lines.size,
      tests: Object.fromEntries([...c.tests].sort(([x], [y]) => x.localeCompare(y))),
      near: Object.fromEntries([...c.near].sort(([x], [y]) => x.localeCompare(y))),
      ...(this.truncated ? { truncated: true } : {}),
    };
    return [...this.lines.values(), total];
  }
}

/** A board set of the dump: its boards as screen inputs, and the steps of the screen on each board. */
export interface DumpSet {
  readonly id: string;
  readonly inputs: () => LayoutInput[];
  readonly steps: readonly ScreenStep[];
  /** With `true`, the step `router` also runs `OPT_IN_ROUTERS`. */
  readonly optIn: boolean;
}

/** This function gives a screen input of a board that is in no screen set. */
function boardInput(set: string, name: string, graph: Graph): LayoutInput {
  return graphInput(graph, { id: `${set}/${name}`, set, family: name, seed: 0, generator: null });
}

/**
 * The board sets of the dump. The 5 screen sets run each step of the screen.
 * The set `fixtures` has the fixtures of the benchmark up to 1 000 nodes (seed 0) and its 3 case boards.
 * The set `fixtures-large` has the fixture of 10 000 nodes, with the steps `router` and `group`, as the large parts of the workflow `Bench`.
 * The set `dense-board` has the dense board of ROUTE-SCALE, with the steps `router` and `highway`.
 * The step `router` of each set except `fixtures-large` and `dense-board` also runs `OPT_IN_ROUTERS`.
 */
export const DUMP_SETS: Readonly<Record<string, DumpSet>> = Object.fromEntries(
  ([
    ...Object.keys(SCREEN_SETS).map((id): DumpSet => ({ id, inputs: () => screenInputs(SCREEN_SETS[id]!), steps: SCREEN_STEPS, optIn: true })),
    {
      id: "fixtures",
      inputs: () => [
        ...FIXTURES.filter((f) => f.nodes <= 1000).map((f) => boardInput("fixtures", f.name, makeFixture(f))),
        ...CASES.map((c) => boardInput("fixtures", c.name, c.make())),
      ],
      steps: SCREEN_STEPS,
      optIn: true,
    },
    { id: "fixtures-large", inputs: () => FIXTURES.filter((f) => f.nodes === 10_000).map((f) => boardInput("fixtures-large", f.name, makeFixture(f))), steps: ["router", "group"], optIn: false },
    {
      id: "dense-board",
      inputs: () => [boardInput("dense-board", "route-scale", (JSON.parse(gunzipSync(readFileSync(DENSE_BOARD)).toString("utf8")) as { graph: Graph }).graph)],
      steps: ["router", "highway"],
      optIn: false,
    },
  ] satisfies DumpSet[]).map((s) => [s.id, s] as const),
);

/**
 * This function runs the screen of each step on one board. It gives the errors of the steps that threw. The recorder sees the tests.
 * With `optIn`, the step `router` also runs `OPT_IN_ROUTERS`.
 */
export function screenBoard(input: LayoutInput, steps: readonly ScreenStep[], optIn = false): string[] {
  const set: ScreenSet = { id: input.set, families: [] };
  const errors: string[] = [];
  for (const step of steps) {
    try {
      // The step `highway` runs without its base routers, because the step `router` runs them.
      screen(step, step === "router" && optIn ? OPT_IN_ROUTERS : [], { set, inputs: [input], ...(step === "highway" ? { baseRouters: [] } : {}) });
    } catch (e) {
      errors.push(`${step}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return errors;
}

/**
 * This function dumps the boards: for each input, it starts the board in the recorder and runs `run` with the sink set.
 * It gives the lines of each board to `write`, and one summary line of each board to `log`. The sink is `null` again at the end.
 * Before each board, it asks `stop`. When `stop` gives `true`, the function starts no more boards. It gives the count of the boards that it dumped.
 */
export function dumpBoards(
  inputs: readonly LayoutInput[],
  run: (input: LayoutInput) => readonly string[],
  write: (lines: readonly Record<string, unknown>[]) => void,
  options: { readonly maxLines?: number; readonly log?: (line: string) => void; readonly stop?: () => boolean } = {},
): number {
  const recorder = new PredicateRecorder(options.maxLines ?? MAX_LINES);
  let done = 0;
  for (const input of inputs) {
    if (options.stop?.() === true) break;
    recorder.begin(input.id);
    const start = Date.now();
    let errors: readonly string[];
    setPredicateSink(recorder);
    try {
      errors = run(input);
    } finally {
      setPredicateSink(null);
    }
    const lines = recorder.end();
    const total = lines[lines.length - 1]!;
    if (errors.length > 0) total["errors"] = errors;
    write(lines);
    options.log?.(
      `${input.id}: ${String(total["totalSegmentPairs"])} pairs (${String(total["nearSegmentPairs"])} near), ${String(total["totalBoxTests"])} box tests (${String(total["nearBoxTests"])} near), ` +
        `${String(total["lines"])} lines, ${((Date.now() - start) / 1000).toFixed(1)} s${errors.length > 0 ? `, errors: ${errors.join("; ")}` : ""}`,
    );
    done++;
  }
  return done;
}

/**
 * This function gives the Markdown summary of the total lines of a dump. The summary has the sums of the counts, and the tests of each `fn`.
 * It names the boards with `truncated` and the boards with `errors`.
 */
export function summaryText(set: string, totals: readonly Record<string, unknown>[], boards: number, seconds: number): string {
  const sum = (key: string): number => totals.reduce((s, t) => s + Number(t[key] ?? 0), 0);
  const byFn = new Map<string, { tests: number; near: number }>();
  for (const t of totals)
    for (const [kind, counts] of [
      ["tests", t["tests"]],
      ["near", t["near"]],
    ] as const)
      for (const [fn, n] of Object.entries((counts ?? {}) as Record<string, number>)) {
        const row = byFn.get(fn) ?? { tests: 0, near: 0 };
        row[kind] += n;
        byFn.set(fn, row);
      }
  const truncated = totals.filter((t) => t["truncated"] === true).map((t) => String(t["case"]));
  const failed = totals.filter((t) => t["errors"] !== undefined).map((t) => String(t["case"]));
  const names = (list: readonly string[]): string => (list.length === 0 ? "none" : list.slice(0, 10).join(", ") + (list.length > 10 ? `, and ${list.length - 10} more` : ""));
  return [
    `## Predicate dump of ${set}`,
    "",
    `${totals.length} of ${boards} boards in ${seconds.toFixed(0)} s.`,
    "",
    "| count | tests | near | near with a common end |",
    "|---|---:|---:|---:|",
    `| segment pairs | ${sum("totalSegmentPairs")} | ${sum("nearSegmentPairs")} | ${sum("nearSharedEnd")} |`,
    `| box tests | ${sum("totalBoxTests")} | ${sum("nearBoxTests")} | |`,
    `| nearest centre | ${sum("totalNearestTests")} | ${sum("nearNearestTests")} | |`,
    `| lines | | ${sum("lines")} | |`,
    "",
    "| fn | tests | near |",
    "|---|---:|---:|",
    ...[...byFn].sort(([x], [y]) => x.localeCompare(y)).map(([fn, r]) => `| ${fn} | ${r.tests} | ${r.near} |`),
    "",
    `Boards with truncated lines: ${names(truncated)}.`,
    "",
    `Boards with a step that threw: ${names(failed)}.`,
    "",
  ].join("\n");
}

const main = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(SCRIPT);
  } catch {
    return false;
  }
})();
if (main) {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const list = (name: string): string[] | undefined => opt(name)?.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
  const id = opt("--set");
  const set = id === undefined ? undefined : DUMP_SETS[id];
  if (!set) throw new Error(`--set needs one of ${Object.keys(DUMP_SETS).join(", ")}, not "${id ?? ""}".`);
  const out = opt("--out");
  if (out === undefined) throw new Error("--out needs the file of the lines.");
  const steps = (list("--steps") ?? set.steps) as ScreenStep[];
  for (const step of steps) if (!SCREEN_STEPS.includes(step)) throw new Error(`There is no step "${step}". The steps are ${SCREEN_STEPS.join(", ")}.`);
  const families = list("--families");
  const maxLines = Number(opt("--max-lines") ?? MAX_LINES);
  if (!Number.isInteger(maxLines) || maxLines < 0) throw new Error(`--max-lines needs an integer of 0 or more, not "${opt("--max-lines")}".`);
  const deadline = Number(opt("--deadline-minutes") ?? Infinity);
  if (!(deadline > 0)) throw new Error(`--deadline-minutes needs a number above 0, not "${opt("--deadline-minutes")}".`);
  const inputs = set.inputs().filter((i) => families?.includes(i.family) ?? true);
  const file = resolve(out);
  mkdirSync(dirname(file), { recursive: true });
  // A file name with `.gz` gets one gzip member for each board. The members of the file give one stream of lines.
  const gz = file.endsWith(".gz");
  const fd = openSync(file, "w");
  const start = Date.now();
  let done = 0;
  const totals: Record<string, unknown>[] = [];
  try {
    done = dumpBoards(
      inputs,
      (input) => screenBoard(input, steps, set.optIn && !args.includes("--no-opt-in")),
      (lines) => {
        totals.push(lines[lines.length - 1]!);
        const text = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
        if (gz) writeSync(fd, gzipSync(text));
        else writeSync(fd, text);
      },
      { maxLines, log: (line) => process.stderr.write(line + "\n"), stop: () => Date.now() - start > deadline * 60_000 },
    );
  } finally {
    closeSync(fd);
  }
  console.log(`${done} of ${inputs.length} boards of ${set.id}, steps ${steps.join(", ")}, in ${((Date.now() - start) / 1000).toFixed(1)} s: ${file}`);
  const summary = opt("--summary");
  if (summary !== undefined) writeFileSync(resolve(summary), summaryText(set.id, totals, inputs.length, (Date.now() - start) / 1000));
  // A dump that stopped at its deadline is not complete, so the script fails. Its file keeps the boards that it dumped.
  if (done < inputs.length) {
    console.log(`The deadline of ${deadline} min stopped the dump. The boards from ${inputs[done]!.id} on are not in the file.`);
    process.exitCode = 1;
  }
}
